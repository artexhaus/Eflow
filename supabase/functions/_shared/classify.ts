import { isChatter } from "./chatter.ts";
import { isNotice, isPaymentProof } from "./payment_proof.ts";
import { isSuspicious } from "./scam.ts";

// How Eflow sorts an email into important / clutter / bundle. Shared by the
// scan (imap-fetch) and the scheduled cleanup (auto-clean), so an email is
// judged the same way whether the person is looking or not.

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


// Pulls List-Unsubscribe / List-Unsubscribe-Post / List-Id out of the message's
// raw header block. Header values may be folded across several lines, so
// unfold continuation lines before matching.
export function parseListHeaders(raw: Uint8Array | undefined): { listUnsubscribe: string | null; listUnsubscribePost: boolean; listId: string | null } {
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

export function parseSender(envelope: any): { email: string; name: string } {
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

export function classifyEmail(
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

  // Fake order confirmations / invoices (gibberish addresses, glued codes,
  // brands on personal accounts). Junk, and checked before the receipt rule
  // so a scam can never be filed as a protected receipt.
  if (isSuspicious(sender, senderName, subject, hasAttachment)) {
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
