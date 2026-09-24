import { useMemo } from 'react';
import { ShieldCheck, Users, RefreshCw, ChevronRight, Mail } from 'lucide-react';
import { groupBySender } from '../lib/senders';
import UpgradeBanner from './UpgradeBanner';
import CleanUpJunkCard from './CleanUpJunkCard';
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

export default function SimpleHome({
  emails,
  scanning,
  onScan,
  onOpenVerified,
  onOpenSenders,
  onRefresh,
  onShowAllTools,
}: SimpleHomeProps) {
  const verifiedCount = useMemo(() => emails.filter((e) => e.is_protected).length, [emails]);
  const topSender = useMemo(() => groupBySender(emails)[0], [emails]);

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

      <CleanUpJunkCard emails={emails} onRefresh={onRefresh} onOpenVerified={onOpenVerified} />

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
            {verifiedCount.toLocaleString()} receipts & invoices safely filed
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

      <UpgradeBanner />

      <div className="text-center pt-2">
        <button onClick={onShowAllTools} className="text-ink/70 hover:text-ink underline underline-offset-4">
          Show all tools
        </button>
      </div>
    </div>
  );
}
