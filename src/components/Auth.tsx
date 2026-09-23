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
    setStep('fetching');
    setFetchError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session found');

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/imap-fetch`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch emails');
      }

      // The auth state change will trigger the dashboard to load
      // with the user's real emails already in the database
    } catch (err) {
      console.error('Fetch error:', err);
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
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-800 shadow-lg">
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
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full mb-6 shadow-lg animate-pulse">
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
