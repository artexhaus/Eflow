import { Sparkles, ChevronRight } from 'lucide-react';
import { useBilling } from '../contexts/BillingContext';
import { PRICES } from '../lib/billing';

// Dashboard call to action for Free users: how many free cleans are left this
// month, and a big block button to see the Pro plans. Hidden for Pro users.
export default function UpgradeBanner() {
  const { loading, isPro, used, limit, remaining, openPricing } = useBilling();
  if (loading || isPro) return null;

  const pct = Math.min(100, Math.round((used / limit) * 100));

  return (
    <button
      onClick={() => openPricing()}
      className="w-full text-left bg-sunny-200 hover:bg-sunny-300 rounded-3xl p-6 border-2 border-ink/10 shadow-xl transition flex flex-col sm:flex-row sm:items-center gap-5"
    >
      <div className="w-14 h-14 bg-white/80 rounded-2xl flex items-center justify-center border-2 border-ink/10 shadow-sm rotate-6 flex-shrink-0">
        <Sparkles className="w-8 h-8 text-sunny-800" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display text-2xl font-bold text-ink">Go Pro for unlimited cleaning</div>
        <div className="text-ink/80 mb-2">
          {remaining.toLocaleString()} of {limit} free cleans left this month · Pro from {PRICES.monthly.amount}/
          {PRICES.monthly.per}
        </div>
        <div className="h-3 bg-white/80 rounded-full border-2 border-ink/10 overflow-hidden max-w-md">
          <div
            className={`h-full rounded-full ${pct >= 80 ? 'bg-berry-300' : pct >= 50 ? 'bg-ocean-300' : 'bg-mint-300'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className="inline-flex items-center justify-center gap-1 bg-white px-5 py-3 rounded-2xl border-2 border-ink/15 shadow-md font-display font-semibold text-ink flex-shrink-0">
        Upgrade now
        <ChevronRight className="w-5 h-5" />
      </span>
    </button>
  );
}
