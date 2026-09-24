import { useMemo, useState } from 'react';
import { Sparkles, ShieldCheck, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { applyMailAction, describePartialFailure, type MailActionResult } from '../lib/mailActions';
import { useBilling } from '../contexts/BillingContext';
import type { Email } from '../lib/types';

interface CleanUpJunkCardProps {
  emails: Email[];
  onRefresh: () => Promise<void> | void;
  onOpenVerified: () => void;
}

const JUNK_AGE_DAYS = 30;

// "Unopened junk": promos, repetitive alerts, reminders and notices (clutter
// or bundle) never opened and over 30 days old. Protected receipts and
// invoices are left out here, and the server refuses to touch them anyway.
function selectUnopenedJunk(emails: Email[]): Email[] {
  const cutoff = Date.now() - JUNK_AGE_DAYS * 24 * 60 * 60 * 1000;
  return emails.filter(
    (e) =>
      (e.category === 'clutter' || e.category === 'bundle') &&
      !e.is_read &&
      !e.is_protected &&
      new Date(e.timestamp).getTime() < cutoff
  );
}

type CleanUpStep = 'idle' | 'confirm' | 'working' | 'done';

// The one big "Clean Up Unopened Junk" action, with its confirm / working /
// done states. Used on both the Simple view and the All tools dashboard.
export default function CleanUpJunkCard({ emails, onRefresh, onOpenVerified }: CleanUpJunkCardProps) {
  const [step, setStep] = useState<CleanUpStep>('idle');
  const [result, setResult] = useState<MailActionResult | null>(null);
  const [error, setError] = useState('');
  const { isPro, remaining, openPricing } = useBilling();

  const junk = useMemo(() => selectUnopenedJunk(emails), [emails]);
  const verifiedCount = useMemo(() => emails.filter((e) => e.is_protected).length, [emails]);

  // Free users over their monthly allowance can still clear what fits:
  // emails are loaded newest first, so the oldest junk is at the end.
  const overLimit = !isPro && junk.length > remaining;

  const runCleanUp = async (batch: Email[] = junk) => {
    setStep('working');
    setError('');
    try {
      const res = await applyMailAction('archive', { emailIds: batch.map((e) => e.email_id) }, { silent: true });
      setResult(res);
      setStep('done');
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
      setStep('idle');
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-berry-50 border border-berry-200 rounded-2xl p-5 flex items-start space-x-3">
          <AlertCircle className="w-6 h-6 text-berry-600 flex-shrink-0" />
          <p className="text-berry-800">{error}</p>
        </div>
      )}

      {/* The one big action */}
      {step === 'idle' &&
        (junk.length > 0 ? (
          <button
            onClick={() => setStep('confirm')}
            className="w-full text-left bg-ocean-200 hover:bg-ocean-300 text-ink rounded-3xl p-8 border-2 border-ink/10 shadow-2xl transition"
          >
            <div className="w-16 h-16 bg-white/80 rounded-2xl flex items-center justify-center mb-4 shadow-sm -rotate-6">
              <Sparkles className="w-9 h-9 text-ocean-700" />
            </div>
            <div className="font-display text-3xl font-bold mb-2">Clean Up Unopened Junk</div>
            <div className="text-lg text-ink/80 mb-5">
              Removes promotional emails and repetitive alerts you haven't looked at in {JUNK_AGE_DAYS} days
            </div>
            <span className="inline-block bg-white/70 rounded-full px-4 py-2 text-lg font-semibold">
              {junk.length.toLocaleString()} emails ready to clear
            </span>
          </button>
        ) : (
          <div className="w-full bg-white rounded-3xl p-8 shadow-sm border-2 border-ink/10">
            <CheckCircle className="w-12 h-12 text-mint-500 mb-4" />
            <div className="font-display text-2xl font-bold text-ink mb-2">Nothing to clean up right now</div>
            <div className="text-lg text-ink/75">
              No unopened promos or alerts older than {JUNK_AGE_DAYS} days. Nice work!
            </div>
          </div>
        ))}

      {step === 'confirm' && (
        <div className="bg-white rounded-3xl p-8 shadow-xl border-2 border-mint-200">
          <div className="font-display text-2xl font-bold text-ink mb-3">
            Clear {junk.length.toLocaleString()} emails?
          </div>
          <p className="text-lg text-ink/75 mb-2">
            They'll move to your Archive folder, so nothing is lost for good.
          </p>
          <p className="text-lg text-mint-700 font-medium mb-8 flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 flex-shrink-0" />
            <span>Your receipts and invoices are never touched.</span>
          </p>
          {overLimit && (
            <div className="mb-6 bg-sunny-100 border-2 border-sunny-300 rounded-2xl p-4">
              <p className="text-lg font-semibold text-ink">
                {remaining === 0
                  ? "You've used this month's free cleans."
                  : `That's more than your ${remaining.toLocaleString()} free cleans left this month.`}
              </p>
              <p className="text-ink/75">Go Pro to clear everything in one go.</p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            {overLimit ? (
              <>
                <button
                  onClick={() => openPricing({ kind: 'limit', remaining, requested: junk.length })}
                  className="flex-1 bg-ocean-200 hover:bg-ocean-300 text-ink py-5 rounded-2xl text-xl font-bold border-2 border-ink/10 shadow-lg"
                >
                  See Pro plans
                </button>
                {remaining > 0 && (
                  <button
                    onClick={() => runCleanUp(junk.slice(-remaining))}
                    className="flex-1 bg-mint-200 hover:bg-mint-300 text-ink py-5 rounded-2xl text-xl font-bold border-2 border-ink/10 shadow-lg"
                  >
                    Clean the oldest {remaining.toLocaleString()} free
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => runCleanUp()}
                className="flex-1 bg-mint-200 hover:bg-mint-300 text-ink py-5 rounded-2xl text-xl font-bold border-2 border-ink/10 shadow-lg"
              >
                Yes, clean up
              </button>
            )}
            <button
              onClick={() => setStep('idle')}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-ink py-5 rounded-2xl text-xl font-semibold"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {step === 'working' && (
        <div className="bg-white rounded-3xl p-10 shadow-xl text-center border-2 border-ink/10">
          <RefreshCw className="w-12 h-12 text-mint-500 animate-spin mx-auto mb-4" />
          <div className="font-display text-2xl font-bold text-ink mb-2">Cleaning up...</div>
          <p className="text-lg text-ink/75">This can take a minute for big inboxes.</p>
        </div>
      )}

      {step === 'done' && result && (
        <div className="bg-white rounded-3xl p-8 shadow-xl text-center border-2 border-mint-200">
          <CheckCircle className="w-16 h-16 text-mint-500 mx-auto mb-4" />
          <div className="font-display text-3xl font-bold text-ink mb-2">
            {result.processed > 0 ? 'All clean!' : 'Nothing was moved'}
          </div>
          <p className="text-lg text-ink/75 mb-2">
            {result.processed.toLocaleString()} emails cleared from your inbox.
          </p>
          <p className="text-lg text-mint-700 font-medium mb-2">
            Your {verifiedCount.toLocaleString()} receipts and invoices were kept safe.
          </p>
          {verifiedCount > 0 && (
            <button
              onClick={onOpenVerified}
              className="mt-4 inline-flex items-center gap-2 bg-mint-200 hover:bg-mint-300 text-ink px-6 py-3 rounded-2xl text-lg font-display font-semibold border-2 border-ink/10 shadow-lg"
            >
              <ShieldCheck className="w-5 h-5" />
              <span>View receipts & invoices</span>
            </button>
          )}
          {result.failed > 0 && <p className="text-sunny-700 mb-2">{describePartialFailure(result)}</p>}
          <button
            onClick={() => setStep('idle')}
            className="mt-6 bg-gray-100 hover:bg-gray-200 text-ink px-10 py-4 rounded-2xl text-lg font-semibold"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
