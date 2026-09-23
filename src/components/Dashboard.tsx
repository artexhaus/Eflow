import { useState, useEffect } from 'react';
import { Mail, Sparkles, Trash2, Package, LogOut, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Email, Bundle } from '../lib/types';
import ImportantEmails from './ImportantEmails';
import ClutterEmails from './ClutterEmails';
import BundlesList from './BundlesList';
import InboxReset from './InboxReset';
import UnreadEmails from './UnreadEmails';

type Screen = 'dashboard' | 'important' | 'clutter' | 'bundles' | 'reset' | 'unread';

interface ScanResult {
  fetched: number;
  important: number;
  clutter: number;
  bundles: number;
  bundle_groups: number;
}

interface ScanChunkResponse {
  success: boolean;
  done: boolean;
  fetched: number;
  total_in_inbox: number;
  scanned_so_far: number;
  important: number;
  clutter: number;
  bundles: number;
  bundle_groups: number;
}

interface ScanProgress {
  scannedSoFar: number;
  totalInInbox: number;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [emails, setEmails] = useState<Email[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState('');
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);

  useEffect(() => {
    loadData();
  }, [user]);

  useEffect(() => {
    if (!user || loading) return;

    const checkAndAutoScan = async () => {
      const { data: userData } = await supabase
        .from('users')
        .select('email_provider, connected_account_id, last_scan')
        .eq('id', user.id)
        .maybeSingle();

      if (userData?.connected_account_id && !userData?.last_scan) {
        simulateScan();
      }
    };

    checkAndAutoScan();
  }, [user, loading]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && user) {
        loadData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      const emailsRes = await supabase
        .from('emails')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_deleted', false);
      const bundlesRes = await supabase.from('bundles').select('*').eq('user_id', user.id);

      if (emailsRes.data) setEmails(emailsRes.data);
      if (bundlesRes.data) setBundles(bundlesRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const simulateScan = async () => {
    if (!user) return;

    setScanning(true);
    setScanError('');
    setScanResult(null);
    setScanProgress(null);

    try {
      const { data: userData } = await supabase
        .from('users')
        .select('email_provider, connected_account_id')
        .eq('id', user.id)
        .maybeSingle();

      if (userData?.email_provider && userData?.connected_account_id) {
        // The inbox may contain thousands of messages, which cannot be fetched
        // in a single Edge Function call without hitting Supabase's resource
        // limits. Keep calling imap-fetch until it reports the scan is done,
        // fetching one bounded chunk each time and showing live progress.
        // Since a scan can take dozens of calls over several minutes, a single
        // transient IMAP hiccup (timeouts, brief server errors) shouldn't abort
        // the whole scan - retry a few times with backoff before giving up.
        const MAX_CONSECUTIVE_FAILURES = 5;
        let result: ScanChunkResponse | null = null;
        let done = false;
        let consecutiveFailures = 0;

        while (!done) {
          try {
            result = await fetchProviderEmailsChunk();
            consecutiveFailures = 0;
          } catch (chunkError) {
            consecutiveFailures++;
            console.error(`Scan chunk failed (attempt ${consecutiveFailures}):`, chunkError);
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              throw chunkError;
            }
            await new Promise((resolve) => setTimeout(resolve, 1000 * consecutiveFailures));
            continue;
          }

          if (!result) break;

          done = result.done;
          setScanProgress({
            scannedSoFar: result.scanned_so_far,
            totalInInbox: result.total_in_inbox,
          });
        }

        if (result) {
          setScanResult({
            fetched: result.scanned_so_far || 0,
            important: result.important || 0,
            clutter: result.clutter || 0,
            bundles: result.bundles || 0,
            bundle_groups: result.bundle_groups || 0,
          });
        }
      }

      await loadData();
    } catch (error) {
      console.error('Error during scan:', error);
      setScanError((error as Error).message);
    } finally {
      setScanning(false);
      setScanProgress(null);
    }
  };

  const fetchProviderEmailsChunk = async (): Promise<ScanChunkResponse | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/imap-fetch`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch emails');
    }

    return await response.json();
  };

  const importantCount = emails.filter((e) => e.category === 'important').length;
  const clutterCount = emails.filter((e) => e.category === 'clutter').length;
  const bundleEmailCount = emails.filter((e) => e.category === 'bundle').length;
  const unreadCount = emails.filter((e) => !e.is_read).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-emerald-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading your inbox...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                <Mail className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">Eflow</h1>
            </div>
            <button
              onClick={async () => {
                try {
                  await signOut();
                } catch (error) {
                  console.error('Sign out failed:', error);
                  alert('Failed to sign out. Please try again.');
                }
              }}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      </nav>

      {currentScreen === 'dashboard' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome back!</h2>
            <p className="text-gray-600">Here's your inbox overview</p>
          </div>

          {scanError && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Scan failed</p>
                <p className="text-sm text-red-700">{scanError}</p>
              </div>
            </div>
          )}

          {scanResult && !scanning && (
            <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-emerald-900">
                  Scan complete: {scanResult.fetched.toLocaleString()} emails fetched from your entire inbox
                </p>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-emerald-700">
                  <span>{scanResult.important.toLocaleString()} important</span>
                  <span>{scanResult.clutter.toLocaleString()} clutter</span>
                  <span>{scanResult.bundles.toLocaleString()} bundled</span>
                  <span>{scanResult.bundle_groups} bundle groups</span>
                </div>
              </div>
              <button
                onClick={() => setScanResult(null)}
                className="text-emerald-600 hover:text-emerald-800"
              >
                <span className="text-sm">Dismiss</span>
              </button>
            </div>
          )}

          {scanning && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-6">
              <div className="flex items-center space-x-3 mb-3">
                <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                <p className="font-medium text-blue-900">Scanning your entire inbox...</p>
              </div>
              {scanProgress && scanProgress.totalInInbox > 0 ? (
                <>
                  <div className="w-full bg-blue-100 rounded-full h-2 mb-2 overflow-hidden">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, Math.round((scanProgress.scannedSoFar / scanProgress.totalInInbox) * 100))}%`,
                      }}
                    />
                  </div>
                  <p className="text-sm text-blue-700">
                    {scanProgress.scannedSoFar.toLocaleString()} of {scanProgress.totalInInbox.toLocaleString()} emails scanned
                  </p>
                </>
              ) : (
                <p className="text-sm text-blue-700">
                  Fetching all emails from the very beginning. This may take a while if you have thousands of emails.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg hover:shadow-xl transition">
              <Mail className="w-8 h-8 mb-4 opacity-90" />
              <div className="text-3xl font-bold mb-1">{importantCount.toLocaleString()}</div>
              <div className="text-blue-100">Important Emails</div>
            </div>

            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg hover:shadow-xl transition">
              <Trash2 className="w-8 h-8 mb-4 opacity-90" />
              <div className="text-3xl font-bold mb-1">{clutterCount.toLocaleString()}</div>
              <div className="text-orange-100">Clutter Emails</div>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-lg hover:shadow-xl transition">
              <Package className="w-8 h-8 mb-4 opacity-90" />
              <div className="text-3xl font-bold mb-1">{bundles.length}</div>
              <div className="text-emerald-100">Email Bundles</div>
            </div>

            <button
              onClick={() => setCurrentScreen('unread')}
              className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg hover:shadow-xl transition text-left"
            >
              <Mail className="w-8 h-8 mb-4 opacity-90" />
              <div className="text-3xl font-bold mb-1">{unreadCount.toLocaleString()}</div>
              <div className="text-purple-100">Unread Emails</div>
            </button>
          </div>

          {emails.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
              <Mail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No emails yet</h3>
              <p className="text-gray-600 mb-6">Start by scanning your entire inbox to see all your emails organized</p>
              <button
                onClick={simulateScan}
                disabled={scanning}
                className="inline-flex items-center space-x-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-emerald-600 hover:to-teal-700 transition disabled:opacity-50 shadow-lg"
              >
                <RefreshCw className={scanning ? 'w-5 h-5 animate-spin' : 'w-5 h-5'} />
                <span>{scanning ? 'Scanning Entire Inbox...' : 'Scan Entire Inbox'}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-gray-900">
                  {emails.length.toLocaleString()} total emails loaded
                </h3>
                <button
                  onClick={simulateScan}
                  disabled={scanning}
                  className="flex items-center space-x-2 text-emerald-600 hover:text-emerald-700 font-medium transition disabled:opacity-50"
                >
                  <RefreshCw className={scanning ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
                  <span>{scanning ? 'Scanning...' : 'Rescan Entire Inbox'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  onClick={() => setCurrentScreen('important')}
                  className="bg-white rounded-xl p-6 hover:shadow-lg transition text-left border-2 border-transparent hover:border-blue-500"
                >
                  <Mail className="w-6 h-6 text-blue-500 mb-3" />
                  <div className="text-lg font-semibold text-gray-900 mb-1">Important</div>
                  <div className="text-sm text-gray-600">{importantCount.toLocaleString()} emails</div>
                </button>

                <button
                  onClick={() => setCurrentScreen('clutter')}
                  className="bg-white rounded-xl p-6 hover:shadow-lg transition text-left border-2 border-transparent hover:border-orange-500"
                >
                  <Trash2 className="w-6 h-6 text-orange-500 mb-3" />
                  <div className="text-lg font-semibold text-gray-900 mb-1">Clutter</div>
                  <div className="text-sm text-gray-600">{clutterCount.toLocaleString()} emails</div>
                </button>

                <button
                  onClick={() => setCurrentScreen('bundles')}
                  className="bg-white rounded-xl p-6 hover:shadow-lg transition text-left border-2 border-transparent hover:border-emerald-500"
                >
                  <Package className="w-6 h-6 text-emerald-500 mb-3" />
                  <div className="text-lg font-semibold text-gray-900 mb-1">Bundles</div>
                  <div className="text-sm text-gray-600">{bundles.length} groups ({bundleEmailCount.toLocaleString()} emails)</div>
                </button>

                <button
                  onClick={() => setCurrentScreen('reset')}
                  className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-6 hover:shadow-lg transition text-left"
                >
                  <Sparkles className="w-6 h-6 text-white mb-3" />
                  <div className="text-lg font-semibold text-white mb-1">Inbox Reset</div>
                  <div className="text-sm text-emerald-100">Delete all clutter & bundles</div>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {currentScreen === 'important' && (
        <ImportantEmails
          emails={emails.filter((e) => e.category === 'important')}
          onBack={() => setCurrentScreen('dashboard')}
          onRefresh={loadData}
        />
      )}

      {currentScreen === 'clutter' && (
        <ClutterEmails
          emails={emails.filter((e) => e.category === 'clutter')}
          onBack={() => setCurrentScreen('dashboard')}
          onRefresh={loadData}
        />
      )}

      {currentScreen === 'bundles' && (
        <BundlesList
          bundles={bundles}
          emails={emails.filter((e) => e.category === 'bundle')}
          onBack={() => setCurrentScreen('dashboard')}
          onRefresh={loadData}
        />
      )}

      {currentScreen === 'reset' && (
        <InboxReset
          importantCount={importantCount}
          clutterCount={clutterCount}
          bundleCount={bundleEmailCount}
          onBack={() => setCurrentScreen('dashboard')}
          onComplete={loadData}
        />
      )}

      {currentScreen === 'unread' && (
        <UnreadEmails
          emails={emails.filter((e) => !e.is_read)}
          onBack={() => setCurrentScreen('dashboard')}
          onRefresh={loadData}
        />
      )}
    </div>
  );
}
