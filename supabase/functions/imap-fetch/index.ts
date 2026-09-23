import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ImapFlow } from "npm:imapflow";

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

const BATCH_SIZE = 500;

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
): { category: string; importance_reason: string | null; bundle_type?: string } {
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
    const password = atob(userData.encrypted_password);

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

    const status = await client.status("INBOX", { messages: true });
    const totalMessages = status.messages || 0;

    if (totalMessages === 0) {
      lock.release();
      await client.logout();

      await supabase.from("emails").delete().eq("user_id", user.id);
      await supabase.from("bundles").delete().eq("user_id", user.id);
      await supabase.from("users").update({ last_scan: new Date().toISOString() }).eq("id", user.id);

      return new Response(
        JSON.stringify({ success: true, fetched: 0, emails: 0, bundles: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch ALL messages in batches
    const allMessages: FetchedMessage[] = [];
    const totalBatches = Math.ceil(totalMessages / BATCH_SIZE);

    for (let batch = 0; batch < totalBatches; batch++) {
      const start = batch * BATCH_SIZE + 1;
      const end = Math.min(start + BATCH_SIZE - 1, totalMessages);
      const range = `${start}:${end}`;

      for await (const msg of client.fetch(range, {
        envelope: true,
        uid: true,
        internalDate: true,
        bodyStructure: true,
        flags: true,
      })) {
        const { email: senderEmail, name: senderName } = parseSender(msg.envelope);
        const subject = msg.envelope?.subject || "(no subject)";
        const internalDate = msg.internalDate || new Date().toISOString();
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

        allMessages.push({
          uid: msg.uid,
          subject,
          from: senderEmail,
          fromName: senderName || senderEmail,
          date: internalDate,
          snippet: subject.slice(0, 120),
          hasAttachment,
          isRead,
        });
      }
    }

    lock.release();
    await client.logout();

    // Calculate sender frequency for smarter classification
    const senderCounts: Record<string, number> = {};
    for (const m of allMessages) {
      const key = m.from.toLowerCase();
      senderCounts[key] = (senderCounts[key] || 0) + 1;
    }

    // Clear old emails and insert new ones
    await supabase.from("emails").delete().eq("user_id", user.id);
    await supabase.from("bundles").delete().eq("user_id", user.id);

    // Insert in chunks of 200 to avoid payload limits
    const CHUNK = 200;
    for (let i = 0; i < allMessages.length; i += CHUNK) {
      const chunk = allMessages.slice(i, i + CHUNK);
      const emailsToInsert = chunk.map((m) => {
        const freq = senderCounts[m.from.toLowerCase()] || 1;
        const classification = classifyEmail(m.from, m.fromName, m.subject, m.snippet, m.hasAttachment, m.isRead, freq);
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
        };
      });

      const { error: insertError } = await supabase.from("emails").insert(emailsToInsert);
      if (insertError) {
        console.error("Error inserting emails chunk:", insertError);
      }
    }

    // Create bundles from bundled emails
    const { data: allEmails } = await supabase
      .from("emails")
      .select("sender, subject, snippet, has_attachment, is_read, category")
      .eq("user_id", user.id)
      .eq("category", "bundle");

    const bundleGroups: Record<string, { sender: string; bundle_type: string; count: number; example_subjects: string[]; unread_count: number }> = {};

    if (allEmails) {
      for (const email of allEmails) {
        const key = email.sender;
        if (!bundleGroups[key]) {
          bundleGroups[key] = {
            sender: email.sender,
            bundle_type: "General",
            count: 0,
            example_subjects: [],
            unread_count: 0,
          };
        }
        bundleGroups[key].count++;
        if (!email.is_read) bundleGroups[key].unread_count!++;
        if (bundleGroups[key].example_subjects.length < 3) {
          bundleGroups[key].example_subjects.push(email.subject);
        }
      }
    }

    const bundlesToInsert = Object.values(bundleGroups).map((b) => ({
      user_id: user.id,
      sender: b.sender,
      bundle_type: b.bundle_type,
      count: b.count,
      example_subjects: b.example_subjects,
    }));

    if (bundlesToInsert.length > 0) {
      const { error: bundleError } = await supabase.from("bundles").insert(bundlesToInsert);
      if (bundleError) {
        console.error("Error inserting bundles:", bundleError);
      }
    }

    // Update last_scan timestamp
    await supabase.from("users").update({ last_scan: new Date().toISOString() }).eq("id", user.id);

    const importantCount = allMessages.filter((m) => {
      const freq = senderCounts[m.from.toLowerCase()] || 1;
      return classifyEmail(m.from, m.fromName, m.subject, m.snippet, m.hasAttachment, m.isRead, freq).category === "important";
    }).length;
    const clutterCount = allMessages.filter((m) => {
      const freq = senderCounts[m.from.toLowerCase()] || 1;
      return classifyEmail(m.from, m.fromName, m.subject, m.snippet, m.hasAttachment, m.isRead, freq).category === "clutter";
    }).length;
    const bundleCount = allMessages.length - importantCount - clutterCount;

    return new Response(
      JSON.stringify({
        success: true,
        fetched: allMessages.length,
        total_in_inbox: totalMessages,
        emails: allMessages.length,
        important: importantCount,
        clutter: clutterCount,
        bundles: bundleCount,
        bundle_groups: bundlesToInsert.length,
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
