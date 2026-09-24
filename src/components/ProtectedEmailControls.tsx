import { ShieldCheck, ShieldAlert } from 'lucide-react';

// Shown on emails that look like a receipt or invoice (is_protected). Clean-ups
// and bulk actions always skip these, so the badge explains why.
export function ProtectedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold bg-mint-100 text-mint-800 border border-mint-200">
      <ShieldCheck className="w-3.5 h-3.5" />
      <span>Receipt or invoice · kept safe</span>
    </span>
  );
}

// Shown on emails that look like a fake order confirmation / invoice
// (is_suspicious). These are never protected and are filed as junk.
export function ScamBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold bg-berry-100 text-berry-800 border border-berry-300"
      title="Don't open its attachments, click its links or call numbers in it."
    >
      <ShieldAlert className="w-3.5 h-3.5" />
      <span>Looks like a scam</span>
    </span>
  );
}
