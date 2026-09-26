import { useMemo, useState } from 'react';
import { ShieldAlert, Trash2, CheckCircle } from 'lucide-react';
import { applyMailAction, describePartialFailure } from '../lib/mailActions';
import RemoveConfirmDialog from './RemoveConfirmDialog';
import type { Email } from '../lib/types';
import { plural, tKnown, useI18n } from '../lib/i18n';

interface SuspiciousAlertProps {
  emails: Email[];
  onRefresh: () => Promise<void> | void;
}

// Dashboard warning when the inbox holds emails that look like scams (fake
// order confirmations / invoices - see emails.is_suspicious), with a safety
// tip and a one-tap way to delete them. Hidden when there are none.
export default function SuspiciousAlert({ emails, onRefresh }: SuspiciousAlertProps) {
  const suspicious = useMemo(() => emails.filter((e) => e.is_suspicious), [emails]);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const { t } = useI18n();

  if (suspicious.length === 0) {
    return result?.tone === 'success' ? (
      <div className="bg-mint-100 border-2 border-mint-200 rounded-2xl p-4 flex items-center gap-3">
        <CheckCircle className="w-5 h-5 text-mint-700 flex-shrink-0" />
        <p className="flex-1 text-mint-900">{result.text}</p>
        <button onClick={() => setResult(null)} className="text-sm font-medium text-mint-800">
          {t('Dismiss')}
        </button>
      </div>
    ) : null;
  }

  const deleteAll = async () => {
    setConfirming(false);
    setResult(null);
    try {
      const res = await applyMailAction(
        'delete',
        { emailIds: suspicious.map((e) => e.email_id) },
        { label: plural(suspicious.length, '{n} suspicious email', '{n} suspicious emails') }
      );
      setResult(
        res.failed > 0
          ? { tone: 'error', text: describePartialFailure(res) }
          : { tone: 'success', text: plural(res.processed, 'Deleted {n} suspicious email.', 'Deleted {n} suspicious emails.') }
      );
      await onRefresh();
    } catch (err) {
      setResult({ tone: 'error', text: tKnown((err as Error).message) });
    }
  };

  const count = suspicious.length;

  return (
    <section className="bg-berry-100 rounded-3xl border-2 border-berry-300 shadow-lg p-6" role="alert">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="w-12 h-12 bg-white/80 rounded-2xl border-2 border-ink/10 flex items-center justify-center -rotate-6 flex-shrink-0">
          <ShieldAlert className="w-7 h-7 text-berry-700" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-xl font-bold text-ink">
            {plural(count, '{n} email looks like a scam', '{n} emails look like scams')}
          </h3>
          <p className="text-ink/80 mb-3">
            {t("Fake order confirmations and invoices, often from personal accounts. Don't open their attachments, click their links or call any number in them.")}
          </p>
          <ul className="space-y-1 mb-4">
            {suspicious.slice(0, 3).map((e) => (
              <li key={e.id} className="text-sm text-ink truncate">
                <span className="font-semibold">{e.sender_name || e.sender}</span>
                <span className="text-ink/60"> · {e.sender} · </span>
                {e.subject}
              </li>
            ))}
            {count > 3 && <li className="text-sm text-ink/70">{t('and {n} more', { n: count - 3 })}</li>}
          </ul>
          {result?.tone === 'error' && <p className="text-sm text-berry-800 mb-3">{result.text}</p>}
          <button
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-2 px-5 py-3 bg-berry-200 hover:bg-berry-300 text-ink rounded-2xl border-2 border-ink/15 shadow-md font-display font-semibold"
          >
            <Trash2 className="w-5 h-5" />
            <span>{count === 1 ? t('Delete it') : t('Delete them all')}</span>
          </button>
        </div>
      </div>

      {confirming && (
        <RemoveConfirmDialog
          action="delete"
          total={count}
          protectedEmails={[]}
          importantCount={0}
          onConfirm={deleteAll}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
}
