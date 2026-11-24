import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { ImapFlow } from "npm:imapflow";
import { readImapPassword } from "../_shared/credentials.ts";
import { classifyEmail, parseListHeaders, parseSender } from "../_shared/classify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const imapHosts: Record<string, { host: string; port: number }> = {
  gmail: { host: "imap.gmail.com", port: 993 },
  outlook: { host: "outlook.office365.com", port: 993 },
  yahoo: { host: "imap.mail.yahoo.com", port: 993 },
  aol: { host: "imap.aol.com", port: 993 },
  icloud: { host: "imap.mail.me.com", port: 993 },
};

// Each invocation only fetches/classifies/inserts a bounded amount of mail.
// Supabase Edge Functions have hard limits (256MB memory, 2s CPU time, 150s wall
// clock on the free plan) and trying to pull an entire multi-thousand message
// mailbox in one call throws WORKER_RESOURCE_LIMIT and aborts with nothing saved.
// Progress (scan_remaining_uids / scan_total / scan_sender_counts) is persisted
// on the users row so the frontend can call this function repeatedly until
// `done: true`.
//
// Within one call, mail is fetched FETCH_CHUNK_SIZE messages at a time over the
// same mail-server connection, up to the batch size the app asks for (at most
// MAX_PER_CALL), and no new chunk starts after CALL_TIME_BUDGET_MS. Signing in
// to the mail server is the slowest step of a call, so doing up to three chunks
// per sign-in roughly halves a full scan. The app asks for smaller batches
// after a failed call, so a slow server still gets through.
const FETCH_CHUNK_SIZE = 150;
const MAX_PER_CALL = 450;
const CALL_TIME_BUDGET_MS = 10_000;

const hasSeenFlag = (flags: unknown) =>
  flags instanceof Set ? flags.has("\\Seen") : Array.isArray(flags) ? flags.includes("\\Seen") : false;

// Every email row Eflow already has for this user (from the last scan), for an
// update-only rescan. Paged: PostgREST caps a select at 1000 rows.
async function selectKnownEmails(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ email_id: string; sender: string; is_read: boolean }[]> {
  const PAGE = 1000;
  const rows: { email_id: string; sender: string; is_read: boolean }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("emails")
      .select("email_id, sender, is_read")
      .eq("user_id", userId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to read saved emails: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function updateInChunks(
  supabase: SupabaseClient,
  userId: string,
  ids: string[],
  apply: (ids: string[]) => PromiseLike<{ error: unknown }>,
) {
  for (let i = 0; i < ids.length; i += 500) {
    const { error } = await apply(ids.slice(i, i + 500));
    if (error) console.error("Rescan update failed:", error);
  }
}

async function selectAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  userId: string,
  category: string,
): Promise<T[]> {
  const PAGE = 1000;
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("user_id", userId)
      .eq("category", category)
      .range(from, from + PAGE - 1);

    if (error) {
      console.error(`Error paginating ${table}:`, error);
      break;
    }
    if (!data || data.length === 0) break;

    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return rows;
}

interface FetchedMessage {
  uid: number;
  subject: string;
  from: string;
  fromName: string;
  date: string;
  snippet: string;
  hasAttachment: boolean;
  isRead: boolean;
  listUnsubscribe: string | null;
  listUnsubscribePost: boolean;
  listId: string | null;
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

    const startedAt = Date.now();

    // Optional request options (older app versions send no body):
    // - batch: how many emails to fetch in this call (the app lowers it
    //   after a failed call).
    // - full: re-download and re-sort the whole inbox even when an
    //   update-only rescan is possible.
    const options = (await req.json().catch(() => ({}))) as { batch?: number; full?: boolean };
    const batchLimit = Math.max(
      50,
      Math.min(MAX_PER_CALL, Number.isFinite(options.batch) ? Math.floor(options.batch!) : MAX_PER_CALL),
    );

    const { data: userData } = await supabase
      .from("users")
      .select("email_provider, connected_account_id, encrypted_password, last_scan, last_uid_validity, scan_remaining_uids, scan_total, scan_uid_validity, scan_sender_counts, scan_mode")
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

    // A scan is "in progress" (resuming) when scan_remaining_uids is set from a
    // previous chunked call. UIDs (not sequence numbers) are used because
    // sequence numbers renumber as the mailbox changes mid-scan (new mail
    // arrives / gets expunged), which silently skips messages when a large
    // mailbox needs many chunked calls spread over several minutes.
    const isResuming = userData.scan_remaining_uids != null && userData.scan_total != null;

    const client = new ImapFlow({
      host,
      port,
      secure: true,
      auth: { user: userData.connected_account_id, pass: password },
      logger: false,
      emitLogs: false,
    });

    await client.connect();

    const lock = await client.getMailboxLock("INBOX");

    let totalMessages: number;
    let remainingUids: number[];
    let senderCounts: Record<string, number>;
    let mode: "full" | "update";
    let removed = 0;

    const currentStatus = await client.status("INBOX", { messages: true, uidNext: true, uidValidity: true });
    const uidValidity = ((currentStatus as { uidValidity?: bigint }).uidValidity as unknown as bigint) ?? 0n;

    if (isResuming && userData.scan_uid_validity != null && BigInt(userData.scan_uid_validity) === uidValidity) {
      totalMessages = userData.scan_total!;
      remainingUids = (userData.scan_remaining_uids as number[]) || [];
      senderCounts = (userData.scan_sender_counts as Record<string, number>) || {};
      mode = userData.scan_mode === "update" ? "update" : "full";
    } else {
      const allUids = ((await client.search({ all: true }, { uid: true })) || []) as number[];

      if (allUids.length === 0) {
        lock.release();
        await client.logout();

        await supabase.from("emails").delete().eq("user_id", user.id);
        await supabase.from("bundles").delete().eq("user_id", user.id);
        await supabase.from("users").update({
          last_scan: new Date().toISOString(),
          last_uid_validity: uidValidity.toString(),
          scan_uid_low: null,
          scan_total: null,
          scan_uid_validity: null,
          scan_sender_counts: null,
          scan_remaining_uids: null,
          scan_mode: null,
        }).eq("id", user.id);

        return new Response(
          JSON.stringify({ success: true, done: true, mode: "full", fetched: 0, total_in_inbox: 0, scanned_so_far: 0, emails: 0, important: 0, clutter: 0, bundles: 0, bundle_groups: 0, preview: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update-only rescan: when this inbox was fully scanned before and its
      // UIDs are still valid (UIDVALIDITY unchanged), keep what Eflow already
      // sorted and only (1) drop emails no longer in the inbox, (2) refresh
      // read/unread, (3) fetch and sort the emails that are new. A rescan then
      // takes seconds instead of re-downloading thousands of emails.
      const canUpdate =
        options.full !== true &&
        userData.last_scan != null &&
        userData.last_uid_validity != null &&
        userData.last_uid_validity === uidValidity.toString();

      if (canUpdate) {
        mode = "update";
        const known = await selectKnownEmails(supabase, user.id);
        const inInbox = new Set(allUids);
        const knownUids = new Set<number>();
        const gone: string[] = [];
        const kept: typeof known = [];
        for (const row of known) {
          const uid = Number(row.email_id);
          knownUids.add(uid);
          if (inInbox.has(uid)) kept.push(row);
          else gone.push(row.email_id);
        }

        removed = gone.length;
        await updateInChunks(supabase, user.id, gone, (ids) =>
          supabase.from("emails").delete().eq("user_id", user.id).in("email_id", ids)
        );

        // Read/unread changes since the last scan (one light FETCH of flags,
        // no headers). Clean Up relies on this to never sweep opened mail.
        if (kept.length > 0) {
          const readNow = new Set<number>();
          for await (const msg of client.fetch(kept.map((k) => Number(k.email_id)), { uid: true, flags: true }, { uid: true })) {
            if (hasSeenFlag((msg as { flags?: unknown }).flags)) readNow.add(msg.uid);
          }
          const becameRead = kept.filter((k) => !k.is_read && readNow.has(Number(k.email_id))).map((k) => k.email_id);
          const becameUnread = kept.filter((k) => k.is_read && !readNow.has(Number(k.email_id))).map((k) => k.email_id);
          await updateInChunks(supabase, user.id, becameRead, (ids) =>
            supabase.from("emails").update({ is_read: true }).eq("user_id", user.id).in("email_id", ids)
          );
          await updateInChunks(supabase, user.id, becameUnread, (ids) =>
            supabase.from("emails").update({ is_read: false }).eq("user_id", user.id).in("email_id", ids)
          );
        }

        // How often each sender mails this inbox, so new mail is sorted with
        // the same "frequent sender" signal as a full scan.
        senderCounts = {};
        for (const row of kept) {
          const key = row.sender.toLowerCase();
          senderCounts[key] = (senderCounts[key] || 0) + 1;
        }

        remainingUids = allUids.filter((uid) => !knownUids.has(uid)).sort((a, b) => b - a);
      } else {
        // Full scan: resolve the exact set of UIDs currently in the mailbox
        // with a single SEARCH ALL, rather than walking every UID number from
        // the highest ever assigned down to 1 (mailboxes with a long history
        // of deletions have huge gaps of unused UIDs). Newest first.
        mode = "full";
        remainingUids = [...allUids].sort((a, b) => b - a);
        senderCounts = {};

        await supabase.from("emails").delete().eq("user_id", user.id);
        await supabase.from("bundles").delete().eq("user_id", user.id);
      }

      // Progress is measured against the messages this scan will actually
      // read. The folder's STATUS count can differ (Yahoo reported a flat
      // 10,000 for a folder whose list held ~3,000).
      totalMessages = remainingUids.length;
    }

    // Fetch up to batchLimit emails from the front of the remaining list, in
    // FETCH_CHUNK_SIZE pieces over this one connection.
    const chunkMessages: FetchedMessage[] = [];
    let taken = 0;
    while (taken < remainingUids.length && taken < batchLimit) {
      if (taken > 0 && Date.now() - startedAt > CALL_TIME_BUDGET_MS) break;
      const piece = remainingUids.slice(taken, Math.min(taken + FETCH_CHUNK_SIZE, batchLimit));
      taken += piece.length;

      for await (const msg of client.fetch(piece, {
        envelope: true,
        uid: true,
        internalDate: true,
        bodyStructure: true,
        flags: true,
        // The whole header block, parsed by parseListHeaders. Asking the server
        // for only the named fields (["list-unsubscribe", ...]) came back
        // without List-Unsubscribe on Yahoo - List-Id arrived, unsubscribe
        // links never did - so every sender showed "No unsubscribe option".
        headers: true,
      }, { uid: true })) {
        const { email: senderEmail, name: senderName } = parseSender(msg.envelope);
        const subject = msg.envelope?.subject || "(no subject)";
        const internalDate = new Date(msg.internalDate ?? Date.now()).toISOString();

        let hasAttachment = false;
        if (msg.bodyStructure) {
          // deno-lint-ignore no-explicit-any
          const bs = msg.bodyStructure as any;
          if (bs.childNodes && bs.childNodes.length > 1) {
            // deno-lint-ignore no-explicit-any
            hasAttachment = bs.childNodes.some((node: any) =>
              node.disposition === "attachment" ||
              (node.type && node.type.includes("application/"))
            );
          }
        }

        chunkMessages.push({
          uid: msg.uid,
          subject,
          from: senderEmail,
          fromName: senderName || senderEmail,
          date: internalDate,
          snippet: subject.slice(0, 120),
          hasAttachment,
          isRead: hasSeenFlag((msg as { flags?: unknown }).flags),
          ...parseListHeaders(msg.headers),
        });
      }
    }
    const nextRemainingUids = remainingUids.slice(taken);

    lock.release();
    await client.logout();

    // Update running sender-frequency counts (used to bias classification
    // towards "bundle" for senders who mail frequently)
    for (const m of chunkMessages) {
      const key = m.from.toLowerCase();
      senderCounts[key] = (senderCounts[key] || 0) + 1;
    }

    let importantAdded = 0;
    let clutterAdded = 0;
    let bundleAdded = 0;

    const emailsToInsert = chunkMessages.map((m) => {
      const freq = senderCounts[m.from.toLowerCase()] || 1;
      const classification = classifyEmail(m.from, m.fromName, m.subject, m.snippet, m.hasAttachment, m.isRead, freq, m.listId);
      if (classification.category === "important") importantAdded++;
      else if (classification.category === "clutter") clutterAdded++;
      else bundleAdded++;

      return {
        user_id: user.id,
        email_id: String(m.uid),
        sender: m.from,
        sender_name: m.fromName,
        subject: m.subject,
        snippet: m.snippet,
        category: classification.category,
        importance_reason: classification.importance_reason,
        timestamp: m.date,
        has_attachment: m.hasAttachment,
        is_read: m.isRead,
        list_unsubscribe: m.listUnsubscribe,
        list_unsubscribe_post: m.listUnsubscribePost,
        list_id: m.listId,
      };
    });

    if (emailsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("emails")
        .upsert(emailsToInsert, { onConflict: "user_id,email_id" });
      if (insertError) {
        console.error("Error inserting emails chunk:", insertError);
      }
    }

    // A few of the emails just sorted (newest first), so the app can show
    // mail arriving while the scan runs. Only the person's own data, which
    // was just saved to their rows anyway.
    const preview = emailsToInsert.slice(0, 4).map((e) => ({
      sender_name: (e.sender_name || e.sender).slice(0, 80),
      subject: e.subject.slice(0, 120),
      category: e.category,
    }));

    const done = nextRemainingUids.length === 0;
    const scannedSoFar = totalMessages - nextRemainingUids.length;

    if (done) {
      // Final chunk: rebuild bundles from all bundled emails now in the DB
      const allBundleEmails = await selectAllRows<{ sender: string; subject: string }>(
        supabase,
        "emails",
        "sender, subject",
        user.id,
        "bundle",
      );

      const bundleGroups: Record<string, { sender: string; bundle_type: string; count: number; example_subjects: string[] }> = {};

      for (const email of allBundleEmails) {
        const key = email.sender;
        if (!bundleGroups[key]) {
          bundleGroups[key] = { sender: email.sender, bundle_type: "General", count: 0, example_subjects: [] };
        }
        bundleGroups[key].count++;
        if (bundleGroups[key].example_subjects.length < 3) {
          bundleGroups[key].example_subjects.push(email.subject);
        }
      }

      const bundlesToInsert = Object.values(bundleGroups).map((b) => ({
        user_id: user.id,
        sender: b.sender,
        bundle_type: b.bundle_type,
        count: b.count,
        example_subjects: b.example_subjects,
      }));

      await supabase.from("bundles").delete().eq("user_id", user.id);
      if (bundlesToInsert.length > 0) {
        const { error: bundleError } = await supabase.from("bundles").insert(bundlesToInsert);
        if (bundleError) {
          console.error("Error inserting bundles:", bundleError);
        } else {
          // Point each bundled email at its sender's group (see migration
          // 20260924050000), so the Bundles screen and "Archive all" work.
          const { error: linkError } = await supabase.rpc("link_bundle_emails");
          if (linkError) console.error("Error linking bundle emails:", linkError);
        }
      }

      await supabase.from("users").update({
        last_scan: new Date().toISOString(),
        last_uid_validity: uidValidity.toString(),
        scan_uid_low: null,
        scan_total: null,
        scan_uid_validity: null,
        scan_sender_counts: null,
        scan_remaining_uids: null,
        scan_mode: null,
      }).eq("id", user.id);

      const [importantRes, clutterRes, bundleRes, allRes] = await Promise.all([
        supabase.from("emails").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("category", "important"),
        supabase.from("emails").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("category", "clutter"),
        supabase.from("emails").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("category", "bundle"),
        supabase.from("emails").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);

      return new Response(
        JSON.stringify({
          success: true,
          done: true,
          mode,
          fetched: chunkMessages.length,
          total_in_inbox: totalMessages,
          scanned_so_far: scannedSoFar,
          inbox_emails: allRes.count ?? null,
          removed,
          important: importantRes.count ?? importantAdded,
          clutter: clutterRes.count ?? clutterAdded,
          bundles: bundleRes.count ?? bundleAdded,
          bundle_groups: bundlesToInsert.length,
          chunk: { important: importantAdded, clutter: clutterAdded, bundles: bundleAdded },
          preview,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Not done yet: persist progress so the client can call again to continue
    await supabase.from("users").update({
      scan_uid_low: null,
      scan_total: totalMessages,
      scan_uid_validity: uidValidity.toString(),
      scan_sender_counts: senderCounts,
      scan_remaining_uids: nextRemainingUids,
      scan_mode: mode,
    }).eq("id", user.id);

    return new Response(
      JSON.stringify({
        success: true,
        done: false,
        mode,
        fetched: chunkMessages.length,
        total_in_inbox: totalMessages,
        scanned_so_far: scannedSoFar,
        removed,
        important: importantAdded,
        clutter: clutterAdded,
        bundles: bundleAdded,
        bundle_groups: 0,
        chunk: { important: importantAdded, clutter: clutterAdded, bundles: bundleAdded },
        preview,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("IMAP fetch error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Failed to fetch emails" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
