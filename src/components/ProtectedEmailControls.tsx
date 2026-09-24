import { ShieldCheck } from 'lucide-react';

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
