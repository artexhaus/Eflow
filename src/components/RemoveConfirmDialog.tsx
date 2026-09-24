import { useEffect } from 'react';
import { Trash2, Archive, ShieldCheck, AlertCircle } from 'lucide-react';
import type { Email } from '../lib/types';

interface RemoveConfirmDialogProps {
  action: 'delete' | 'archive';
  total: number;
  protectedEmails: Email[];
  importantCount: number;
  // includeProtected: whether the user chose to also remove the receipts/invoices.
  onConfirm: (includeProtected: boolean) => void;
  onCancel: () => void;
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

// One confirmation for deleting/archiving a hand-picked selection. If the
// selection includes receipts or invoices, it names them and offers the choice
// right here - no separate "delete anyway" step.
export default function RemoveConfirmDialog({
  action,
  total,
  protectedEmails,
  importantCount,
  onConfirm,
  onCancel,
}: RemoveConfirmDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const isDelete = action === 'delete';
  const verb = isDelete ? 'Delete' : 'Archive';
  const Icon = isDelete ? Trash2 : Archive;
  const protectedCount = protectedEmails.length;
  const others = total - protectedCount;
  const receiptWord = protectedCount === 1 ? 'the receipt' : 'the receipts';

  const primaryTone = isDelete ? 'bg-berry-200 hover:bg-berry-300' : 'bg-mint-200 hover:bg-mint-300';
  const button = 'w-full py-3.5 rounded-2xl text-lg font-display font-semibold text-ink border-2 border-ink/15 shadow-md transition';

  let title: string;
  if (protectedCount > 0 && others === 0) {
    title = protectedCount === 1 ? `${verb} this receipt or invoice?` : `${verb} these ${protectedCount} receipts or invoices?`;
  } else {
    title = `${verb} ${plural(total, 'email')}?`;
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-ink/40 p-4"
      onClick={onCancel}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="remove-confirm-title"
    >
      <div
        className="w-full max-w-md bg-cream rounded-3xl border-2 border-ink/10 shadow-2xl p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`w-14 h-14 ${isDelete ? 'bg-berry-200' : 'bg-mint-200'} rounded-2xl border-2 border-ink/10 shadow-md flex items-center justify-center -rotate-6 mb-4`}>
          <Icon className={`w-7 h-7 ${isDelete ? 'text-berry-700' : 'text-mint-700'}`} />
        </div>
        <h2 id="remove-confirm-title" className="text-2xl font-bold text-ink mb-1">
          {title}
        </h2>
        <p className="text-ink/75 mb-4">
          {isDelete ? "This can't be undone." : "They'll move to your Archive folder, so you can still find them."}
        </p>

        {importantCount > 0 && (
          <p className="flex items-start gap-2 text-sm bg-sunny-100 border-2 border-sunny-200 rounded-2xl p-3 mb-3 text-ink">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-sunny-800" />
            <span>{plural(importantCount, 'email')} marked Important.</span>
          </p>
        )}

        {protectedCount > 0 && (
          <div className="text-sm bg-mint-100 border-2 border-mint-200 rounded-2xl p-3 mb-3 text-ink">
            <p className="flex items-center gap-2 font-semibold mb-1">
              <ShieldCheck className="w-4 h-4 text-mint-700" />
              <span>
                {protectedCount === 1 ? 'This looks like a receipt or invoice:' : `${protectedCount} look like receipts or invoices:`}
              </span>
            </p>
            <ul className="space-y-0.5 pl-6 list-disc">
              {protectedEmails.slice(0, 3).map((e) => (
                <li key={e.id} className="truncate">
                  {e.subject}
                </li>
              ))}
            </ul>
            {protectedCount > 3 && <p className="pl-6 text-ink/70">and {(protectedCount - 3).toLocaleString()} more</p>}
          </div>
        )}

        <div className="space-y-2 mt-5">
          {protectedCount > 0 && others > 0 ? (
            <>
              <button autoFocus onClick={() => onConfirm(false)} className={`${button} ${primaryTone}`}>
                {verb} {others.toLocaleString()}, keep {receiptWord}
              </button>
              <button onClick={() => onConfirm(true)} className={`${button} bg-white hover:bg-cream`}>
                {verb} all {total.toLocaleString()}
              </button>
            </>
          ) : (
            <button autoFocus onClick={() => onConfirm(protectedCount > 0)} className={`${button} ${primaryTone}`}>
              {protectedCount > 0
                ? `${verb} ${protectedCount === 1 ? 'it' : 'them'}${isDelete ? ' anyway' : ''}`
                : `${verb} ${plural(total, 'email')}`}
            </button>
          )}
          <button onClick={onCancel} className="w-full py-3 rounded-2xl text-ink/75 hover:text-ink font-semibold">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
