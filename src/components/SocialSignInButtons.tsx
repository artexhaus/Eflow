import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { fetchEnabledProviders, signInWithProvider, type SocialProvider } from '../lib/socialAuth';

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
    </svg>
  );
}

// "Continue with Google / Apple" on the sign-in screen, plus the divider to
// the email form. Renders nothing until at least one provider is switched on
// in Supabase. Styled per each company's branding rules: Google's white
// button with the four-colour G, Apple's black button with the white logo.
export default function SocialSignInButtons({ onError }: { onError: (message: string) => void }) {
  const { t } = useI18n();
  const [providers, setProviders] = useState<Record<SocialProvider, boolean> | null>(null);
  const [busy, setBusy] = useState<SocialProvider | null>(null);

  useEffect(() => {
    let active = true;
    fetchEnabledProviders().then((p) => active && setProviders(p));
    return () => {
      active = false;
    };
  }, []);

  // On the local dev server both buttons always show, so the design can be
  // checked before a provider is set up in Supabase. Production builds only
  // show providers that are switched on.
  const shown: Record<SocialProvider, boolean> | null =
    providers && (import.meta.env.DEV ? { google: true, apple: true } : providers);
  if (!shown || (!shown.google && !shown.apple)) return null;

  const start = async (provider: SocialProvider) => {
    if (!providers?.[provider]) {
      // Only reachable on the dev server.
      onError(`${provider === 'google' ? 'Google' : 'Apple'} sign-in isn't set up in Supabase yet - see SOCIAL_LOGIN_SETUP.md. (Only shown while developing.)`);
      return;
    }
    setBusy(provider);
    try {
      await signInWithProvider(provider); // leaves the page on success
    } catch {
      onError(t("That sign-in didn't go through. Please try again, or use your email and password."));
      setBusy(null);
    }
  };

  const base =
    'w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl text-base font-display font-semibold border-2 shadow-md transition disabled:opacity-60';

  return (
    <div className="mb-6">
      <div className="space-y-3">
        {shown.google && (
          <button
            type="button"
            onClick={() => start('google')}
            disabled={busy !== null}
            className={`${base} bg-white text-[#1f1f1f] border-[#747775]/40 hover:bg-gray-50`}
          >
            {busy === 'google' ? <Loader2 className="w-5 h-5 animate-spin" /> : <GoogleLogo />}
            <span>{t('Continue with Google')}</span>
          </button>
        )}
        {shown.apple && (
          <button
            type="button"
            onClick={() => start('apple')}
            disabled={busy !== null}
            className={`${base} bg-black text-white border-black hover:bg-black/85`}
          >
            {busy === 'apple' ? <Loader2 className="w-5 h-5 animate-spin" /> : <AppleLogo />}
            <span>{t('Continue with Apple')}</span>
          </button>
        )}
      </div>
      <p className="text-xs text-ink/60 text-center mt-3">
        {t('By continuing you agree to the')}{' '}
        <a href="/terms" className="underline">{t('Terms of Service')}</a> {t('and')}{' '}
        <a href="/privacy" className="underline">{t('Privacy Policy')}</a>.
      </p>
      <div className="flex items-center gap-3 mt-5" aria-hidden="true">
        <div className="flex-1 h-0.5 bg-ink/10 rounded-full" />
        <span className="text-sm text-ink/60">{t('or use your email')}</span>
        <div className="flex-1 h-0.5 bg-ink/10 rounded-full" />
      </div>
    </div>
  );
}
