// "Looks like a scam": fake order confirmations, invoices and renewals of the
// kind that carry an attachment or phone number and hope you'll call.
//
// An email is suspicious when its subject is transactional AND at least one
// stronger sign is present:
//   - a gibberish address on a free personal account (tjhghjvgjngghh@gmail.com);
//     company addresses often contain IDs (Stripe's acct_...), so only free
//     accounts count, and only the part before any "+" tag
//   - a random code glued onto a word ("confirmationD54CV63GYAUC9")
//   - a big brand named by a free personal account (a "PayPal" or "Norton"
//     email from @gmail.com - real companies use their own domain)
//   - an ALL-CAPS person's name on a free personal account, with an attachment
// A transactional subject from Gmail alone is NOT enough: freelancers and
// friends legitimately send invoices and "payment for tickets" that way.
//
// Mirrors emails.is_suspicious in
// supabase/migrations/20260924070000_fix_scam_false_positives.sql - keep in sync.

const FREE_WEBMAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com", "hotmail.com", "live.com",
  "msn.com", "aol.com", "icloud.com", "me.com", "protonmail.com", "proton.me", "mail.com", "gmx.com",
]);

const TRANSACTIONAL_RE =
  /(order|invoice|receipt|payment|purchase|subscription|renew|refund|transaction|billing|confirm|account (suspended|locked|on hold)|verify your)/i;

// 6+ consonants in a row in the mailbox name ("y" counts as a vowel so names
// like "lynn" or "glynn" don't trip it).
const GIBBERISH_LOCAL_RE = /[bcdfghjklmnpqrstvwxz]{6,}/i;

// A lowercase letter immediately followed by an upper-case/digit code that
// contains a digit, e.g. "confirmationD54CV63GYAUC9". Case-sensitive.
const GLUED_CODE_RE = /[a-z][A-Z]*[0-9][A-Z0-9]{5,}/;

const BRAND_RE =
  /\b(paypal|norton|mcafee|geek ?squad|apple|amazon|microsoft|coinbase|best ?buy|walmart|netflix|venmo|zelle|cash ?app|bank of america|chase|wells fargo)\b/i;

// Two or more ALL-CAPS words, e.g. "JOSEPH DONOFRIO".
const CAPS_NAME_RE = /^[A-Z]{2,}( [A-Z]{2,})+$/;

export function isSuspicious(sender: string, senderName: string | null | undefined, subject: string, hasAttachment: boolean): boolean {
  if (!TRANSACTIONAL_RE.test(subject)) return false;
  const [localPart = "", domain = ""] = sender.toLowerCase().split("@");
  const name = (senderName ?? "").trim();
  const freeWebmail = FREE_WEBMAIL.has(domain);

  const mailbox = localPart.split("+")[0];

  return (
    (freeWebmail && GIBBERISH_LOCAL_RE.test(mailbox)) ||
    GLUED_CODE_RE.test(subject) ||
    (freeWebmail && (BRAND_RE.test(name) || BRAND_RE.test(subject))) ||
    (freeWebmail && hasAttachment && CAPS_NAME_RE.test(name))
  );
}
