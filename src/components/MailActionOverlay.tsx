import { useEffect, useState } from 'react';
import { Loader2, Trash2, Archive, CheckCheck } from 'lucide-react';
import { addMailActionListener, type MailActionProgress } from '../lib/mailActions';

// Centered "hold tight" window shown while any delete / archive / mark-read
// request is running, so it's unmistakable that work is in progress. It
// listens to every applyMailAction call, so screens don't need to wire it up.

const COPY = {
  delete: { verb: 'deleting', icon: Trash2, tile: 'bg-berry-200', iconColor: 'text-berry-700' },
  archive: { verb: 'archiving', icon: Archive, tile: 'bg-mint-200', iconColor: 'text-mint-700' },
  mark_read: { verb: 'marking as read', icon: CheckCheck, tile: 'bg-sunny-200', iconColor: 'text-sunny-800' },
} as const;

const TIPS = [
  'Talking to your mail server...',
  'Stacking the blocks...',
  'Sweeping up the junk...',
  'Your receipts and invoices stay safe.',
  'Big batches can take a minute.',
];

export default function MailActionOverlay() {
  const [progress, setProgress] = useState<MailActionProgress | null>(null);
  const [tip, setTip] = useState(0);

  useEffect(
    () =>
      addMailActionListener({
        onStart: (p) => {
          setTip(0);
          setProgress(p);
        },
        onFinish: () => setProgress(null),
      }),
    []
  );

  useEffect(() => {
    if (!progress) return;
    const timer = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 2500);
    return () => clearInterval(timer);
  }, [progress]);

  if (!progress) return null;

  const { verb, icon: Icon, tile, iconColor } = COPY[progress.action];
  const what =
    progress.label ??
    (progress.count !== undefined
      ? `${progress.count.toLocaleString()} email${progress.count === 1 ? '' : 's'}`
      : 'your emails');

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="mail-action-title"
      aria-describedby="mail-action-tip"
    >
      <div className="w-full max-w-sm bg-cream rounded-3xl border-2 border-ink/10 shadow-2xl p-8 text-center">
        <div className="relative inline-flex mb-5">
          <div className={`w-20 h-20 ${tile} rounded-3xl border-2 border-ink/10 shadow-lg flex items-center justify-center -rotate-6`}>
            <Icon className={`w-10 h-10 ${iconColor}`} />
          </div>
          <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-white rounded-2xl border-2 border-ink/10 shadow-md flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-ink animate-spin" />
          </div>
        </div>
        <h2 id="mail-action-title" className="text-2xl font-bold text-ink mb-2">
          Hold tight!
        </h2>
        <p className="text-lg text-ink font-semibold mb-1">
          We're {verb} {what}
        </p>
        <p id="mail-action-tip" className="text-ink/70 min-h-[1.5rem]" aria-live="polite">
          {TIPS[tip]}
        </p>
      </div>
    </div>
  );
}
