// What counts as a kept "payment proof" email versus a reminder/notice.
//
// Mirrors the emails.is_protected generated column in
// supabase/migrations/20260924060000_flag_scam_emails.sql (minus the chatter and
// scam checks, which live in chatter.ts and scam.ts). Keep the two in sync. Postgres
// writes word boundaries as \y where JavaScript uses \b.

// Money actually moved: receipts, payment confirmations, paid invoices,
// order/purchase confirmations, refunds.
const PROOF_RE =
  /\b(receipts?|e-?receipt|payments? (received|confirmed|confirmation|successful|processed|complete|completed)|thanks? (you )?for your (payment|order|purchase)|you paid|you sent (a )?payment|sent you (a )?payment|has been paid|paid in full|(bill|invoice) (has been )?paid|order (confirm(ed|ation)|#|number|no\.?|receipt)|your ([\w.&'-]+ ){0,3}(order|purchase)|purchase confirm(ed|ation)|refund(ed)?|transaction (receipt|confirmation))\b/i;

// Reminders, notices and status updates - fluff once read or out of date.
const NOTICE_RE =
  /(remind|\bdue\b|past due|overdue|upcoming|scheduled|auto-?pay|\bis (ready|available)|now available|ready to view|view (your|online)|don't forget|expir|renew|shipped|out for delivery|delivered|on (its|the) way|arriving|\btrack(ing)?\b|low balance|declined|failed|action required|your (next|first) (order|purchase))/i;

// The actual invoice/bill document: an invoice number, or the file attached.
const INVOICE_NUMBER_RE = /\binvoice ?(#|no\.?|number)/i;
const DOCUMENT_WORD_RE = /\b(invoices?|bills?|statements?)\b/i;

export function isNotice(subject: string): boolean {
  return NOTICE_RE.test(subject);
}

export function isPaymentProof(subject: string, hasAttachment: boolean): boolean {
  if (PROOF_RE.test(subject) && !NOTICE_RE.test(subject)) return true;
  return INVOICE_NUMBER_RE.test(subject) || (hasAttachment && DOCUMENT_WORD_RE.test(subject));
}
