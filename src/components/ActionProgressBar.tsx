import { useEffect, useRef, useState } from 'react';
import type { MailActionStatus } from '../lib/mailActions';
import { useI18n } from '../lib/i18n';

interface ActionProgressBarProps {
  // null until the server's first update arrives.
  status: MailActionStatus | null;
  className?: string;
}

// A real progress bar for delete / archive / mark-read: percent, "X of Y
// emails" and a rough time left, fed by the server's per-batch updates.
// Before the first email moves (signing in to the mail server) it shows a
// moving stripe instead of a stuck 0%.
export default function ActionProgressBar({ status, className = '' }: ActionProgressBarProps) {
  const { t, plural } = useI18n();
  const startedAt = useRef<number | null>(null);
  const [, tick] = useState(0);

  // Time left is measured from when emails started moving, not from when the
  // mail server sign-in began, so the estimate isn't skewed by that wait.
  const working = status?.stage === 'working';
  useEffect(() => {
    if (working && startedAt.current === null) startedAt.current = Date.now();
  }, [working]);

  // Re-render once a second so the time left counts down between updates.
  useEffect(() => {
    if (!working) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [working]);

  const total = status?.total ?? 0;
  const done = Math.min(status?.done ?? 0, total);
  const indeterminate = !working || total === 0;
  const percent = indeterminate ? 0 : Math.round((done / total) * 100);

  let timeLeft = '';
  if (working && startedAt.current !== null && done > 0 && done < total) {
    const elapsed = (Date.now() - startedAt.current) / 1000;
    const seconds = Math.max(1, Math.round((elapsed / done) * (total - done)));
    if (elapsed >= 2) {
      timeLeft =
        seconds < 60
          ? plural(seconds, 'About {n} second left', 'About {n} seconds left')
          : plural(Math.round(seconds / 60), 'About {n} minute left', 'About {n} minutes left');
    }
  }

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 text-sm font-semibold text-ink/80 mb-2">
        <span>
          {indeterminate
            ? t('Connecting to your mail server...')
            : t('{done} of {total} emails', { done, total })}
        </span>
        {!indeterminate && <span className="font-display text-lg text-ink tabular-nums">{percent}%</span>}
      </div>
      <div
        className="relative h-4 w-full overflow-hidden rounded-full bg-white border-2 border-ink/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : percent}
        aria-valuetext={indeterminate ? t('Connecting to your mail server...') : `${percent}%`}
      >
        {indeterminate ? (
          <div className="absolute inset-y-0 w-1/3 rounded-full bg-mint-300 animate-progress-slide" />
        ) : (
          <div
            className="h-full rounded-full bg-gradient-to-r from-mint-300 via-ocean-300 to-berry-300 transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(percent, 3)}%` }}
          />
        )}
      </div>
      <p className="mt-2 min-h-[1.25rem] text-xs text-ink/60 text-left" aria-live="polite">
        {timeLeft}
      </p>
    </div>
  );
}
