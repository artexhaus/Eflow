import { useMemo, useState } from 'react';
import { Sparkles, ShieldCheck, Users, RefreshCw, CheckCircle, ChevronRight, Mail, AlertCircle } from 'lucide-react';
import { applyMailAction, describePartialFailure, type MailActionResult } from '../lib/mailActions';
import { groupBySender } from '../lib/senders';
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

  const junk = useMemo(() => selectUnopenedJunk(emails), [emails]);
  const verifiedCount = useMemo(() => emails.filter((e) => e.is_protected).length, [emails]);
  const topSender = useMemo(() => groupBySender(emails)[0], [emails]);

  const runCleanUp = async () => {
    setStep('working');
    setError('');
    try {
      const res = await applyMailAction('archive', { emailIds: junk.map((e) => e.email_id) });
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
      <div className="bg-white rounded-3xl shadow-sm p-10 text-center">
        <Mail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Let's look at your inbox</h2>
        <p className="text-lg text-gray-600 mb-8">We'll sort everything so you only see what matters.</p>
        <button
          onClick={onScan}
          disabled={scanning}
          className="inline-flex items-center space-x-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-8 py-5 rounded-2xl text-xl font-bold shadow-lg disabled:opacity-60"
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
        <h2 className="text-3xl font-bold text-gray-900 mb-1">Let's tidy your inbox</h2>
        <p className="text-lg text-gray-600">{emails.length.toLocaleString()} emails in your inbox right now</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start space-x-3">
          <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* The one big action */}
      {step === 'idle' &&
        (junk.length > 0 ? (
          <button
            onClick={() => setStep('confirm')}
            className="w-full text-left bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-3xl p-8 shadow-xl hover:shadow-2xl transition active:scale-[0.99]"
          >
            <Sparkles className="w-12 h-12 mb-4" />
            <div className="text-3xl font-bold mb-2">Clean Up Unopened Junk</div>
            <div className="text-lg text-emerald-50 mb-5">
              Removes promotional emails and repetitive alerts you haven't looked at in {JUNK_AGE_DAYS} days
            </div>
            <span className="inline-block bg-white/20 rounded-full px-4 py-2 text-lg font-semibold">
              {junk.length.toLocaleString()} emails ready to clear
            </span>
          </button>
        ) : (
          <div className="w-full bg-white rounded-3xl p-8 shadow-sm border-2 border-gray-100">
            <CheckCircle className="w-12 h-12 text-emerald-500 mb-4" />
            <div className="text-2xl font-bold text-gray-900 mb-2">Nothing to clean up right now</div>
            <div className="text-lg text-gray-600">
              No unopened promos or alerts older than {JUNK_AGE_DAYS} days. Nice work!
            </div>
          </div>
        ))}

      {step === 'confirm' && (
        <div className="bg-white rounded-3xl p-8 shadow-xl border-2 border-emerald-200">
          <div className="text-2xl font-bold text-gray-900 mb-3">
            Clear {junk.length.toLocaleString()} emails?
          </div>
          <p className="text-lg text-gray-600 mb-2">
            They'll move to your Archive folder, so nothing is lost for good.
          </p>
          <p className="text-lg text-emerald-700 font-medium mb-8 flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 flex-shrink-0" />
            <span>Your bills and receipts are never touched.</span>
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={runCleanUp}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-5 rounded-2xl text-xl font-bold shadow-lg"
            >
              Yes, clean up
            </button>
            <button
              onClick={() => setStep('idle')}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-5 rounded-2xl text-xl font-semibold"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {step === 'working' && (
        <div className="bg-white rounded-3xl p-10 shadow-xl text-center">
          <RefreshCw className="w-12 h-12 text-emerald-500 animate-spin mx-auto mb-4" />
          <div className="text-2xl font-bold text-gray-900 mb-2">Cleaning up...</div>
          <p className="text-lg text-gray-600">This can take a minute for big inboxes.</p>
        </div>
      )}

      {step === 'done' && result && (
        <div className="bg-white rounded-3xl p-8 shadow-xl text-center border-2 border-emerald-200">
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <div className="text-3xl font-bold text-gray-900 mb-2">
            {result.processed > 0 ? 'All clean!' : 'Nothing was moved'}
          </div>
          <p className="text-lg text-gray-600 mb-2">
            {result.processed.toLocaleString()} emails cleared from your inbox.
          </p>
          <p className="text-lg text-emerald-700 font-medium mb-2">
            Your {verifiedCount.toLocaleString()} bills and receipts were kept safe.
          </p>
          {result.failed > 0 && <p className="text-amber-700 mb-2">{describePartialFailure(result)}</p>}
          <button
            onClick={() => setStep('idle')}
            className="mt-6 bg-gray-100 hover:bg-gray-200 text-gray-800 px-10 py-4 rounded-2xl text-lg font-semibold"
          >
            Done
          </button>
        </div>
      )}

      {/* Two big follow-up cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <button
          onClick={onOpenVerified}
          className="text-left bg-white rounded-3xl p-7 ring-2 ring-emerald-300 shadow-lg shadow-emerald-200/70 hover:shadow-emerald-300/80 hover:ring-emerald-400 transition active:scale-[0.99]"
        >
          <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4">
            <ShieldCheck className="w-8 h-8 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">Paid & Verified</div>
          <div className="text-lg text-gray-600 mb-3">
            {verifiedCount.toLocaleString()} bills & receipts safely filed
          </div>
          <div className="flex items-center text-emerald-700 font-semibold">
            <span>Always protected</span>
            <ChevronRight className="w-5 h-5" />
          </div>
        </button>

        <button
          onClick={onOpenSenders}
          className="text-left bg-white rounded-3xl p-7 border-2 border-gray-100 shadow-sm hover:border-emerald-300 hover:shadow-lg transition active:scale-[0.99]"
        >
          <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-1">Who emails you most</div>
          <div className="text-lg text-gray-600 mb-3 truncate">
            {topSender
              ? `${topSender.name} sent ${topSender.count.toLocaleString()}`
              : 'See everyone who writes to you'}
          </div>
          <div className="flex items-center text-blue-700 font-semibold">
            <span>Stop the ones you don't want</span>
            <ChevronRight className="w-5 h-5" />
          </div>
        </button>
      </div>

      <div className="text-center pt-2">
        <button onClick={onShowAllTools} className="text-gray-500 hover:text-gray-800 underline underline-offset-4">
          Show all tools
        </button>
      </div>
    </div>
  );
}
