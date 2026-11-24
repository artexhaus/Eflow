import { useEffect, useRef } from 'react';
import { useI18n } from '../lib/i18n';

interface SelectAllToggleProps {
  // Everything in the list as currently filtered, not just what's on screen.
  total: number;
  selected: number;
  onSelectAll: () => void;
  onClear: () => void;
  disabled?: boolean;
  // 'emails' or 'senders', for the wording.
  noun?: 'emails' | 'senders';
  className?: string;
}

// The one "Select all" used on every list. It always means the whole list,
// with the number in the label, so what you tick is what gets acted on:
//   nothing ticked  -> "Select all (697)"
//   some ticked     -> "12 of 697 selected"   (box shows a dash)
//   all ticked      -> "All 697 selected"
// Unticking the box clears the selection; "Clear" does the same.
export default function SelectAllToggle({
  total,
  selected,
  onSelectAll,
  onClear,
  disabled,
  noun = 'emails',
  className = '',
}: SelectAllToggleProps) {
  const { t, formatNumber } = useI18n();
  const box = useRef<HTMLInputElement>(null);
  const all = total > 0 && selected >= total;
  const some = selected > 0 && !all;

  useEffect(() => {
    if (box.current) box.current.indeterminate = some;
  }, [some]);

  const n = formatNumber(total);
  const label = all
    ? noun === 'senders'
      ? t('All {n} senders selected', { n })
      : t('All {n} emails selected', { n })
    : some
      ? t('{done} of {total} selected', { done: formatNumber(selected), total: n })
      : t('Select all ({n})', { n });

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          ref={box}
          type="checkbox"
          checked={all}
          onChange={() => (selected > 0 ? onClear() : onSelectAll())}
          disabled={disabled || total === 0}
          aria-label={label}
          className="w-5 h-5 rounded border-gray-300 text-mint-600 focus:ring-mint-500"
        />
        <span className="font-medium text-ink/85">{label}</span>
      </label>
      {some && (
        <button
          type="button"
          onClick={onSelectAll}
          disabled={disabled}
          className="text-sm font-semibold text-ocean-700 hover:underline disabled:opacity-50"
        >
          {t('Select all')}
        </button>
      )}
      {selected > 0 && (
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="text-sm font-semibold text-ink/70 hover:underline disabled:opacity-50"
        >
          {t('Clear')}
        </button>
      )}
    </div>
  );
}
