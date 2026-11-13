import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { ImapFlow } from "npm:imapflow";
import { readImapPassword } from "../_shared/credentials.ts";
import { addCleanUsage, getServiceClient } from "../_shared/billing.ts";
import { classifyEmail, parseListHeaders, parseSender } from "../_shared/classify.ts";

// Automatic cleanup (Pro yearly). Called only by the database scheduler
// (dispatch_auto_clean, every 10 minutes), once per person whose cleanup is
// due, with a secret header the database checks. Never called by the app.
//
// What it does, on the person's real mailbox:
//   1. Finds inbox emails that are unread and at least 7 days old.
//   2. Sorts them with the same rules as a scan (_shared/classify.ts).
//   3. Moves the junk (clutter and bundles) to the Archive folder. Anything
//      sorted as important - receipts, invoices, security codes, personal
//      mail, deliveries - stays where it is.
// Big backlogs are worked through BATCH_SIZE emails per call (the same bound
// as a scan, for the edge function's CPU and memory limits); the scheduler
// calls again ~10 minutes later until the backlog is gone.

const imapHosts: Record<string, { host: string; port: number }> = {
  gmail: { host: "imap.gmail.com", port: 993 },
  outlook: { host: "outlook.office365.com", port: 993 },
  yahoo: { host: "imap.mail.yahoo.com", port: 993 },
  aol: { host: "imap.aol.com", port: 993 },
  icloud: { host: "imap.mail.me.com", port: 993 },
};

const MIN_AGE_DAYS = 7;
const BATCH_SIZE = 150;
const INTERVAL_DAYS: Record<string, number> = { weekly: 7, biweekly: 14 };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Same folder choice as imap-apply-actions: the server's Archive folder, else
// Gmail's All Mail (moving there just removes the Inbox label), else a folder
// named Archive, created if needed.
async function resolveArchiveMailbox(client: ImapFlow): Promise<string> {
  const boxes = await client.list();
  const special =
    boxes.find((b) => b.specialUse === "\\Archive") ?? boxes.find((b) => b.specialUse === "\\All");
  if (special) return special.path;
  const named = boxes.find((b) => b.path.toLowerCase() === "archive");
  if (named) return named.path;
  await client.mailboxCreate("Archive");
  return "Archive";
}

// Turns mail-server errors into a short reason the Account page can show.
function describeError(err: unknown): string {
  const e = err as { authenticationFailed?: boolean; responseText?: string; message?: string };
  if (e?.authenticationFailed || /auth|credential|password|login/i.test(e?.responseText ?? e?.message ?? "")) {
    return "mailbox_sign_in_failed";
  }
  if (/no imap credentials|not connected/i.test(e?.message ?? "")) return "mailbox_not_connected";
  return "mail_server_error";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const service = getServiceClient();

  const secret = req.headers.get("X-Auto-Clean-Secret") ?? "";
  const { data: valid, error: verifyError } = await service.rpc("verify_auto_clean_secret", { p_secret: secret });
  if (verifyError || valid !== true) return json({ error: "Forbidden" }, 403);

  let userId: string;
  try {
    userId = String(((await req.json()) as { user_id?: string }).user_id ?? "");
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "Bad request" }, 400);

  const { data: settings } = await service
    .from("auto_clean_settings")
    .select("enabled, frequency, catching_up, last_run_cleaned, total_cleaned")
    .eq("user_id", userId)
    .maybeSingle();
  if (!settings?.enabled) return json({ skipped: "disabled" });

  const { data: yearly } = await service.rpc("has_yearly_plan", { p_user_id: userId });
  if (yearly !== true) {
    // Plan changed since the scheduler picked them; try again tomorrow, and
    // the scheduler keeps skipping them until they're back on yearly.
    await service
      .from("auto_clean_settings")
      .update({ next_run_at: new Date(Date.now() + 86_400_000).toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    return json({ skipped: "not_yearly" });
  }

  const intervalMs = (INTERVAL_DAYS[settings.frequency] ?? 7) * 86_400_000;
  const previouslyCleaned = settings.catching_up ? settings.last_run_cleaned ?? 0 : 0;

  const finish = async (fields: Record<string, unknown>) => {
    const { error } = await service
      .from("auto_clean_settings")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) console.error("auto-clean: failed to save run result:", error);
  };

  let processed = 0;
  try {
    const { data: userData } = await service
      .from("users")
      .select("email_provider, connected_account_id, encrypted_password")
      .eq("id", userId)
      .maybeSingle();
    if (!userData?.connected_account_id || !userData?.encrypted_password) {
      throw new Error("No IMAP credentials found");
    }
    const server = imapHosts[userData.email_provider ?? ""];
    if (!server) throw new Error(`Unsupported provider: ${userData.email_provider}`);

    const password = await readImapPassword(service, userId, userData.encrypted_password);
    const client = new ImapFlow({
      host: server.host,
      port: server.port,
      secure: true,
      auth: { user: userData.connected_account_id, pass: password },
      logger: false,
      emitLogs: false,
    });

    await client.connect();
    let moreRemain = false;
    let toArchive: number[] = [];
    try {
      const archiveMailbox = await resolveArchiveMailbox(client);
      const lock = await client.getMailboxLock("INBOX");
      try {
        const cutoff = new Date(Date.now() - MIN_AGE_DAYS * 86_400_000);
        const found = ((await client.search({ seen: false, before: cutoff }, { uid: true })) || []) as number[];
        // Oldest first, so a backlog clears from the bottom of the inbox up.
        const candidates = [...found].sort((a, b) => a - b);
        const batch = candidates.slice(0, BATCH_SIZE);
        moreRemain = candidates.length > BATCH_SIZE;

        const messages: { uid: number; from: string; name: string; subject: string; attachment: boolean; listId: string | null }[] = [];
        if (batch.length > 0) {
          for await (const msg of client.fetch(batch, { envelope: true, uid: true, bodyStructure: true, flags: true, headers: true }, { uid: true })) {
            const flags = (msg as { flags?: Set<string> }).flags;
            if (flags instanceof Set && flags.has("\\Seen")) continue; // opened since the search
            const { email, name } = parseSender(msg.envelope);
            const bs = msg.bodyStructure as { childNodes?: { disposition?: string; type?: string }[] } | undefined;
            const attachment = Boolean(
              bs?.childNodes && bs.childNodes.length > 1 &&
                bs.childNodes.some((n) => n.disposition === "attachment" || (n.type ?? "").includes("application/")),
            );
            messages.push({
              uid: msg.uid,
              from: email,
              name: name || email,
              subject: msg.envelope?.subject || "(no subject)",
              attachment,
              listId: parseListHeaders(msg.headers).listId,
            });
          }
        }

        const senderCounts: Record<string, number> = {};
        for (const m of messages) senderCounts[m.from.toLowerCase()] = (senderCounts[m.from.toLowerCase()] ?? 0) + 1;

        toArchive = messages
          .filter((m) => {
            const { category } = classifyEmail(
              m.from, m.name, m.subject, m.subject.slice(0, 120), m.attachment, false,
              senderCounts[m.from.toLowerCase()] ?? 1, m.listId,
            );
            return category === "clutter" || category === "bundle";
          })
          .map((m) => m.uid);

        // Belt and braces: never move anything Eflow has already marked as a
        // receipt or invoice ("Paid & Verified") in this person's last scan.
        if (toArchive.length > 0) {
          const { data: protectedRows } = await service
            .from("emails")
            .select("email_id")
            .eq("user_id", userId)
            .eq("is_protected", true)
            .in("email_id", toArchive.map(String));
          const keep = new Set((protectedRows ?? []).map((r: { email_id: string }) => Number(r.email_id)));
          toArchive = toArchive.filter((uid) => !keep.has(uid));
        }

        for (let i = 0; i < toArchive.length; i += 50) {
          const chunk = toArchive.slice(i, i + 50);
          const moved = await client.messageMove(chunk, archiveMailbox, { uid: true });
          if (!moved) continue;
          processed += chunk.length;
          await service
            .from("emails")
            .update({ is_archived: true })
            .eq("user_id", userId)
            .in("email_id", chunk.map(String));
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
    }

    if (processed > 0) await addCleanUsage(userId, processed);

    await finish({
      last_run_at: new Date().toISOString(),
      last_run_cleaned: previouslyCleaned + processed,
      last_run_status: "ok",
      last_error: null,
      total_cleaned: (settings.total_cleaned ?? 0) + processed,
      catching_up: moreRemain,
      next_run_at: new Date(moreRemain ? Date.now() : Date.now() + intervalMs).toISOString(),
    });

    return json({ ok: true, archived: processed, more: moreRemain });
  } catch (err) {
    console.error("auto-clean failed:", err);
    if (processed > 0) await addCleanUsage(userId, processed);
    // Try again in a day rather than waiting a full week, in case it was a
    // passing mail-server problem. A wrong or revoked password keeps failing
    // until the person reconnects; the Account page tells them.
    await finish({
      last_run_at: new Date().toISOString(),
      last_run_cleaned: previouslyCleaned + processed,
      last_run_status: "failed",
      last_error: describeError(err),
      total_cleaned: (settings.total_cleaned ?? 0) + processed,
      catching_up: false,
      next_run_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    return json({ ok: false, error: describeError(err) });
  }
});
