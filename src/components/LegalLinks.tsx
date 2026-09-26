import { LEGAL } from '../lib/legal';
import { useI18n } from '../lib/i18n';

// Footer links to the legal pages, shown on sign-in, onboarding and the app.
export default function LegalLinks({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t('Legal')} className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-ink/60 ${className}`}>
      <a href="/privacy" className="hover:text-ink underline-offset-4 hover:underline">{t('Privacy')}</a>
      <a href="/terms" className="hover:text-ink underline-offset-4 hover:underline">{t('Terms')}</a>
      <a href="/refunds" className="hover:text-ink underline-offset-4 hover:underline">{t('Refunds')}</a>
      <a href={`mailto:${LEGAL.contactEmail}`} className="hover:text-ink underline-offset-4 hover:underline">{t('Contact')}</a>
      <span>© {new Date().getFullYear()} {LEGAL.company}</span>
    </nav>
  );
}
