import { useEffect, useState } from 'react';
import { Check, Loader2, X, Sparkles, Star, Blocks, Settings } from 'lucide-react';
import { useBilling } from '../contexts/BillingContext';
import { BillingError, FREE_MONTHLY_LIMIT, PRICES, formatResetDate, openBillingPortal, startCheckout, type Plan } from '../lib/billing';

export type PricingReason =
  | { kind: 'upgrade' }
  | { kind: 'limit'; remaining: number; requested?: number };

interface PricingModalProps {
  reason: PricingReason;
  onClose: () => void;
}

const FREE_FEATURES = [
  `Clean up to ${FREE_MONTHLY_LIMIT} emails a month`,
  'One-tap Clean Up Unopened Junk',
  'Unsubscribe from senders',
];

const PRO_FEATURES = ['Unlimited cleaning', 'Full Paid & Verified receipt vault', 'Bulk actions across all senders'];

export default function PricingModal({ reason, onClose }: PricingModalProps) {
  const { isPro, subscription, used } = useBilling();
  const [busy, setBusy] = useState<Plan | 'portal' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const choose = async (plan: Plan) => {
    setBusy(plan);
    setError('');
    try {
      await startCheckout(plan); // navigates to Stripe on success
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  const manage = async () => {
    setBusy('portal');
    setError('');
    try {
      await openBillingPortal();
    } catch (err) {
      setError(err instanceof BillingError ? err.message : 'Could not open subscription settings.');
      setBusy(null);
    }
  };

  const currentPlan = isPro ? subscription?.plan ?? 'monthly' : 'free';
  const usedPct = Math.min(100, Math.round((used / FREE_MONTHLY_LIMIT) * 100));
  const resetsOn = formatResetDate();

  let title = 'Pick your plan';
  let subtitle = 'Keep your inbox tidy with a plan that fits.';
  if (reason.kind === 'limit') {
    title = reason.remaining === 0 ? `You've used all ${FREE_MONTHLY_LIMIT} free cleans this month` : `Only ${reason.remaining} free cleans left this month`;
    subtitle =
      reason.requested && reason.remaining > 0
        ? `That clean-up needs ${reason.requested.toLocaleString()}. Go Pro for unlimited cleaning, or wait until ${resetsOn}.`
        : `Go Pro for unlimited cleaning, or your free cleans come back on ${resetsOn}.`;
  }

  // Free users: buy the plan in Checkout. Pro users: their current plan is
  // shown as "Your plan", and the other one switches via the Customer Portal
  // (which handles proration) instead of starting a second subscription.
  const planButton = (plan: Plan, label: string, tone: string) => {
    const isCurrent = currentPlan === plan;
    const isSwitch = isPro && !isCurrent;
    const working = isSwitch ? busy === 'portal' : busy === plan;
    let text = label;
    if (isCurrent) text = 'Your plan';
    else if (isSwitch) text = working ? 'Opening...' : `Switch to ${plan === 'annual' ? 'yearly' : 'monthly'}`;
    else if (working) text = 'Opening checkout...';

    return (
      <button
        onClick={() => (isSwitch ? manage() : choose(plan))}
        disabled={busy !== null || isCurrent}
        className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-lg font-display font-semibold border-2 border-ink/15 shadow-lg transition disabled:opacity-60 ${tone}`}
      >
        {working && <Loader2 className="w-5 h-5 animate-spin" />}
        <span>{text}</span>
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-ink/40 p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pricing-title"
    >
      <div
        className="relative w-full max-w-5xl bg-cream rounded-3xl border-2 border-ink/10 shadow-2xl p-6 sm:p-8 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          autoFocus
          aria-label="Close"
          className="absolute top-4 right-4 w-10 h-10 rounded-2xl bg-white border-2 border-ink/10 shadow-sm flex items-center justify-center text-ink hover:bg-sunny-100"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-8 px-8">
          <div className="inline-flex w-16 h-16 bg-sunny-200 rounded-2xl items-center justify-center border-2 border-ink/10 shadow-md -rotate-6 mb-4">
            <Blocks className="w-9 h-9 text-sunny-800" />
          </div>
          <h2 id="pricing-title" className="text-3xl sm:text-4xl font-bold text-ink mb-2">
            {title}
          </h2>
          <p className="text-lg text-ink/75">{subtitle}</p>
        </div>

        {!isPro && (
          <div className="max-w-md mx-auto mb-8">
            <div className="flex justify-between text-sm font-semibold text-ink/80 mb-1">
              <span>This month</span>
              <span>
                {used.toLocaleString()} / {FREE_MONTHLY_LIMIT} cleaned
              </span>
            </div>
            <div className="h-4 bg-white rounded-full border-2 border-ink/10 overflow-hidden">
              <div
                className={`h-full rounded-full ${usedPct >= 100 ? 'bg-berry-300' : 'bg-mint-300'}`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {/* Free */}
          <div className="flex flex-col bg-sunny-100 rounded-3xl border-2 border-ink/10 shadow-xl p-6">
            <h3 className="text-2xl font-bold text-ink">Free</h3>
            <div className="mt-3 mb-5">
              <span className="font-display text-5xl font-bold text-ink">$0</span>
              <span className="text-ink/70 ml-1">/ month</span>
            </div>
            <ul className="space-y-3 mb-6 flex-1">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-ink">
                  <Check className="w-5 h-5 text-sunny-800 flex-shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={onClose}
              className="w-full py-4 rounded-2xl text-lg font-display font-semibold bg-white border-2 border-ink/15 shadow-lg text-ink hover:bg-sunny-50"
            >
              {currentPlan === 'free' ? 'Stay on Free' : 'Close'}
            </button>
          </div>

          {/* Pro monthly */}
          <div className="flex flex-col bg-ocean-100 rounded-3xl border-2 border-ink/10 shadow-xl p-6">
            <h3 className="text-2xl font-bold text-ink flex items-center gap-2">
              Pro <Sparkles className="w-5 h-5 text-ocean-700" />
            </h3>
            <div className="mt-3 mb-5">
              <span className="font-display text-5xl font-bold text-ink">{PRICES.monthly.amount}</span>
              <span className="text-ink/70 ml-1">/ {PRICES.monthly.per}</span>
            </div>
            <ul className="space-y-3 mb-6 flex-1">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-ink">
                  <Check className="w-5 h-5 text-ocean-700 flex-shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            {planButton('monthly', 'Go Pro monthly', 'bg-ocean-200 hover:bg-ocean-300 text-ink')}
          </div>

          {/* Pro annual - best value */}
          <div className="relative flex flex-col bg-mint-100 rounded-3xl border-2 border-mint-400 ring-4 ring-mint-200 shadow-xl p-6">
            <span className="absolute -top-4 right-6 rotate-3 bg-berry-200 text-ink font-display font-semibold px-4 py-1.5 rounded-2xl border-2 border-ink/10 shadow-md flex items-center gap-1">
              <Star className="w-4 h-4" /> Best value
            </span>
            <h3 className="text-2xl font-bold text-ink flex items-center gap-2">
              Pro yearly <Sparkles className="w-5 h-5 text-mint-700" />
            </h3>
            <div className="mt-3">
              <span className="font-display text-5xl font-bold text-ink">{PRICES.annual.amount}</span>
              <span className="text-ink/70 ml-1">/ {PRICES.annual.per}</span>
            </div>
            <p className="text-mint-800 font-semibold mb-5">Just $4.17 a month - save 40%</p>
            <ul className="space-y-3 mb-6 flex-1">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-ink">
                  <Check className="w-5 h-5 text-mint-700 flex-shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            {planButton('annual', 'Go Pro yearly', 'bg-mint-200 hover:bg-mint-300 text-ink')}
          </div>
        </div>

        {error && (
          <p className="mt-6 text-center bg-berry-100 text-berry-800 rounded-2xl p-3 border-2 border-berry-200">{error}</p>
        )}

        <div className="mt-8 text-center text-ink/70 space-y-3">
          {(isPro || subscription?.stripe_customer_id) && (
            <button
              onClick={manage}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border-2 border-ink/15 shadow-md text-ink font-semibold hover:bg-ocean-50 disabled:opacity-60"
            >
              {busy === 'portal' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Settings className="w-5 h-5" />}
              <span>Manage Subscription</span>
            </button>
          )}
          <p className="text-sm">Cancel any time. Payments are handled securely by Stripe.</p>
        </div>
      </div>
    </div>
  );
}
