import { useState } from 'react';
import { supabase } from '../lib/supabase';
import ProviderSelection from './ProviderSelection';
import ImapLogin from './ImapLogin';

type AuthStep = 'provider' | 'imap' | 'fetching';

const providerNames: Record<string, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo Mail',
  icloud: 'iCloud Mail',
};

export default function Auth() {
  const [step, setStep] = useState<AuthStep>('provider');
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [fetchError, setFetchError] = useState('');

  const handleProviderSelect = (provider: string) => {
    setSelectedProvider(provider);
    setStep('imap');
  };

  const handleImapComplete = async () => {
    // Show a brief "fetching" transition screen. The actual (potentially
    // multi-chunk) inbox scan is kicked off automatically by Dashboard's
    // auto-scan effect once the auth session updates and the user lands
    // there (connected_account_id is set but last_scan is still null).
    // Doing the scan here too would race with that effect and, since a
    // large mailbox needs many chunked imap-fetch calls to finish, a single
    // call here would only ever fetch the first chunk anyway.
    setStep('fetching');
    setFetchError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session found');
      // The auth state change will trigger the dashboard to load and begin
      // scanning automatically.
    } catch (err) {
      console.error('Post-connect error:', err);
      setFetchError((err as Error).message);
      setStep('imap');
    }
  };

  const handleBack = () => {
    setStep('provider');
    setSelectedProvider('');
  };

  if (step === 'provider') {
    return <ProviderSelection onProviderSelect={handleProviderSelect} />;
  }

  if (step === 'imap') {
    return (
      <>
        {fetchError && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-berry-50 border border-berry-200 rounded-lg px-4 py-2 text-sm text-berry-800 shadow-lg">
            {fetchError}
          </div>
        )}
        <ImapLogin
          provider={selectedProvider}
          providerName={providerNames[selectedProvider] || selectedProvider}
          onComplete={handleImapComplete}
          onBack={handleBack}
        />
      </>
    );
  }

  if (step === 'fetching') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-mint-50 via-sunny-50 to-berry-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-mint-500 to-ocean-600 rounded-full mb-6 shadow-lg animate-pulse">
            <svg className="w-10 h-10 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Fetching your emails...</h3>
          <p className="text-gray-600">Reading your inbox and categorizing messages</p>
        </div>
      </div>
    );
  }

  return null;
}
