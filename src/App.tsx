import { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ConnectMailbox from './components/ConnectMailbox';
import Dashboard from './components/Dashboard';
import SignIn from './components/SignIn';
import ResetPassword from './components/ResetPassword';
import LegalPage, { legalPageForPath } from './components/LegalPage';
import { BillingProvider } from './contexts/BillingContext';
import MailActionOverlay from './components/MailActionOverlay';
import { supabase } from './lib/supabase';
import { useI18n } from './lib/i18n';

function Loading() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-4 border-mint-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-ink/75">{t('Loading...')}</p>
      </div>
    </div>
  );
}

// Signed in: people without a connected mailbox go through the connect
// screens first, then into the app.
function SignedInApp({ userId }: { userId: string }) {
  const [mailbox, setMailbox] = useState<'checking' | 'connected' | 'none'>('checking');

  const checkMailbox = useCallback(async () => {
    const { data } = await supabase.from('users').select('connected_account_id').eq('id', userId).maybeSingle();
    setMailbox(data?.connected_account_id ? 'connected' : 'none');
  }, [userId]);

  useEffect(() => {
    checkMailbox();
  }, [checkMailbox]);

  if (mailbox === 'checking') return <Loading />;
  if (mailbox === 'none') return <ConnectMailbox onConnected={checkMailbox} />;

  return (
    <BillingProvider>
      <Dashboard onMailboxDisconnected={() => setMailbox('none')} />
      <MailActionOverlay />
    </BillingProvider>
  );
}

function AppContent() {
  const { user, loading, recoveringPassword } = useAuth();

  // Legal pages are public, signed in or not.
  const legalPage = legalPageForPath(window.location.pathname);
  if (legalPage) return <LegalPage page={legalPage} />;

  if (loading) return <Loading />;
  if (!user) return <SignIn />;
  if (recoveringPassword) return <ResetPassword />;
  return <SignedInApp key={user.id} userId={user.id} />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
