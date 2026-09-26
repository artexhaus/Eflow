import { useEffect } from 'react';
import { Trash2, Archive, ShieldCheck, AlertCircle } from 'lucide-react';
import type { Email } from '../lib/types';
import { useI18n } from '../lib/i18n';

interface RemoveConfirmDialogProps {
  action: 'delete' | 'archive';
  total: number;
  protectedEmails: Email[];
  importantCount: number;
  // includeProtected: whether the user chose to also remove the receipts/invoices.
  onConfirm: (includeProtected: boolean) => void;
  onCancel: () => void;
}

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
  const { t, plural } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const isDelete = action === 'delete';
  const Icon = isDelete ? Trash2 : Archive;
  const protectedCount = protectedEmails.length;
  const others = total - protectedCount;

  const primaryTone = isDelete ? 'bg-berry-200 hover:bg-berry-300' : 'bg-mint-200 hover:bg-mint-300';
  const button = 'w-full py-3.5 rounded-2xl text-lg font-display font-semibold text-ink border-2 border-ink/15 shadow-md transition';

  let title: string;
  if (protectedCount > 0 && others === 0) {
    title = isDelete
      ? plural(protectedCount, 'Delete this receipt or invoice?', 'Delete these {n} receipts or invoices?')
      : plural(protectedCount, 'Archive this receipt or invoice?', 'Archive these {n} receipts or invoices?');
  } else {
    title = isDelete ? plural(total, 'Delete {n} email?', 'Delete {n} emails?') : plural(total, 'Archive {n} email?', 'Archive {n} emails?');
  }

  let primaryLabel: string;
  if (protectedCount > 0 && others > 0) {
    primaryLabel = isDelete
      ? plural(protectedCount, 'Delete {others}, keep the receipt', 'Delete {others}, keep the receipts', { others })
      : plural(protectedCount, 'Archive {others}, keep the receipt', 'Archive {others}, keep the receipts', { others });
  } else if (protectedCount > 0) {
    primaryLabel = isDelete
      ? protectedCount === 1 ? t('Delete it anyway') : t('Delete them anyway')
      : protectedCount === 1 ? t('Archive it') : t('Archive them');
  } else {
    primaryLabel = isDelete ? plural(total, 'Delete {n} email', 'Delete {n} emails') : plural(total, 'Archive {n} email', 'Archive {n} emails');
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
          {isDelete ? t("This can't be undone.") : t("They'll move to your Archive folder, so you can still find them.")}
        </p>

        {importantCount > 0 && (
          <p className="flex items-start gap-2 text-sm bg-sunny-100 border-2 border-sunny-200 rounded-2xl p-3 mb-3 text-ink">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-sunny-800" />
            <span>{plural(importantCount, '{n} email marked Important.', '{n} emails marked Important.')}</span>
          </p>
        )}

        {protectedCount > 0 && (
          <div className="text-sm bg-mint-100 border-2 border-mint-200 rounded-2xl p-3 mb-3 text-ink">
            <p className="flex items-center gap-2 font-semibold mb-1">
              <ShieldCheck className="w-4 h-4 text-mint-700" />
              <span>
                {plural(protectedCount, 'This looks like a receipt or invoice:', '{n} look like receipts or invoices:')}
              </span>
            </p>
            <ul className="space-y-0.5 pl-6 list-disc">
              {protectedEmails.slice(0, 3).map((e) => (
                <li key={e.id} className="truncate">
                  {e.subject}
                </li>
              ))}
            </ul>
            {protectedCount > 3 && <p className="pl-6 text-ink/70">{t('and {n} more', { n: protectedCount - 3 })}</p>}
          </div>
        )}

        <div className="space-y-2 mt-5">
          {protectedCount > 0 && others > 0 ? (
            <>
              <button autoFocus onClick={() => onConfirm(false)} className={`${button} ${primaryTone}`}>
                {primaryLabel}
              </button>
              <button onClick={() => onConfirm(true)} className={`${button} bg-berry-100 hover:bg-berry-200`}>
                {isDelete ? t('Delete all {n}', { n: total }) : t('Archive all {n}', { n: total })}
              </button>
            </>
          ) : (
            <button autoFocus onClick={() => onConfirm(protectedCount > 0)} className={`${button} ${primaryTone}`}>
              {primaryLabel}
            </button>
          )}
          <button onClick={onCancel} className="w-full py-3 rounded-2xl text-ink/75 hover:text-ink font-semibold">
            {t('Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
