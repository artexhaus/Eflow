import { useState } from 'react';
import { ShieldCheck, Trash2, Loader2 } from 'lucide-react';
import { applyMailAction } from '../lib/mailActions';
import type { Email } from '../lib/types';

// Shown on emails that look like a bill or receipt (is_protected). Clean-ups
// and bulk actions always skip these, so the badge explains why.
export function ProtectedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold bg-mint-100 text-mint-800 border border-mint-200">
      <ShieldCheck className="w-3.5 h-3.5" />
      <span>Bill or receipt · kept safe</span>
    </span>
  );
}

interface DeleteAnywayButtonProps {
  email: Email;
  onDeleted: () => void | Promise<void>;
}

// For false alarms (e.g. a forum post that mentions "your bill"): deletes this
// one protected email after an explicit confirmation. The server only allows
// this override for a single email, never for bulk actions.
export function DeleteAnywayButton({ email, onDeleted }: DeleteAnywayButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleClick = async () => {
    const ok = confirm(
      `Delete "${email.subject}" anyway?\n\n` +
        "Eflow keeps this email safe because it looks like a bill or receipt. " +
        "Only delete it if it isn't one. This cannot be undone."
    );
    if (!ok) return;

    setBusy(true);
    setError('');
    try {
      const result = await applyMailAction('delete', { emailIds: [email.email_id] }, { allowProtected: true, label: 'this email' });
      if (result.processed === 0) {
        setError("Your mail server didn't delete it. Please try again.");
        return;
      }
      await onDeleted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end">
      <button
        onClick={handleClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-berry-700 hover:text-berry-900 px-3 py-1.5 rounded-xl hover:bg-berry-50 transition disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        <span>Not a bill? Delete anyway</span>
      </button>
      {error && <span className="text-xs text-berry-700 mt-1">{error}</span>}
    </span>
  );
}
