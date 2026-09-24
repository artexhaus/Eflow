import { useMemo, useState } from 'react';
import { Sparkles, ShieldCheck, Users, RefreshCw, CheckCircle, ChevronRight, Mail, AlertCircle } from 'lucide-react';
import { applyMailAction, describePartialFailure, type MailActionResult } from '../lib/mailActions';
import { groupBySender } from '../lib/senders';
import { useBilling } from '../contexts/BillingContext';
import type { Email } from '../lib/types';

interface SimpleHomeProps {
  emails: Email[];
  scanning: boolean;
  onScan: () => void;
  onOpenVerified: () => void;
  onOpenSenders: () => void;
  onRefresh: () => Promise<void> | void;
  onShowAllTools: () => void;
}

const JUNK_AGE_DAYS = 30;

// "Unopened junk": promos and repetitive alerts (clutter or bundle) that were
// never opened and are over 30 days old. Protected bills and receipts are left
// out here, and the server refuses to touch them anyway.
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

export default function SimpleHome({
  emails,
  scanning,
  onScan,
  onOpenVerified,
  onOpenSenders,
  onRefresh,
  onShowAllTools,
}: SimpleHomeProps) {
  const [step, setStep] = useState<CleanUpStep>('idle');
  const [result, setResult] = useState<MailActionResult | null>(null);
  const [error, setError] = useState('');
  const { isPro, remaining, openPricing } = useBilling();

  const junk = useMemo(() => selectUnopenedJunk(emails), [emails]);
  const verifiedCount = useMemo(() => emails.filter((e) => e.is_protected).length, [emails]);
  const topSender = useMemo(() => groupBySender(emails)[0], [emails]);

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

  if (emails.length === 0) {
    return (
      <div className="bg-white rounded-3xl shadow-sm p-10 text-center border-2 border-ink/10">
        <Mail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="font-display text-2xl font-bold text-ink mb-2">Let's look at your inbox</h2>
        <p className="text-lg text-ink/75 mb-8">We'll sort everything so you only see what matters.</p>
        <button
          onClick={onScan}
          disabled={scanning}
          className="inline-flex items-center space-x-3 bg-mint-200 text-ink px-8 py-5 rounded-2xl text-xl font-bold shadow-lg disabled:opacity-60"
        >
          <RefreshCw className={scanning ? 'w-6 h-6 animate-spin' : 'w-6 h-6'} />
          <span>{scanning ? 'Looking...' : 'Look at my inbox'}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-ink mb-1">Let's tidy your inbox</h2>
        <p className="text-lg text-ink/75">{emails.length.toLocaleString()} emails in your inbox right now</p>
      </div>

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
            <span>Your bills and receipts are never touched.</span>
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
            Your {verifiedCount.toLocaleString()} bills and receipts were kept safe.
          </p>
          {result.failed > 0 && <p className="text-sunny-700 mb-2">{describePartialFailure(result)}</p>}
          <button
            onClick={() => setStep('idle')}
            className="mt-6 bg-gray-100 hover:bg-gray-200 text-ink px-10 py-4 rounded-2xl text-lg font-semibold"
          >
            Done
          </button>
        </div>
      )}

      {/* Two big follow-up cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <button
          onClick={onOpenVerified}
          className="text-left bg-mint-200 hover:bg-mint-300 rounded-3xl p-7 border-2 border-ink/10 ring-4 ring-mint-100 shadow-xl transition"
        >
          <div className="w-14 h-14 bg-white/80 rounded-2xl flex items-center justify-center mb-4 shadow-sm rotate-6">
            <ShieldCheck className="w-8 h-8 text-mint-600" />
          </div>
          <div className="font-display text-2xl font-bold text-ink mb-1">Paid & Verified</div>
          <div className="text-lg text-ink/75 mb-3">
            {verifiedCount.toLocaleString()} bills & receipts safely filed
          </div>
          <div className="flex items-center text-mint-700 font-semibold">
            <span>Always protected</span>
            <ChevronRight className="w-5 h-5" />
          </div>
        </button>

        <button
          onClick={onOpenSenders}
          className="text-left bg-berry-200 hover:bg-berry-300 rounded-3xl p-7 border-2 border-ink/10 shadow-xl transition"
        >
          <div className="w-14 h-14 bg-white/80 rounded-2xl flex items-center justify-center mb-4 shadow-sm -rotate-6">
            <Users className="w-8 h-8 text-berry-700" />
          </div>
          <div className="font-display text-2xl font-bold text-ink mb-1">Who emails you most</div>
          <div className="text-lg text-ink/75 mb-3 truncate">
            {topSender
              ? `${topSender.name} sent ${topSender.count.toLocaleString()}`
              : 'See everyone who writes to you'}
          </div>
          <div className="flex items-center text-berry-800 font-semibold">
            <span>Stop the ones you don't want</span>
            <ChevronRight className="w-5 h-5" />
          </div>
        </button>
      </div>

      <div className="text-center pt-2">
        <button onClick={onShowAllTools} className="text-ink/70 hover:text-ink underline underline-offset-4">
          Show all tools
        </button>
      </div>
    </div>
  );
}
