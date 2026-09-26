import { useI18n, type Lang } from '../lib/i18n';

const OPTIONS: { lang: Lang; label: string; name: string }[] = [
  { lang: 'en', label: 'EN', name: 'English' },
  { lang: 'es', label: 'ES', name: 'Español' },
];

// English / Spanish switch. Each option is named in its own language, so it
// can be found whichever language the page is currently in. compact is a
// single button showing the language it switches to, for the phone top bar.
export default function LanguageToggle({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { lang, setLanguage, t } = useI18n();
  if (compact) {
    const other = OPTIONS.find((option) => option.lang !== lang)!;
    return (
      <button
        type="button"
        lang={other.lang}
        onClick={() => setLanguage(other.lang)}
        aria-label={other.name}
        title={other.name}
        className={`px-1.5 py-1 rounded-lg bg-white border-2 border-ink/10 shadow-sm text-xs font-display font-bold text-ink flex-shrink-0 ${className}`}
      >
        {other.label}
      </button>
    );
  }
  return (
    <div
      role="group"
      aria-label={t('Language')}
      className={`inline-flex items-center p-0.5 bg-white rounded-xl border-2 border-ink/10 shadow-sm flex-shrink-0 ${className}`}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.lang}
          type="button"
          lang={option.lang}
          onClick={() => setLanguage(option.lang)}
          aria-pressed={lang === option.lang}
          aria-label={option.name}
          title={option.name}
          className={`px-2 py-1 rounded-lg text-xs font-display font-bold transition ${
            lang === option.lang ? 'bg-mint-200 text-ink shadow-sm' : 'text-ink/60 hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
