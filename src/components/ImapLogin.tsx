import { useState } from 'react';
import { Mail, Lock, AlertCircle, ChevronLeft, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { t, tKnown, useI18n, type MessageKey } from '../lib/i18n';

interface ImapLoginProps {
  provider: string;
  providerName: string;
  onComplete: () => void;
  onBack: () => void;
}

// Setup steps, plus where the app password lives and a provider tip for
// login errors (imap-connect reports the kind of failure as a code).
const providerAppPasswordInstructions: Record<
  string,
  { steps: MessageKey[]; link: string; linkText: MessageKey; passwordPage: MessageKey; tip: MessageKey }
> = {
  gmail: {
    steps: [
      'Go to your Google Account settings',
      'Enable 2-Step Verification (Security > 2-Step Verification)',
      'Search for "App passwords" in your account settings',
      'Create a new app password for "Mail"',
      'Use that 16-character password below',
    ],
    link: 'https://myaccount.google.com/apppasswords',
    linkText: 'Google App Passwords',
    passwordPage: 'Google Account > Security > App passwords',
    tip: 'IMAP must also be on: Gmail Settings > See all settings > Forwarding and POP/IMAP > Enable IMAP.',
  },
  yahoo: {
    steps: [
      'Go to Yahoo Account Security',
      'Enable 2-step verification',
      'Generate an app password',
      'Use it below instead of your regular password',
    ],
    link: 'https://login.yahoo.com/account/security',
    linkText: 'Yahoo Account Security',
    passwordPage: 'Yahoo Account Security > Generate app password',
    tip: 'Two-step verification must be turned on before Yahoo lets you create an app password.',
  },
  aol: {
    steps: [
      'Go to AOL Account Security',
      'Enable 2-step verification',
      'Select "Generate app password" and create one for "Eflow"',
      'Use it below instead of your regular password',
    ],
    link: 'https://login.aol.com/account/security',
    linkText: 'AOL Account Security',
    passwordPage: 'AOL Account Security > Generate app password',
    tip: 'Two-step verification must be turned on before AOL lets you create an app password.',
  },
  outlook: {
    steps: [
      'Go to your Microsoft Account security settings',
      'Enable two-step verification',
      'Create an app password',
      'Use that password below',
    ],
    link: 'https://account.live.com/proofs/manage/additional',
    linkText: 'Microsoft Account Security',
    passwordPage: 'Microsoft account > Security > Advanced security options > App passwords',
    tip: 'Two-step verification must be on. Some Outlook.com accounts no longer allow app passwords for mail apps.',
  },
  icloud: {
    steps: [
      'Go to appleid.apple.com and sign in',
      'Go to App-Specific Passwords section',
      'Generate a new app-specific password',
      'Use it below instead of your regular password',
    ],
    link: 'https://appleid.apple.com',
    linkText: 'Apple ID',
    passwordPage: 'account.apple.com > Sign-In and Security > App-Specific Passwords',
    tip: 'Use your full @icloud.com (or @me.com) address, not a Gmail or other address linked to your Apple Account.',
  },
};

export default function ImapLogin({ provider, providerName, onComplete, onBack }: ImapLoginProps) {
  const [email, setEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useI18n();
  const instructions = providerAppPasswordInstructions[provider];

  // The login error in the user's language, from imap-connect's code.
  const connectErrorMessage = (code: unknown, fallback: string) => {
    const vars = { provider: providerName, page: t(instructions.passwordPage), tip: t(instructions.tip) };
    if (code === 'auth_failed') {
      return t("{provider} didn't accept that login. Please check: (1) your full {provider} email address, (2) you're using an app password ({page}), not your regular password, (3) it was copied without typos. {tip}", vars);
    }
    if (code === 'unreachable') return t("Could not reach {provider}'s mail server. Please try again.", vars);
    if (code === 'rejected') {
      return t('{provider} rejected the login. Please make sure you created an app password ({page}) and pasted it here instead of your regular {provider} password. {tip}', vars);
    }
    return tKnown(fallback);
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!email || !appPassword) {
        throw new Error(t('Please enter both your email and app password'));
      }

      // The mailbox is attached to the signed-in Eflow account (each person
      // has their own; there is no shared/demo account).
      const user = await getCurrentUser();
      if (!user) throw new Error(t('Your session expired. Please sign in again, then connect your mailbox.'));

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t('Your session expired. Please sign in again, then connect your mailbox.'));

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/imap-connect`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password: appPassword,
          provider,
        }),
      });

      if (!response.ok) {
        let errorText = t('Failed to connect to {provider}. Please check your credentials.', { provider: providerName });
        try {
          const errorData = await response.json();
          if (errorData?.error) errorText = connectErrorMessage(errorData.code, errorData.error);
        } catch {
          try {
            const text = await response.text();
            if (text) errorText = text;
          } catch {
            // keep default
          }
        }
        throw new Error(errorText);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error ? tKnown(result.error) : t('Connection failed'));
      }

      onComplete();
    } catch (err) {
      console.error('IMAP connection error:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const getCurrentUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user;
  };

  const accentColor = provider === 'gmail' ? 'red' : provider === 'outlook' ? 'blue' : provider === 'yahoo' ? 'green' : provider === 'aol' ? 'blue' : 'cyan';
  const accentClasses: Record<string, { bg: string; ring: string; gradient: string }> = {
    red: { bg: 'bg-berry-50', ring: 'focus:ring-berry-500', gradient: 'from-berry-200 to-berry-200' },
    blue: { bg: 'bg-ocean-50', ring: 'focus:ring-ocean-500', gradient: 'from-ocean-200 to-ocean-200' },
    green: { bg: 'bg-mint-50', ring: 'focus:ring-mint-500', gradient: 'from-mint-200 to-mint-200' },
    cyan: { bg: 'bg-ocean-50', ring: 'focus:ring-ocean-500', gradient: 'from-ocean-200 to-ocean-200' },
  };
  const accent = accentClasses[accentColor];

  return (
    <div className="min-h-screen bg-gradient-to-br from-mint-100 via-sunny-100 to-berry-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <button
          onClick={onBack}
          className="mb-6 text-ink/75 hover:text-ink font-medium transition flex items-center space-x-1"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{t('Back to providers')}</span>
        </button>

        <div className="bg-white rounded-3xl shadow-2xl p-8 border-2 border-ink/10">
          <div className="text-center mb-8">
            <div className={`inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br ${accent.gradient} rounded-2xl mb-4 shadow-lg`}>
              <Mail className="w-8 h-8 text-ink" />
            </div>
            <h2 className="font-display text-2xl font-bold text-ink mb-2">
              {t('Connect {provider}', { provider: providerName })}
            </h2>
            <p className="text-ink/75 mb-4">
              {t('Sign in with an app-specific password (IMAP)')}
            </p>
            <div className={`${accent.bg} border-2 border-ink/10 rounded-xl p-4 text-left`}>
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-ink/75 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-ink/85">
                  <p className="font-semibold mb-1">{t('Create an app password:')}</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    {instructions.steps.map((step, i) => (
                      <li key={i}>{t(step)}</li>
                    ))}
                  </ol>
                  <a
                    href={instructions.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 text-xs font-medium text-mint-600 hover:text-mint-700 underline"
                  >
                    {t(instructions.linkText)} →
                  </a>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink/85 mb-2">
                {t('{provider} email', { provider: providerName })}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`${t('your-email')}@${provider === 'gmail' ? 'gmail' : provider === 'outlook' ? 'outlook' : provider === 'yahoo' ? 'yahoo' : provider === 'aol' ? 'aol' : 'icloud'}.com`}
                required
                className={`w-full px-4 py-3 border-2 border-ink/10 rounded-xl focus:ring-2 ${accent.ring} focus:border-transparent transition`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink/85 mb-2">
                {t('App password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  placeholder={t('Enter your app password')}
                  required
                  className={`w-full pl-10 pr-4 py-3 border-2 border-ink/10 rounded-xl focus:ring-2 ${accent.ring} focus:border-transparent transition`}
                />
              </div>
            </div>

            {error && (
              <div className="bg-berry-50 border border-berry-200 rounded-xl p-4">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-5 h-5 text-berry-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-berry-800">{error}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full bg-gradient-to-r ${accent.gradient} text-ink py-4 rounded-2xl font-semibold hover:opacity-90 transition disabled:opacity-50 shadow-lg hover:shadow-xl`}
            >
              <span className="inline-flex items-center justify-center space-x-2">
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                <span>{loading ? t('Connecting...') : t('Connect {provider}', { provider: providerName })}</span>
              </span>
            </button>
          </form>

          <div className="mt-4 text-center">
            <p className="text-xs text-ink/70">
              {t('Your password is used to connect via IMAP and stored securely. We never use your regular password.')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
