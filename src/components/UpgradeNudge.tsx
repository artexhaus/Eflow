import { useEffect } from 'react';
import { Sparkles, PartyPopper } from 'lucide-react';
import { PRICES } from '../lib/billing';
import { useI18n } from '../lib/i18n';

interface UpgradeNudgeProps {
  used: number;
  limit: number;
  onUpgrade: () => void;
  onDismiss: () => void;
}

// Small milestone popup for Free users, shown each time their monthly cleans
// pass another NUDGE_EVERY (see BillingContext): celebrates the progress, says
// how many free cleans are left, and offers the upgrade.
export default function UpgradeNudge({ used, limit, onUpgrade, onDismiss }: UpgradeNudgeProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDismiss();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  const { t, plural } = useI18n();
  const remaining = Math.max(limit - used, 0);
  const pct = Math.min(100, Math.round((used / limit) * 100));

  return (
    <div
      className="fixed inset-0 z-[58] flex items-center justify-center bg-ink/30 p-4"
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-nudge-title"
    >
      <div
        className="w-full max-w-sm bg-cream rounded-3xl border-2 border-ink/10 shadow-2xl p-7 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inline-flex w-16 h-16 bg-sunny-200 rounded-2xl border-2 border-ink/10 shadow-md items-center justify-center -rotate-6 mb-4">
          <PartyPopper className="w-8 h-8 text-sunny-800" />
        </div>
        <h2 id="upgrade-nudge-title" className="text-2xl font-bold text-ink mb-1">
          {plural(used, '{n} email cleaned!', '{n} emails cleaned!')}
        </h2>
        <p className="text-ink/80 mb-4">
          {t('You have')}{' '}
          <span className="font-bold text-ink">{plural(remaining, '{n} free clean left', '{n} free cleans left')}</span>{' '}
          {t('this month.')}
        </p>

        <div className="h-4 bg-white rounded-full border-2 border-ink/10 overflow-hidden mb-6">
          <div
            className={`h-full rounded-full ${pct >= 80 ? 'bg-berry-300' : pct >= 50 ? 'bg-sunny-300' : 'bg-mint-300'}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <button
          autoFocus
          onClick={onUpgrade}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-lg font-display font-semibold bg-ocean-200 hover:bg-ocean-300 text-ink border-2 border-ink/15 shadow-lg"
        >
          <Sparkles className="w-5 h-5" />
          <span>{t('Upgrade now')}</span>
        </button>
        <p className="text-sm text-ink/70 mt-2">
          {t('Unlimited cleaning from {price}/month', { price: PRICES.monthly.amount })}
        </p>
        <button onClick={onDismiss} className="mt-3 text-ink/70 hover:text-ink font-semibold">
          {t('Maybe later')}
        </button>
      </div>
    </div>
  );
}
