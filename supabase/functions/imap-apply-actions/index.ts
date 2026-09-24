import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { ImapFlow } from "npm:imapflow";
import { readImapPassword } from "../_shared/credentials.ts";
import {
  FREE_MONTHLY_LIMIT,
  addCleanUsage,
  getSubscriptionStatus,
  isProStatus,
  reserveCleanQuota,
} from "../_shared/billing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const imapHosts: Record<string, { host: string; port: number }> = {
  gmail: { host: "imap.gmail.com", port: 993 },
  outlook: { host: "outlook.office365.com", port: 993 },
  yahoo: { host: "imap.mail.yahoo.com", port: 993 },
  icloud: { host: "imap.mail.me.com", port: 993 },
};

type Action = "delete" | "archive" | "mark_read";

const DB_UPDATE_FOR_ACTION: Record<Action, Record<string, boolean>> = {
  delete: { is_deleted: true },
  archive: { is_archived: true },
  mark_read: { is_read: true },
};

// Escapes LIKE wildcards so an address like "first_last@x.com" matches only
// itself when compared case-insensitively with ilike.
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

// Looks up the IMAP UIDs of every still-visible email matching a category,
// bundle or sender. Paginated because PostgREST caps a single select at 1000 rows, and a
// cleanup of a large inbox routinely targets several thousand emails.
async function selectTargetIds(
  supabase: SupabaseClient,
  userId: string,
  filter: { categories?: string[]; bundleId?: string; sender?: string; excludeProtected?: boolean },
): Promise<string[]> {
  const PAGE = 1000;
  const ids: string[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from("emails")
      .select("email_id")
      .eq("user_id", userId)
      .eq("is_deleted", false)
      .eq("is_archived", false);
    if (filter.categories) query = query.in("category", filter.categories);
    if (filter.bundleId) query = query.eq("bundle_id", filter.bundleId);
    if (filter.sender) query = query.ilike("sender", escapeLike(filter.sender));
    if (filter.excludeProtected) query = query.eq("is_protected", false);

    const { data, error } = await query.order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to look up emails: ${error.message}`);
    if (!data || data.length === 0) break;

    ids.push(...data.map((e: { email_id: string }) => e.email_id));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return ids;
}

// Returns which of the given UIDs belong to protected (Paid & Verified) emails.
async function selectProtectedIds(
  supabase: SupabaseClient,
  userId: string,
  emailIds: string[],
): Promise<Set<string>> {
  const protectedIds = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < emailIds.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("emails")
      .select("email_id")
      .eq("user_id", userId)
      .eq("is_protected", true)
      .in("email_id", emailIds.slice(i, i + CHUNK));
    if (error) throw new Error(`Failed to check protected emails: ${error.message}`);
    for (const row of data ?? []) protectedIds.add(row.email_id);
  }
  return protectedIds;
}

// Finds where "archive" should move mail for this provider: the server's
// special-use Archive folder, else Gmail's All Mail (moving there just drops
// the Inbox label), else a folder named Archive - created if needed.
async function resolveArchiveMailbox(client: ImapFlow): Promise<string> {
  const boxes = await client.list();
  const special =
    boxes.find((b) => b.specialUse === "\\Archive") ??
    boxes.find((b) => b.specialUse === "\\All");
  if (special) return special.path;

  const named = boxes.find((b) => b.path.toLowerCase() === "archive");
  if (named) return named.path;

  await client.mailboxCreate("Archive");
  return "Archive";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) throw new Error("Invalid user");

    const { action, emailIds, category, bundleId, sender } = (await req.json()) as {
      action: Action;
      emailIds?: string[];
      category?: string | string[];
      bundleId?: string;
      sender?: string;
    };

    if (!DB_UPDATE_FOR_ACTION[action]) {
      throw new Error("A valid action (delete, archive, mark_read) is required");
    }

    // Bills and receipts ("Paid & Verified") are never archived or deleted,
    // whichever screen sent the request. Enforced here rather than in the UI
    // so no bulk action can sweep them up by accident.
    const excludeProtected = action !== "mark_read";

    let targetIds: string[];
    let protectedSkipped = 0;
    if (Array.isArray(emailIds)) {
      targetIds = emailIds.map(String);
      if (excludeProtected && targetIds.length > 0) {
        const protectedIds = await selectProtectedIds(supabase, user.id, targetIds);
        targetIds = targetIds.filter((id) => !protectedIds.has(id));
        protectedSkipped = emailIds.length - targetIds.length;
      }
    } else if (bundleId) {
      targetIds = await selectTargetIds(supabase, user.id, { bundleId, excludeProtected });
    } else if (sender) {
      targetIds = await selectTargetIds(supabase, user.id, { sender, excludeProtected });
    } else if (category) {
      targetIds = await selectTargetIds(supabase, user.id, {
        categories: Array.isArray(category) ? category : [category],
        excludeProtected,
      });
    } else {
      throw new Error("Specify emailIds, bundleId, sender or category");
    }

    if (targetIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, action, processed: 0, failed: 0, total: 0, protected_skipped: protectedSkipped }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: userData } = await supabase
      .from("users")
      .select("email_provider, connected_account_id, encrypted_password")
      .eq("id", user.id)
      .maybeSingle();

    if (!userData?.connected_account_id || !userData?.encrypted_password) {
      throw new Error("No IMAP credentials found. Please connect your email account first.");
    }

    const provider = userData.email_provider;
    if (!provider || !imapHosts[provider]) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const { host, port } = imapHosts[provider];
    const password = await readImapPassword(supabase, user.id, userData.encrypted_password);

    // Free plan: archiving/deleting counts towards a monthly quota. The whole
    // request is reserved up front (atomically, so parallel clean-ups can't
    // overshoot) and anything the mail server doesn't end up processing is
    // refunded below. Requests that don't fit are refused outright rather than
    // half-done, so the user never has to work out which emails were skipped.
    const countsTowardQuota = action !== "mark_read";
    const isPro = countsTowardQuota && isProStatus(await getSubscriptionStatus(user.id));
    let reserved = 0;
    if (countsTowardQuota && !isPro) {
      const { allowed, used } = await reserveCleanQuota(user.id, targetIds.length);
      if (!allowed) {
        const remaining = Math.max(FREE_MONTHLY_LIMIT - used, 0);
        return new Response(
          JSON.stringify({
            error: remaining === 0
              ? `You've cleaned ${FREE_MONTHLY_LIMIT} emails this month, the Free plan limit. Upgrade to Pro for unlimited cleaning.`
              : `This would clean ${targetIds.length.toLocaleString()} emails, but you have ${remaining.toLocaleString()} free cleans left this month. Upgrade to Pro for unlimited cleaning.`,
            code: "usage_limit",
            limit: FREE_MONTHLY_LIMIT,
            used,
            remaining,
            requested: targetIds.length,
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      reserved = targetIds.length;
    }

    let processed = 0;
    let failed = 0;

    try {
      const client = new ImapFlow({
        host,
        port,
        secure: true,
        auth: { user: userData.connected_account_id, pass: password },
        logger: false,
        emitLogs: false,
      });

      await client.connect();

      const archiveMailbox = action === "archive" ? await resolveArchiveMailbox(client) : null;
      const lock = await client.getMailboxLock("INBOX");

      try {
        // Work in chunks, and only mark an email as handled in the database once
        // the mail server confirmed it. If a chunk fails (or the function times
        // out part way), those emails stay visible so the user can retry, rather
        // than disappearing from Eflow while still sitting in their real inbox.
        const CHUNK = 100;
        for (let i = 0; i < targetIds.length; i += CHUNK) {
          const chunk = targetIds.slice(i, i + CHUNK);
          const uids = chunk.map((id) => parseInt(id, 10)).filter((u) => !isNaN(u));
          failed += chunk.length - uids.length;
          if (uids.length === 0) continue;

          let ok = false;
          try {
            if (action === "delete") {
              ok = await client.messageDelete(uids, { uid: true });
            } else if (action === "archive") {
              ok = Boolean(await client.messageMove(uids, archiveMailbox!, { uid: true }));
            } else {
              ok = await client.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
            }
          } catch (err) {
            console.error(`Batch ${action} error:`, err);
          }

          if (!ok) {
            failed += uids.length;
            continue;
          }

          const { error: dbError } = await supabase
            .from("emails")
            .update(DB_UPDATE_FOR_ACTION[action])
            .eq("user_id", user.id)
            .in("email_id", uids.map(String));
          if (dbError) console.error("Failed to record action in database:", dbError);

          processed += uids.length;
        }
      } finally {
        lock.release();
      }

      await client.logout();
    } finally {
      // Settle usage even if the mail server connection failed part way.
      if (reserved > 0) {
        await addCleanUsage(user.id, -(reserved - processed));
      } else if (countsTowardQuota) {
        await addCleanUsage(user.id, processed);
      }
    }

    return new Response(
      JSON.stringify({ success: true, action, processed, failed, total: targetIds.length, protected_skipped: protectedSkipped }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("IMAP apply actions error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Failed to apply actions" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
