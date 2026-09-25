import { LEGAL } from '../lib/legal';

// Footer links to the legal pages, shown on sign-in, onboarding and the app.
export default function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-ink/60 ${className}`}>
      <a href="/privacy" className="hover:text-ink underline-offset-4 hover:underline">Privacy</a>
      <a href="/terms" className="hover:text-ink underline-offset-4 hover:underline">Terms</a>
      <a href="/refunds" className="hover:text-ink underline-offset-4 hover:underline">Refunds</a>
      <a href={`mailto:${LEGAL.contactEmail}`} className="hover:text-ink underline-offset-4 hover:underline">Contact</a>
      <span>© {new Date().getFullYear()} {LEGAL.company}</span>
    </nav>
  );
}
