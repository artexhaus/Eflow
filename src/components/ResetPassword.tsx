import { useState } from 'react';
import { Lock, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { t, tKnown, useI18n } from '../lib/i18n';
import LanguageToggle from './LanguageToggle';

const MIN_PASSWORD = 8;

// Shown after the user opens the "reset your password" email link: they are
// signed in with a recovery session and choose a new password here.
export default function ResetPassword() {
  const { updatePassword, finishPasswordRecovery } = useAuth();
  useI18n();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD) return setError(t('Passwords need at least {n} characters.', { n: MIN_PASSWORD }));
    if (password !== confirm) return setError(t("Those passwords don't match."));
    setBusy(true);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(tKnown((err as Error).message) || t('Could not update your password. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-mint-100 via-sunny-100 to-berry-100 flex items-center justify-center p-4 pt-16">
      <LanguageToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border-2 border-ink/10 p-6 sm:p-8">
        {done ? (
          <div className="text-center">
            <CheckCircle className="w-14 h-14 text-mint-600 mx-auto mb-4" />
            <h1 className="font-display text-2xl font-bold text-ink mb-2">{t('Password updated')}</h1>
            <p className="text-ink/75 mb-6">{t("You're signed in with your new password.")}</p>
            <button
              onClick={finishPasswordRecovery}
              className="w-full py-4 rounded-2xl text-lg font-display font-semibold text-ink bg-mint-200 hover:bg-mint-300 border-2 border-ink/15 shadow-lg"
            >
              {t('Continue to Eflow')}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <h1 className="font-display text-2xl font-bold text-ink">{t('Choose a new password')}</h1>
            <p className="text-ink/70">{t("Pick something you haven't used before, at least {n} characters.", { n: MIN_PASSWORD })}</p>
            {[
              { label: t('New password'), value: password, set: setPassword },
              { label: t('Confirm new password'), value: confirm, set: setConfirm },
            ].map(({ label, value, set }) => (
              <label key={label} className="block">
                <span className="block text-sm font-semibold text-ink/85 mb-1">{label}</span>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink/40" />
                  <input
                    type="password"
                    required
                    minLength={MIN_PASSWORD}
                    autoComplete="new-password"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border-2 border-ink/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-mint-400"
                  />
                </div>
              </label>
            ))}
            {error && (
              <p className="flex items-start gap-2 text-sm bg-berry-50 text-berry-800 border-2 border-berry-200 rounded-2xl p-3" role="alert">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-lg font-display font-semibold text-ink bg-mint-200 hover:bg-mint-300 border-2 border-ink/15 shadow-lg disabled:opacity-60"
            >
              {busy && <Loader2 className="w-5 h-5 animate-spin" />}
              <span>{t('Save new password')}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
