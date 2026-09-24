import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { PartyPopper, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { FREE_MONTHLY_LIMIT, currentPeriodStart, isProStatus } from '../lib/billing';
import { setMailActionListener } from '../lib/mailActions';
import type { Subscription } from '../lib/types';
import PricingModal, { type PricingReason } from '../components/PricingModal';

interface BillingContextType {
  loading: boolean;
  subscription: Subscription | null;
  isPro: boolean;
  used: number;
  limit: number;
  remaining: number;
  refresh: () => Promise<boolean>;
  openPricing: (reason?: PricingReason) => void;
}

const BillingContext = createContext<BillingContextType | undefined>(undefined);

type Notice = { tone: 'success' | 'info'; text: string } | null;

export function BillingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [used, setUsed] = useState(0);
  const [pricingReason, setPricingReason] = useState<PricingReason | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  // Returns whether the user is Pro after refreshing, for the checkout poll.
  const refresh = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    const [subRes, usageRes] = await Promise.all([
      supabase.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('usage_monthly')
        .select('emails_cleaned')
        .eq('user_id', user.id)
        .eq('period_start', currentPeriodStart())
        .maybeSingle(),
    ]);
    setSubscription(subRes.data ?? null);
    setUsed(usageRes.data?.emails_cleaned ?? 0);
    setLoading(false);
    return isProStatus(subRes.data?.subscription_status);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Open the upgrade screen whenever the server refuses a clean-up for being
  // over the limit, and keep the usage meter current after every clean-up.
  useEffect(
    () =>
      setMailActionListener({
        onUsageLimit: (error) =>
          setPricingReason({ kind: 'limit', remaining: error.remaining, requested: error.requested }),
        onCleaned: () => {
          refresh();
        },
      }),
    [refresh]
  );

  // Coming back from Stripe. The webhook usually lands within a few seconds
  // of the redirect, so poll briefly until the subscription shows up.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const portal = params.get('portal');
    if (!checkout && !portal) return;
    window.history.replaceState({}, '', window.location.pathname);

    if (checkout === 'cancelled') {
      setNotice({ tone: 'info', text: 'No worries - you were not charged. You can upgrade any time.' });
      return;
    }
    if (portal) {
      refresh();
      return;
    }

    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 10 && !cancelled; attempt++) {
        if (await refresh()) {
          setNotice({ tone: 'success', text: 'Welcome to Pro! Unlimited cleaning is switched on.' });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (!cancelled) {
        setNotice({
          tone: 'info',
          text: 'Payment received! Your Pro plan is being switched on - refresh in a minute if it still says Free.',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const isPro = isProStatus(subscription?.subscription_status);
  const value: BillingContextType = {
    loading,
    subscription,
    isPro,
    used,
    limit: FREE_MONTHLY_LIMIT,
    remaining: isPro ? Infinity : Math.max(FREE_MONTHLY_LIMIT - used, 0),
    refresh,
    openPricing: (reason = { kind: 'upgrade' }) => setPricingReason(reason),
  };

  return (
    <BillingContext.Provider value={value}>
      {children}

      {pricingReason && <PricingModal reason={pricingReason} onClose={() => setPricingReason(null)} />}

      {notice && (
        <div className="fixed top-20 inset-x-0 z-40 flex justify-center px-4" role="status">
          <div
            className={`max-w-lg w-full flex items-start gap-3 rounded-2xl border-2 border-ink/10 shadow-xl p-4 ${
              notice.tone === 'success' ? 'bg-mint-200' : 'bg-sunny-200'
            }`}
          >
            {notice.tone === 'success' && <PartyPopper className="w-6 h-6 text-ink flex-shrink-0" />}
            <p className="flex-1 font-semibold text-ink">{notice.text}</p>
            <button onClick={() => setNotice(null)} aria-label="Dismiss" className="text-ink/70 hover:text-ink">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </BillingContext.Provider>
  );
}

export function useBilling() {
  const context = useContext(BillingContext);
  if (!context) throw new Error('useBilling must be used within a BillingProvider');
  return context;
}
