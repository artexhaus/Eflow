import { useState } from 'react';
import { Mail, Lock, AlertCircle, ChevronLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ImapLoginProps {
  provider: string;
  providerName: string;
  onComplete: () => void;
  onBack: () => void;
}

const providerAppPasswordInstructions: Record<string, { steps: string[]; link: string; linkText: string }> = {
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
  },
};

export default function ImapLogin({ provider, providerName, onComplete, onBack }: ImapLoginProps) {
  const [email, setEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const instructions = providerAppPasswordInstructions[provider];

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!email || !appPassword) {
        throw new Error('Please enter both your email and app password');
      }

      let user = await getCurrentUser();

      if (!user) {
        const demoEmail = `demo@${provider}.com`;
        const demoPassword = 'demo123456';

        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: demoEmail,
          password: demoPassword,
        });

        if (authError) {
          // Account doesn't exist yet, create it
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: demoEmail,
            password: demoPassword,
          });

          if (signUpError) {
            throw new Error(`Failed to create account: ${signUpError.message}`);
          }

          if (signUpData.user) {
            // Create the users table row
            await supabase.from('users').insert({
              id: signUpData.user.id,
              email: signUpData.user.email || demoEmail,
              email_provider: provider,
            });
          }

          user = signUpData.user ?? undefined;
        } else if (data.user) {
          user = data.user;
        }
      }

      if (!user) throw new Error('Failed to authenticate user');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session found');

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
        let errorText = `Failed to connect to ${providerName}. Please check your credentials.`;
        try {
          const errorData = await response.json();
          if (errorData?.error) errorText = errorData.error;
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
        throw new Error(result.error || 'Connection failed');
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

  const accentColor = provider === 'gmail' ? 'red' : provider === 'outlook' ? 'blue' : provider === 'yahoo' ? 'green' : 'cyan';
  const accentClasses: Record<string, { bg: string; ring: string; gradient: string }> = {
    red: { bg: 'bg-red-50', ring: 'focus:ring-red-500', gradient: 'from-red-500 to-orange-500' },
    blue: { bg: 'bg-blue-50', ring: 'focus:ring-blue-500', gradient: 'from-blue-500 to-blue-600' },
    green: { bg: 'bg-green-50', ring: 'focus:ring-green-500', gradient: 'from-green-500 to-green-600' },
    cyan: { bg: 'bg-cyan-50', ring: 'focus:ring-cyan-500', gradient: 'from-cyan-500 to-blue-500' },
  };
  const accent = accentClasses[accentColor];

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <button
          onClick={onBack}
          className="mb-6 text-gray-600 hover:text-gray-900 font-medium transition flex items-center space-x-1"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to providers</span>
        </button>

        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className={`inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br ${accent.gradient} rounded-2xl mb-4 shadow-lg`}>
              <Mail className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Connect {providerName}
            </h2>
            <p className="text-gray-600 mb-4">
              Sign in with an app-specific password (IMAP)
            </p>
            <div className={`${accent.bg} border border-gray-200 rounded-lg p-4 text-left`}>
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-gray-700">
                  <p className="font-semibold mb-1">Create an app password:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    {instructions.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                  <a
                    href={instructions.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 text-xs font-medium text-emerald-600 hover:text-emerald-700 underline"
                  >
                    {instructions.linkText} →
                  </a>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {providerName} Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`your-email@${provider === 'gmail' ? 'gmail' : provider === 'outlook' ? 'outlook' : provider === 'yahoo' ? 'yahoo' : 'icloud'}.com`}
                required
                className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 ${accent.ring} focus:border-transparent transition`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                App Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  placeholder="Enter your app password"
                  required
                  className={`w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 ${accent.ring} focus:border-transparent transition`}
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full bg-gradient-to-r ${accent.gradient} text-white py-4 rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-50 shadow-lg hover:shadow-xl`}
            >
              {loading ? 'Connecting...' : `Connect ${providerName}`}
            </button>
          </form>

          <div className="mt-4 text-center">
            <p className="text-xs text-gray-500">
              Your password is used to connect via IMAP and stored securely. We never use your regular password.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
