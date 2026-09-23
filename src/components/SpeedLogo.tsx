interface SpeedLogoProps {
  className?: string;
}

// One streak per theme colour. Widths/offsets are in em so the effect scales
// with whatever font size the logo is rendered at (nav bar or sign-in title).
const LINES = [
  { color: 'bg-berry-300', width: '1.05em', top: '22%', delay: '0s' },
  { color: 'bg-ocean-300', width: '0.7em', top: '40%', delay: '0.08s' },
  { color: 'bg-mint-300', width: '1.2em', top: '58%', delay: '0.03s' },
  { color: 'bg-sunny-300', width: '0.8em', top: '76%', delay: '0.12s' },
];

// The "Eflow" wordmark: zooms in leaning forward with speed lines trailing
// behind, then "revs" every few seconds. Animations live in index.css and are
// switched off for people who prefer reduced motion.
export default function SpeedLogo({ className = '' }: SpeedLogoProps) {
  return (
    <h1 className={`speed-logo font-display font-bold text-ink ${className}`}>
      <span className="speed-logo__lines" aria-hidden="true">
        {LINES.map((line) => (
          <span
            key={line.color}
            className={`speed-logo__line ${line.color}`}
            style={{ width: line.width, top: line.top, animationDelay: line.delay }}
          />
        ))}
      </span>
      <span className="speed-logo__word">Eflow</span>
    </h1>
  );
}
