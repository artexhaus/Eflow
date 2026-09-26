import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ProviderSelection from './ProviderSelection';
import ImapLogin from './ImapLogin';
import LegalLinks from './LegalLinks';
import LanguageToggle from './LanguageToggle';
import { useI18n } from '../lib/i18n';

const providerNames: Record<string, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo Mail',
  icloud: 'iCloud Mail',
};

interface ConnectMailboxProps {
  // Called once imap-connect has saved the mailbox, so the app can move on.
  onConnected: () => void;
}

// Onboarding for a signed-in user without a mailbox: choose a provider, then
// enter that mailbox's app password. The first scan starts automatically on
// the dashboard (connected_account_id set, last_scan still empty).
export default function ConnectMailbox({ onConnected }: ConnectMailboxProps) {
  const { user, signOut } = useAuth();
  const [provider, setProvider] = useState('');
  const { t } = useI18n();

  return (
    <div className="relative">
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-end gap-3 px-4 py-3 text-sm text-ink/75">
        <span className="truncate min-w-0">{t('Signed in as {email}', { email: user?.email ?? '' })}</span>
        <LanguageToggle />
        <button onClick={() => signOut()} className="flex items-center gap-1 font-semibold hover:text-ink flex-shrink-0">
          <LogOut className="w-4 h-4" />
          <span>{t('Sign out')}</span>
        </button>
      </div>

      {provider ? (
        <ImapLogin
          provider={provider}
          providerName={providerNames[provider] || provider}
          onComplete={onConnected}
          onBack={() => setProvider('')}
        />
      ) : (
        <ProviderSelection onProviderSelect={setProvider} />
      )}

      <LegalLinks className="pb-6 -mt-4" />
    </div>
  );
}
