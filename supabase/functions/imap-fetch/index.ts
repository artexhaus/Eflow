import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { ImapFlow } from "npm:imapflow";
import { readImapPassword } from "../_shared/credentials.ts";
import { isChatter } from "../_shared/chatter.ts";
import { isNotice, isPaymentProof } from "../_shared/payment_proof.ts";

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

// Each invocation only fetches/classifies/inserts a bounded chunk of messages.
// Supabase Edge Functions have hard limits (256MB memory, 2s CPU time, 150s wall
// clock on the free plan) and trying to pull an entire multi-thousand message
// mailbox in one call throws WORKER_RESOURCE_LIMIT and aborts with nothing saved.
// Progress (scan_cursor / scan_total / scan_sender_counts) is persisted on the
// users row so the frontend can call this function repeatedly until `done: true`.
const FETCH_CHUNK_SIZE = 150;

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

const importantDomains = [
  "bank", "chase", "wellsfargo", "bofa", "bankofamerica", "capitalone",
  "citibank", "pnc", "usbank", "tdbank", "paypal", "venmo", "zelle",
  "irs.gov", "gov", "ssa.gov", "dmv", "court",
  "airline", "delta", "united", "american", "southwest", "jetblue",
  "uber", "lyft", "amazon", "ups", "fedex", "usps", "dhl",
  "delivery", "tracking", "shipment",
  "calendar", "meeting", "zoom", "teams", "googlemeet",
  "linkedin.com", "indeed", "glassdoor", "ziprecruiter",
  "doctor", "health", "medical", "pharmacy", "insurance",
  "mortgage", "loan", "rent", "lease", "utility", "electric", "water", "gas",
  "school", "university", "college", "edu",
  "apple", "microsoft", "google", "amazon", "netflix", "spotify",
  "password", "security", "verification", "noreply@accounts",
];

const importantSubjects = [
  "invoice", "receipt", "payment", "statement", "bill", "due",
  "password", "security", "verification", "code", "login", "sign in",
  "delivery", "shipped", "tracking", "package", "order",
  "appointment", "reminder", "confirmation", "booking", "reservation",
  "ticket", "flight", "boarding", "check-in", "checkin",
  "lease", "rent", "mortgage", "contract", "agreement", "document",
  "tax", "w2", "w-2", "1099", "refund", "benefits", "enrollment",
  "job", "interview", "offer", "application",
  "urgent", "action required", "important", "alert",
  "verify", "confirm", "reset",
];

const clutterSenders = [
  "noreply", "no-reply", "donotreply", "do-not-reply", "mailer",
  "marketing", "promo", "promotions", "newsletter", "digest",
  "notification", "alerts", "updates", "news", "weekly", "daily",
  "unsubscribe", "eblast", "email", "campaign", "noreply@mail",
  "postmaster", "mailman", "listserv",
];

const clutterSubjects = [
  "unsubscribe", "newsletter", "promotion", "deal", "sale", "discount",
  "offer", "coupon", "% off", "save up to", "limited time", "expires",
  "marketing", "advertising", "digest", "weekly", "daily", "roundup",
  "sponsored", "sponsored content", "advertorial",
  "you might like", "recommended for you", "based on your",
  "new for you", "just in", "trending now",
  "your weekly", "your daily", "this week", "this month",
  "notification", "you have", "new activity", "people you may know",
  "trending", "popular near", "join us", "don't miss",
  "free ", "win ", "winner", "congratulations", "you've been selected",
  "act now", "last chance", "final hours", "ending soon",
];

const bundleTypes: Record<string, string[]> = {
  Promotions: ["promo", "sale", "deal", "discount", "offer", "coupon", "% off", "save"],
  Newsletters: ["newsletter", "digest", "weekly", "daily", "roundup", "summary"],
  Notifications: ["notification", "alert", "reminder", "update", "activity"],
  Social: ["facebook", "twitter", "instagram", "linkedin", "tiktok", "snapchat", "pinterest", "nextdoor", "social"],
  Shopping: ["order", "shipped", "delivery", "tracking", "package", "cart", "wishlist"],
};

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

// Pulls List-Unsubscribe / List-Unsubscribe-Post / List-Id out of the raw header block
// ImapFlow returns for `headers: [...]`. Header values may be folded across
// several lines, so unfold continuation lines before matching.
function parseListHeaders(raw: Uint8Array | undefined): { listUnsubscribe: string | null; listUnsubscribePost: boolean; listId: string | null } {
  if (!raw) return { listUnsubscribe: null, listUnsubscribePost: false, listId: null };
  const text = new TextDecoder().decode(raw).replace(/\r?\n[ \t]+/g, " ");
  const value = text.match(/^list-unsubscribe:[ \t]*(.+)$/im)?.[1]?.trim() || null;
  const post = /^list-unsubscribe-post:.*one-click/im.test(text);
  // List-Id marks mailing lists, forums and discussion groups (RFC 2919).
  const listId = text.match(/^list-id:[ \t]*(.+)$/im)?.[1]?.trim() || null;
  return {
    listUnsubscribe: value ? value.slice(0, 2000) : null,
    listUnsubscribePost: Boolean(value) && post,
    listId: listId ? listId.slice(0, 500) : null,
  };
}

function parseSender(envelope: any): { email: string; name: string } {
  const from = envelope?.from?.[0] || envelope?.sender?.[0];
  if (!from) return { email: "unknown@unknown.com", name: "" };

  const mailbox = from.mailbox || from.address?.split("@")[0] || "";
  const host = from.host || from.address?.split("@")[1] || "";
  let email = "unknown@unknown.com";
  if (mailbox && host) {
    email = `${mailbox}@${host}`;
  } else if (from.address) {
    email = from.address;
  }
  const name = from.name || "";
  return { email, name };
}

function classifyEmail(
  sender: string,
  senderName: string,
  subject: string,
  snippet: string,
  hasAttachment: boolean,
  isRead: boolean,
  senderFrequency: number,
  listId: string | null,
): { category: string; importance_reason: string | null; bundle_type?: string } {
  // Community feeds, forums, social apps, mailing lists and news sources are
  // junk even when a post mentions money, a bill or a password - checked
  // before every "important" rule below.
  if (isChatter(sender, senderName, listId)) {
    return { category: "clutter", importance_reason: null };
  }

  // Proof that money moved (receipts, payment confirmations, invoices, order
  // confirmations, refunds) is kept; reminders and notices ("payment due",
  // "your bill is ready", "shipped", "expiring") are fluff and filed as junk
  // so Clean Up sweeps them. Same rules as the is_protected column.
  if (isPaymentProof(subject, hasAttachment)) {
    return { category: "important", importance_reason: "Receipt or invoice" };
  }
  if (isNotice(subject)) {
    return { category: "clutter", importance_reason: null };
  }

  const lowerSender = sender.toLowerCase();
  const lowerName = senderName.toLowerCase();
  const lowerSubject = subject.toLowerCase();
  const lowerSnippet = (snippet || "").toLowerCase();
  const fullText = `${lowerSender} ${lowerName} ${lowerSubject} ${lowerSnippet}`;
  const senderLocalPart = lowerSender.split("@")[0];

  // Security/verification emails are always important
  if (importantSubjects.some((kw) => lowerSubject.includes(kw) && ["password", "security", "verification", "code", "login", "sign in", "verify", "confirm", "reset"].includes(kw))) {
    return { category: "important", importance_reason: "Security or account alert" };
  }

  // Financial/legal documents
  if (importantSubjects.some((kw) => ["invoice", "receipt", "payment", "statement", "tax", "w2", "w-2", "1099", "refund", "mortgage", "lease", "contract", "agreement", "document"].includes(kw) && lowerSubject.includes(kw))) {
    return { category: "important", importance_reason: "Financial or legal document" };
  }

  // Important sender domains
  if (importantDomains.some((d) => lowerSender.includes(d))) {
    return { category: "important", importance_reason: "Important sender" };
  }

  // Delivery/travel/job emails
  if (importantSubjects.some((kw) => lowerSubject.includes(kw) && ["delivery", "shipped", "tracking", "package", "order", "flight", "boarding", "ticket", "reservation", "booking", "interview", "job", "offer"].includes(kw))) {
    return { category: "important", importance_reason: "Time-sensitive notification" };
  }

  // High-frequency sender (20+ emails, mostly unread) = clutter/bundle
  const isClutterSender = clutterSenders.some((kw) => senderLocalPart.includes(kw) || lowerName.includes(kw));
  const isClutterSubject = clutterSubjects.some((kw) => lowerSubject.includes(kw));

  if (senderFrequency >= 10 && (isClutterSender || isClutterSubject)) {
    // Determine bundle type
    for (const [bType, keywords] of Object.entries(bundleTypes)) {
      if (keywords.some((kw) => fullText.includes(kw))) {
        return { category: "bundle", importance_reason: null, bundle_type: bType };
      }
    }
    return { category: "bundle", importance_reason: null, bundle_type: "General" };
  }

  // Unread email from known clutter sender with clutter subject = clutter
  if (!isRead && isClutterSender && isClutterSubject) {
    return { category: "clutter", importance_reason: null };
  }

  // Unread promotional email = clutter
  if (!isRead && isClutterSubject && !importantSubjects.some((kw) => lowerSubject.includes(kw))) {
    return { category: "clutter", importance_reason: null };
  }

  // Bundle by type for lower-priority grouped emails
  for (const [bType, keywords] of Object.entries(bundleTypes)) {
    if (keywords.some((kw) => fullText.includes(kw)) && isClutterSender) {
      return { category: "bundle", importance_reason: null, bundle_type: bType };
    }
  }

  // Read email from a real person (not noreply, not high-frequency) = important
  if (!isClutterSender && senderFrequency < 5) {
    const parts = lowerSender.split("@");
    if (parts.length === 2 && parts[0] !== "noreply" && parts[0] !== "no-reply" && !parts[0].includes("marketing") && !parts[0].includes("info") && !parts[0].includes("support") && !parts[0].includes("contact")) {
      return { category: "important", importance_reason: "Personal email" };
    }
  }

  // Has attachment and not obviously clutter = important
  if (hasAttachment && !isClutterSubject) {
    return { category: "important", importance_reason: "Has attachment" };
  }

  // Default: if it's unread and from a clutter-type sender, bundle it
  if (isClutterSender) {
    for (const [bType, keywords] of Object.entries(bundleTypes)) {
      if (keywords.some((kw) => fullText.includes(kw))) {
        return { category: "bundle", importance_reason: null, bundle_type: bType };
      }
    }
    return { category: "clutter", importance_reason: null };
  }

  return { category: "important", importance_reason: "Default classification" };
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

    const { data: userData } = await supabase
      .from("users")
      .select("email_provider, connected_account_id, encrypted_password, scan_remaining_uids, scan_total, scan_uid_validity, scan_sender_counts")
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
    // mailbox needs dozens of chunked calls spread over several minutes.
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
    let uidValidity: bigint;

    const currentStatus = await client.status("INBOX", { messages: true, uidNext: true, uidValidity: true });
    uidValidity = (currentStatus.uidValidity as unknown as bigint) ?? 0n;

    if (isResuming && userData.scan_uid_validity != null && BigInt(userData.scan_uid_validity) === uidValidity) {
      totalMessages = userData.scan_total!;
      remainingUids = (userData.scan_remaining_uids as number[]) || [];
    } else {
      totalMessages = currentStatus.messages || 0;

      if (totalMessages === 0) {
        lock.release();
        await client.logout();

        await supabase.from("emails").delete().eq("user_id", user.id);
        await supabase.from("bundles").delete().eq("user_id", user.id);
        await supabase.from("users").update({
          last_scan: new Date().toISOString(),
          scan_uid_low: null,
          scan_total: null,
          scan_uid_validity: null,
          scan_sender_counts: null,
          scan_remaining_uids: null,
        }).eq("id", user.id);

        return new Response(
          JSON.stringify({ success: true, done: true, fetched: 0, total_in_inbox: 0, emails: 0, important: 0, clutter: 0, bundles: 0, bundle_groups: 0 }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Starting a brand-new scan (or UIDVALIDITY changed): resolve the exact
      // set of UIDs currently in the mailbox with a single SEARCH ALL, rather
      // than walking every UID number from the highest ever assigned down to
      // 1. Mailboxes with a long history of deletions can have huge gaps of
      // unused UIDs below the real messages - walking raw UID ranges would
      // waste thousands of empty round trips paging through those gaps
      // (observed: a 10,000-message inbox needed 3,000+ extra empty chunk
      // calls to walk down through ~490,000 unused historical UIDs). Sorting
      // descending means newest mail is processed first, matching prior
      // behavior.
      const allUids = (await client.search({ all: true }, { uid: true })) as number[];
      remainingUids = [...allUids].sort((a, b) => b - a);

      // Starting a brand-new scan (or UIDVALIDITY changed): wipe previous results
      await supabase.from("emails").delete().eq("user_id", user.id);
      await supabase.from("bundles").delete().eq("user_id", user.id);
    }

    const senderCounts: Record<string, number> = (userData.scan_sender_counts as Record<string, number>) || {};

    // Fetch one bounded chunk from the front of the remaining-UID list (already
    // real, existing UIDs - no wasted round trips on gaps).
    const chunkUids = remainingUids.slice(0, FETCH_CHUNK_SIZE);
    const nextRemainingUids = remainingUids.slice(FETCH_CHUNK_SIZE);

    const chunkMessages: FetchedMessage[] = [];

    if (chunkUids.length > 0) {
    for await (const msg of client.fetch(chunkUids, {
        envelope: true,
        uid: true,
        internalDate: true,
        bodyStructure: true,
        flags: true,
        headers: ["list-unsubscribe", "list-unsubscribe-post", "list-id"],
      }, { uid: true })) {
        const { email: senderEmail, name: senderName } = parseSender(msg.envelope);
        const subject = msg.envelope?.subject || "(no subject)";
        const internalDate = new Date(msg.internalDate ?? Date.now()).toISOString();
        const flags = (msg as any).flags;
        const isRead = flags instanceof Set
          ? flags.has("\\Seen")
          : Array.isArray(flags)
            ? flags.includes("\\Seen")
            : false;

        let hasAttachment = false;
        if (msg.bodyStructure) {
          const bs = msg.bodyStructure as any;
          if (bs.childNodes && bs.childNodes.length > 1) {
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
        isRead,
        ...parseListHeaders(msg.headers),
      });
    }
    }

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

    const done = nextRemainingUids.length === 0;

    // Track progress by counting rows actually persisted so far (accurate even
    // though UID space isn't perfectly contiguous with message count when mail
    // has been deleted in the past), rather than doing UID arithmetic.
    const { count: scannedSoFarCount } = await supabase
      .from("emails")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    const scannedSoFar = scannedSoFarCount ?? chunkMessages.length;

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
        }
      }

      await supabase.from("users").update({
        last_scan: new Date().toISOString(),
        scan_uid_low: null,
        scan_total: null,
        scan_uid_validity: null,
        scan_sender_counts: null,
        scan_remaining_uids: null,
      }).eq("id", user.id);

      const [importantRes, clutterRes, bundleRes] = await Promise.all([
        supabase.from("emails").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("category", "important"),
        supabase.from("emails").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("category", "clutter"),
        supabase.from("emails").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("category", "bundle"),
      ]);

      return new Response(
        JSON.stringify({
          success: true,
          done: true,
          fetched: chunkMessages.length,
          total_in_inbox: totalMessages,
          scanned_so_far: scannedSoFar,
          important: importantRes.count ?? importantAdded,
          clutter: clutterRes.count ?? clutterAdded,
          bundles: bundleRes.count ?? bundleAdded,
          bundle_groups: bundlesToInsert.length,
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
    }).eq("id", user.id);

    return new Response(
      JSON.stringify({
        success: true,
        done: false,
        fetched: chunkMessages.length,
        total_in_inbox: totalMessages,
        scanned_so_far: scannedSoFar,
        important: importantAdded,
        clutter: clutterAdded,
        bundles: bundleAdded,
        bundle_groups: 0,
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
