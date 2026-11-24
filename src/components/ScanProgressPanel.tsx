import { useEffect, useRef, useState } from 'react';
import { Mail, Package, RefreshCw, Trash2 } from 'lucide-react';
import { useI18n } from '../lib/i18n';

export interface ScanPreviewEmail {
  sender_name: string;
  subject: string;
  category: string;
}

export interface LiveScan {
  // 'update' = only new emails since the last scan; 'full' = whole inbox.
  mode: 'full' | 'update' | null;
  scannedSoFar: number;
  total: number;
  found: { important: number; clutter: number; bundles: number };
  // Most recent first; each has a key so new ones animate in.
  recent: (ScanPreviewEmail & { key: string })[];
}

interface ScanProgressPanelProps {
  scan: LiveScan | null;
  retrying: boolean;
  resuming: boolean;
}

// Counts up smoothly to the target, so numbers visibly tick as mail is sorted.
function useCountUp(target: number) {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;
    const started = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - started) / 700);
      const value = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)));
      shownRef.current = value;
      setShown(value);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

const CATEGORY_STYLE: Record<string, { label: 'Important' | 'Clutter' | 'Bundled'; chip: string }> = {
  important: { label: 'Important', chip: 'bg-ocean-200 text-ocean-900' },
  clutter: { label: 'Clutter', chip: 'bg-berry-200 text-berry-900' },
  bundle: { label: 'Bundled', chip: 'bg-mint-200 text-mint-900' },
};

// What the person sees while a scan runs: a real progress bar with time left,
// counters that tick up per category, and the emails being sorted right now.
export default function ScanProgressPanel({ scan, retrying, resuming }: ScanProgressPanelProps) {
  const { t, plural, formatNumber } = useI18n();
  const startedAt = useRef<number | null>(null);
  const [, tick] = useState(0);

  const total = scan?.total ?? 0;
  const done = Math.min(scan?.scannedSoFar ?? 0, total);
  const started = scan !== null;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  // Time left, measured from the first batch (so connecting isn't counted).
  useEffect(() => {
    if (done > 0 && startedAt.current === null) startedAt.current = Date.now();
  }, [done]);
  useEffect(() => {
    if (!started) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [started]);

  let timeLeft = '';
  if (startedAt.current !== null && done > 0 && done < total) {
    const elapsed = (Date.now() - startedAt.current) / 1000;
    const seconds = Math.max(1, Math.round((elapsed / done) * (total - done)));
    if (elapsed >= 3) {
      timeLeft =
        seconds < 60
          ? plural(seconds, 'About {n} second left', 'About {n} seconds left')
          : plural(Math.round(seconds / 60), 'About {n} minute left', 'About {n} minutes left');
    }
  }

  const important = useCountUp(scan?.found.important ?? 0);
  const clutter = useCountUp(scan?.found.clutter ?? 0);
  const bundles = useCountUp(scan?.found.bundles ?? 0);
  const shownDone = useCountUp(done);

  const isUpdate = scan?.mode === 'update';
  const headline = retrying
    ? t('Your mail server is a little slow - still working...')
    : !started
      ? resuming
        ? t('Picking up your scan where it left off...')
        : t('Connecting to your mailbox...')
      : isUpdate
        ? total === 0
          ? t('Checking for new emails...')
          : plural(total, 'Sorting {n} new email...', 'Sorting {n} new emails...')
        : t('Sorting your inbox...');

  return (
    <div className="mb-6 bg-white border-2 border-ocean-200 border-t-[10px] border-t-ocean-300 rounded-3xl shadow-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <RefreshCw className="w-5 h-5 text-ocean-600 animate-spin flex-shrink-0" />
        <p className="font-display text-xl font-bold text-ink">{headline}</p>
      </div>

      {/* Progress bar: a moving stripe until the first batch, then real. */}
      <div className="flex items-baseline justify-between gap-3 text-sm font-semibold text-ink/80 mb-2">
        <span>
          {started && total > 0
            ? t('{done} of {total} emails', { done: formatNumber(shownDone), total: formatNumber(total) })
            : t('Getting your inbox ready...')}
        </span>
        {started && total > 0 && <span className="font-display text-lg text-ink tabular-nums">{percent}%</span>}
      </div>
      <div
        className="relative h-4 w-full overflow-hidden rounded-full bg-cream border-2 border-ink/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={started && total > 0 ? percent : undefined}
      >
        {started && total > 0 ? (
          <div
            className="h-full rounded-full bg-gradient-to-r from-mint-300 via-ocean-300 to-berry-300 transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(percent, 3)}%` }}
          />
        ) : (
          <div className="absolute inset-y-0 w-1/3 rounded-full bg-ocean-300 animate-progress-slide" />
        )}
      </div>
      <p className="mt-2 min-h-[1.25rem] text-xs text-ink/60" aria-live="polite">{timeLeft}</p>

      {/* Counters that tick up as mail is sorted. */}
      <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: t('Important'), value: important, icon: Mail, tone: 'bg-ocean-100 text-ocean-900' },
          { label: t('Clutter'), value: clutter, icon: Trash2, tone: 'bg-berry-100 text-berry-900' },
          { label: t('Bundled'), value: bundles, icon: Package, tone: 'bg-mint-100 text-mint-900' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className={`rounded-2xl border-2 border-ink/10 px-2.5 sm:px-3 py-3 ${tone}`}>
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold">
              <Icon className="hidden sm:block w-4 h-4 flex-shrink-0" />
              <span className="truncate">{label}</span>
            </div>
            <div className="font-display text-2xl sm:text-3xl font-bold tabular-nums">{formatNumber(value)}</div>
          </div>
        ))}
      </div>

      {/* The emails being sorted right now. */}
      {scan && scan.recent.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-semibold text-ink/70 mb-2">{t('Just sorted')}</p>
          <ul className="space-y-2" aria-live="off">
            {scan.recent.map((e) => {
              const style = CATEGORY_STYLE[e.category] ?? CATEGORY_STYLE.important;
              return (
                <li
                  key={e.key}
                  className="animate-scan-in flex items-center gap-3 rounded-2xl bg-cream/70 border-2 border-ink/5 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink truncate">{e.sender_name}</p>
                    <p className="text-sm text-ink/70 truncate">{e.subject}</p>
                  </div>
                  <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${style.chip}`}>
                    {t(style.label)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="mt-4 text-sm text-ink/70">
        {t('Keep this tab open until it finishes. You can keep using Eflow meanwhile.')}
      </p>
    </div>
  );
}
