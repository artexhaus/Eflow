import { useState } from 'react';
import { ChevronLeft, Crown, Loader2, Settings, Sparkles, AlertCircle, UserRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBilling } from '../contexts/BillingContext';
import AccountControls from './AccountControls';
import { FREE_MONTHLY_LIMIT, PRICES, formatResetDate, openBillingPortal } from '../lib/billing';

interface AccountScreenProps {
  onBack: () => void;
  onMailboxDisconnected: () => void;
}

const formatDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

export default function AccountScreen({ onBack, onMailboxDisconnected }: AccountScreenProps) {
  const { user } = useAuth();
  const { isPro, subscription, used, loading, openPricing } = useBilling();
  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState('');

  const manage = async () => {
    setOpeningPortal(true);
    setError('');
    try {
      await openBillingPortal(); // navigates to Stripe on success
    } catch (err) {
      setError((err as Error).message);
      setOpeningPortal(false);
    }
  };

  const status = subscription?.subscription_status;
  const planName = isPro ? (subscription?.plan === 'annual' ? 'Pro yearly' : 'Pro monthly') : 'Free';
  const planPrice = isPro
    ? subscription?.plan === 'annual'
      ? `${PRICES.annual.amount} / ${PRICES.annual.per}`
      : `${PRICES.monthly.amount} / ${PRICES.monthly.per}`
    : '$0 / month';
  const usedPct = Math.min(100, Math.round((used / FREE_MONTHLY_LIMIT) * 100));
  const canManage = isPro || Boolean(subscription?.stripe_customer_id);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={onBack} className="flex items-center space-x-2 text-ink/75 hover:text-ink mb-6 transition">
        <ChevronLeft className="w-5 h-5" />
        <span className="font-medium">Back to Dashboard</span>
      </button>

      <h2 className="text-3xl font-bold text-ink mb-1">Your account</h2>
      <p className="text-ink/75 mb-8 flex items-center gap-2">
        <UserRound className="w-4 h-4" />
        <span className="break-all">{user?.email}</span>
      </p>

      {loading ? (
        <div className="flex items-center gap-3 text-ink/75">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading your plan...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Plan block */}
          <div className={`rounded-3xl border-2 border-ink/10 shadow-xl p-7 ${isPro ? 'bg-mint-200' : 'bg-sunny-100'}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-ink/70 uppercase tracking-wide">Your plan</p>
                <h3 className="text-3xl font-bold text-ink flex items-center gap-2">
                  {planName}
                  {isPro && <Crown className="w-7 h-7 text-sunny-700" />}
                </h3>
                <p className="text-ink/80 font-semibold">{planPrice}</p>
              </div>
              <div className="w-14 h-14 bg-white/80 rounded-2xl flex items-center justify-center border-2 border-ink/10 shadow-sm rotate-6">
                <Sparkles className={`w-8 h-8 ${isPro ? 'text-mint-700' : 'text-sunny-700'}`} />
              </div>
            </div>

            {status === 'past_due' && (
              <p className="mt-4 flex items-start gap-2 bg-berry-100 text-berry-800 rounded-2xl p-3 border-2 border-berry-200">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>We couldn't take your last payment. Update your card in Manage Subscription to keep Pro.</span>
              </p>
            )}
            {isPro && subscription?.current_period_end && (
              <p className="mt-4 text-ink/80">
                {subscription.cancel_at_period_end
                  ? `Pro ends on ${formatDate(subscription.current_period_end)}. You can turn it back on in Manage Subscription.`
                  : `Renews on ${formatDate(subscription.current_period_end)}.`}
              </p>
            )}

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              {!isPro && (
                <button
                  onClick={() => openPricing()}
                  className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl text-lg font-display font-semibold bg-ocean-200 hover:bg-ocean-300 text-ink border-2 border-ink/15 shadow-lg"
                >
                  <Sparkles className="w-5 h-5" />
                  <span>See Pro plans</span>
                </button>
              )}
              {canManage && (
                <button
                  onClick={manage}
                  disabled={openingPortal}
                  className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl text-lg font-display font-semibold bg-white hover:bg-ocean-50 text-ink border-2 border-ink/15 shadow-lg disabled:opacity-60"
                >
                  {openingPortal ? <Loader2 className="w-5 h-5 animate-spin" /> : <Settings className="w-5 h-5" />}
                  <span>{openingPortal ? 'Opening...' : 'Manage Subscription'}</span>
                </button>
              )}
            </div>
            {canManage && (
              <p className="mt-3 text-sm text-ink/70">
                Update your card, switch between monthly and yearly, see receipts, or cancel.
              </p>
            )}
            {error && (
              <p className="mt-4 bg-berry-100 text-berry-800 rounded-2xl p-3 border-2 border-berry-200">{error}</p>
            )}
          </div>

          {/* Usage block */}
          <div className="bg-white rounded-3xl border-2 border-ink/10 shadow-lg p-7">
            <h3 className="text-xl font-bold text-ink mb-3">Cleaning this month</h3>
            {isPro ? (
              <p className="text-ink/80">
                <span className="font-display text-3xl font-bold text-ink">{used.toLocaleString()}</span> emails
                cleaned - unlimited on Pro.
              </p>
            ) : (
              <>
                <div className="flex justify-between text-sm font-semibold text-ink/80 mb-1">
                  <span>
                    {used.toLocaleString()} of {FREE_MONTHLY_LIMIT} emails cleaned
                  </span>
                  <span>Resets {formatResetDate({ month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <div className="h-5 bg-cream rounded-full border-2 border-ink/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${usedPct >= 100 ? 'bg-berry-300' : usedPct >= 80 ? 'bg-sunny-300' : 'bg-mint-300'}`}
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
              </>
            )}
          </div>

          <AccountControls onMailboxDisconnected={onMailboxDisconnected} />
        </div>
      )}
    </div>
  );
}
