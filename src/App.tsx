import { AuthProvider, useAuth } from './contexts/AuthContext';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import { BillingProvider } from './contexts/BillingContext';
import MailActionOverlay from './components/MailActionOverlay';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-mint-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-ink/75">Loading...</p>
        </div>
      </div>
    );
  }

  return user ? (
    <BillingProvider>
      <Dashboard />
      <MailActionOverlay />
    </BillingProvider>
  ) : (
    <Auth />
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
