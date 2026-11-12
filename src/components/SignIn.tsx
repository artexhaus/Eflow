import { useState } from 'react';
import { Mail, Lock, Loader2, AlertCircle, CheckCircle, ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import SpeedLogo from './SpeedLogo';
import LegalLinks from './LegalLinks';
import LanguageToggle from './LanguageToggle';
import SocialSignInButtons from './SocialSignInButtons';
import { t, tKnown, useI18n } from '../lib/i18n';
import { track } from '../lib/analytics';
import signInBackground from '../assets/signin-background.jpg';

// Matches the `wide` screen in tailwind.config.js.
const WIDE_MEDIA = '(min-width: 768px) and (min-aspect-ratio: 5/4)';
// A 1px transparent image: lets wide screens skip downloading the portrait art.
const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

type Mode = 'signin' | 'signup' | 'forgot';

const MIN_PASSWORD = 8;

// "Remember me" keeps only the email on this device. The password is never
// stored by Eflow: we hand it to the browser's own password manager
// (Keychain, Google Password Manager, 1Password...), which stores it encrypted.
const REMEMBER_KEY = 'eflow:rememberedEmail';

function readRememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveRememberedEmail(email: string | null) {
  try {
    if (email) localStorage.setItem(REMEMBER_KEY, email);
    else localStorage.removeItem(REMEMBER_KEY);
  } catch {
    // Private mode or blocked storage: nothing to remember, sign-in still works.
  }
}

type PasswordCredentialCtor = new (data: { id: string; password: string; name?: string }) => Credential;

// Chrome and Edge show their "Save password?" prompt from this call. Other
// browsers offer to save on their own when the sign-in form succeeds.
async function offerToSavePassword(email: string, password: string) {
  const Ctor = (window as unknown as { PasswordCredential?: PasswordCredentialCtor }).PasswordCredential;
  if (!Ctor || !navigator.credentials?.store) return;
  try {
    await navigator.credentials.store(new Ctor({ id: email, password, name: email }));
  } catch {
    // The user dismissed it or the browser declined; nothing to do.
  }
}

// Supabase's messages are technical; say what the user should do instead.
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return t("That email and password don't match. Try again or reset your password.");
  if (m.includes('already registered') || m.includes('already been registered')) {
    return t('An account with this email already exists. Sign in instead.');
  }
  if (m.includes('email not confirmed')) return t('Please confirm your email first - check your inbox for the link we sent.');
  if (m.includes('rate limit') || m.includes('too many')) return t('Too many attempts. Please wait a minute and try again.');
  if (m.includes('password')) return tKnown(message);
  return t('Something went wrong. Please try again.');
}

export default function SignIn() {
  const { signIn, signUp, sendPasswordReset, linkError } = useAuth();
  useI18n();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState(readRememberedEmail);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(linkError ?? '');
  const [notice, setNotice] = useState('');

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (mode !== 'forgot' && password.length < MIN_PASSWORD) {
      setError(t('Passwords need at least {n} characters.', { n: MIN_PASSWORD }));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        track('signed_in', { method: 'email', remember: remember });
        saveRememberedEmail(remember ? email.trim() : null);
        if (remember) void offerToSavePassword(email.trim(), password);
      } else if (mode === 'signup') {
        const result = await signUp(email, password);
        track('signed_up', { method: 'email', needs_confirmation: result === 'confirm_email' });
        saveRememberedEmail(remember ? email.trim() : null);
        if (remember) void offerToSavePassword(email.trim(), password);
        if (result === 'confirm_email') {
          setNotice(t('Almost there! We sent a confirmation link to {email}. Open it, then sign in here.', { email: email.trim() }));
          setMode('signin');
          setPassword('');
        }
      } else {
        await sendPasswordReset(email);
        // Same message whether or not the account exists, so this form can't
        // be used to discover who has an account.
        setNotice(t('If an account exists for {email}, a reset link is on its way. Check your inbox (and spam).', { email: email.trim() }));
      }
    } catch (err) {
      track('auth_failed', { mode });
      setError(friendlyAuthError((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'signup' ? t('Create your account') : mode === 'forgot' ? t('Reset your password') : t('Welcome back');
  const button = mode === 'signup' ? t('Create account') : mode === 'forgot' ? t('Send reset link') : t('Sign in');

  return (
    <div className="signin-page relative isolate min-h-screen overflow-x-hidden">
      <LanguageToggle className="absolute top-4 right-4 z-20" />
      <div className="relative flex flex-col items-center px-4 pt-14 pb-8 wide:min-h-screen wide:pt-5 wide:pb-[5vh]">
        <div className="text-center w-full max-w-md">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-mint-200 rounded-2xl mb-2 shadow-2xl">
            <Mail className="w-6 h-6 text-ink" />
          </div>
          <div>
            <SpeedLogo className="text-4xl -ml-[1.4em]" />
          </div>
          <p className="text-lg text-ink/80 mt-1 [text-shadow:0_1px_10px_rgb(255_255_255_/_0.9)]">
            {t('Reset your inbox. Automatically.')}
          </p>
        </div>

        {/* Phones and upright tablets: the portrait illustration as a picture
            between the logo and the form. Wide screens show the landscape
            illustration as the page background instead (see index.css). */}
        <picture className="contents wide:hidden">
          <source media={WIDE_MEDIA} srcSet={BLANK_GIF} />
          <img
            src={signInBackground}
            alt=""
            aria-hidden="true"
            decoding="async"
            className="signin-scene block w-screen max-w-none"
          />
        </picture>

        <div className="relative z-10 w-full max-w-md -mt-[20vw] wide:mt-auto wide:pt-6">
        <div className="bg-white rounded-3xl shadow-2xl border-2 border-ink/10 p-6 sm:p-8">
          {mode !== 'forgot' && (
            <div className="grid grid-cols-2 gap-2 p-1 bg-cream rounded-2xl border-2 border-ink/10 mb-6" role="tablist">
              {(['signin', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => switchMode(m)}
                  className={`py-2.5 rounded-xl font-display font-semibold transition ${
                    mode === m ? 'bg-mint-200 text-ink shadow-sm' : 'text-ink/70 hover:text-ink'
                  }`}
                >
                  {m === 'signin' ? t('Sign in') : t('Create account')}
                </button>
              ))}
            </div>
          )}

          {mode === 'forgot' && (
            <button
              onClick={() => switchMode('signin')}
              className="flex items-center gap-1 text-ink/75 hover:text-ink mb-4 text-sm font-medium"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{t('Back to sign in')}</span>
            </button>
          )}

          <h1 className="font-display text-2xl font-bold text-ink mb-1">{title}</h1>
          <p className="text-ink/70 mb-6">
            {mode === 'signup'
              ? t('Your Eflow account keeps your settings, receipts and plan in one place.')
              : mode === 'forgot'
                ? t("Enter your email and we'll send you a link to choose a new password.")
                : t('Sign in to keep tidying your inbox.')}
          </p>

          {mode !== 'forgot' && (
            <SocialSignInButtons
              onError={(message) => {
                setNotice('');
                setError(message);
              }}
            />
          )}

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="block text-sm font-semibold text-ink/85 mb-1">{t('Email')}</span>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink/40" />
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  autoComplete={mode === 'signup' ? 'email' : 'username'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('you@example.com')}
                  className="w-full pl-10 pr-4 py-3 border-2 border-ink/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-mint-400"
                />
              </div>
            </label>

            {mode !== 'forgot' && (
              <label className="block">
                <span className="flex justify-between text-sm font-semibold text-ink/85 mb-1">
                  <span>{t('Password')}</span>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="font-semibold text-ocean-700 hover:text-ocean-900"
                    >
                      {t('Forgot password?')}
                    </button>
                  )}
                </span>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink/40" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    name="password"
                    required
                    minLength={MIN_PASSWORD}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? t('At least {n} characters', { n: MIN_PASSWORD }) : t('Your password')}
                    className="w-full pl-10 pr-12 py-3 border-2 border-ink/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-mint-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t('Hide password') : t('Show password')}
                    aria-pressed={showPassword}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl text-ink/50 hover:text-ink hover:bg-cream"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {mode === 'signup' && (
                  <span className="block text-xs text-ink/60 mt-1">
                    {t("This is your Eflow password - not your email account's password.")}
                  </span>
                )}
              </label>
            )}

            {mode !== 'forgot' && (
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded-md border-2 border-ink/20 text-mint-600 accent-mint-500 focus:ring-2 focus:ring-mint-400"
                />
                <span className="text-sm">
                  <span className="block font-semibold text-ink/85">{t('Remember me')}</span>
                  <span className="block text-xs text-ink/60">
                    {t("Saves your email here, and lets your browser offer to save your password. Don't use on a shared computer.")}
                  </span>
                </span>
              </label>
            )}

            {error && (
              <p className="flex items-start gap-2 text-sm bg-berry-50 text-berry-800 border-2 border-berry-200 rounded-2xl p-3" role="alert">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </p>
            )}
            {notice && (
              <p className="flex items-start gap-2 text-sm bg-mint-100 text-mint-900 border-2 border-mint-200 rounded-2xl p-3" role="status">
                <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{notice}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-lg font-display font-semibold text-ink bg-mint-200 hover:bg-mint-300 border-2 border-ink/15 shadow-lg transition disabled:opacity-60"
            >
              {busy && <Loader2 className="w-5 h-5 animate-spin" />}
              <span>{button}</span>
            </button>
          </form>

          {mode === 'signup' && (
            <p className="text-xs text-ink/60 text-center mt-4">
              {t('By creating an account you agree to the')}{' '}
              <a href="/terms" className="underline">{t('Terms of Service')}</a> {t('and')}{' '}
              <a href="/privacy" className="underline">{t('Privacy Policy')}</a>.
            </p>
          )}
        </div>

        <LegalLinks className="mt-6 mx-auto w-fit rounded-2xl bg-white/60 backdrop-blur-md px-4 py-2" />
        </div>
      </div>
    </div>
  );
}
