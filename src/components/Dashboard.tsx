import { useState, useEffect, useMemo } from 'react';
import { Mail, Sparkles, Trash2, Package, LogOut, RefreshCw, CheckCircle, AlertCircle, Users, ChevronRight, LayoutGrid, Smile, Crown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Email, Bundle } from '../lib/types';
import ImportantEmails from './ImportantEmails';
import ClutterEmails from './ClutterEmails';
import BundlesList from './BundlesList';
import InboxReset from './InboxReset';
import UnreadEmails from './UnreadEmails';
import SendersList from './SendersList';
import SimpleHome from './SimpleHome';
import SpeedLogo from './SpeedLogo';
import AccountScreen from './AccountScreen';
import UpgradeBanner from './UpgradeBanner';
import { useBilling } from '../contexts/BillingContext';
import { groupBySender } from '../lib/senders';

type Screen = 'dashboard' | 'important' | 'clutter' | 'bundles' | 'reset' | 'unread' | 'senders' | 'account';

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

const SIMPLE_MODE_KEY = 'eflow:simpleMode';

// Simple mode is the default: one big clean-up button and two cards. People
// who want every tool can switch; the choice is remembered per browser.
function readSimpleMode(): boolean {
  try {
    return localStorage.getItem(SIMPLE_MODE_KEY) !== 'false';
  } catch {
    return true;
  }
}

interface ScanProgress {
  scannedSoFar: number;
  totalInInbox: number;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const billing = useBilling();
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [emails, setEmails] = useState<Email[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState('');
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [simpleMode, setSimpleMode] = useState(readSimpleMode);
  const [importantStartTab, setImportantStartTab] = useState<'all' | 'verified'>('all');

  const toggleSimpleMode = () => {
    const next = !simpleMode;
    setSimpleMode(next);
    setCurrentScreen('dashboard');
    try {
      localStorage.setItem(SIMPLE_MODE_KEY, String(next));
    } catch {
      // Storage unavailable (private mode etc.) - the toggle still works for this visit.
    }
  };

  const openImportant = (tab: 'all' | 'verified') => {
    setImportantStartTab(tab);
    setCurrentScreen('important');
  };

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
      // PostgREST returns at most 1000 rows per request, so page through the
      // table - otherwise every count on the dashboard silently caps at 1000.
      const PAGE = 1000;
      const allEmails: Email[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('emails')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_deleted', false)
          .eq('is_archived', false)
          .order('timestamp', { ascending: false })
          .order('id')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        allEmails.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
      }

      const bundlesRes = await supabase.from('bundles').select('*').eq('user_id', user.id);

      setEmails(allEmails);
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

  const topSenders = useMemo(() => groupBySender(emails).slice(0, 10), [emails]);
  const topSendersEmailCount = topSenders.reduce((sum, g) => sum + g.count, 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-mint-500 mx-auto mb-4" />
          <p className="text-ink/75">Loading your inbox...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-mint-200 rounded-2xl flex items-center justify-center">
                <Mail className="w-6 h-6 text-ink" />
              </div>
              <SpeedLogo className="text-2xl" />
            </div>
            <div className="flex items-center space-x-5">
            <button
              onClick={() => setCurrentScreen('account')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-2xl border-2 border-ink/10 shadow-sm font-display font-semibold text-sm text-ink transition ${
                billing.isPro ? 'bg-mint-200 hover:bg-mint-300' : 'bg-sunny-200 hover:bg-sunny-300'
              }`}
              title="Your plan and usage"
            >
              {billing.isPro ? (
                <>
                  <Crown className="w-4 h-4" />
                  <span>Pro</span>
                </>
              ) : (
                <span>
                  Free · {billing.used.toLocaleString()}/{billing.limit}
                </span>
              )}
            </button>
            {!billing.isPro && !billing.loading && (
              <button
                onClick={() => billing.openPricing()}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-2xl border-2 border-ink/10 shadow-sm font-display font-semibold text-sm text-ink bg-ocean-200 hover:bg-ocean-300 transition"
              >
                <Sparkles className="w-4 h-4" />
                <span>Upgrade</span>
              </button>
            )}
            <button
              onClick={toggleSimpleMode}
              className="flex items-center space-x-2 text-ink/75 hover:text-ink transition"
            >
              {simpleMode ? <LayoutGrid className="w-5 h-5" /> : <Smile className="w-5 h-5" />}
              <span className="hidden sm:inline text-sm font-medium">{simpleMode ? 'All tools' : 'Simple view'}</span>
            </button>
            <button
              onClick={async () => {
                try {
                  await signOut();
                } catch (error) {
                  console.error('Sign out failed:', error);
                  alert('Failed to sign out. Please try again.');
                }
              }}
              className="flex items-center space-x-2 text-ink/75 hover:text-ink transition"
            >
              <LogOut className="w-5 h-5" />
              <span className="hidden sm:inline text-sm font-medium">Sign Out</span>
            </button>
            </div>
          </div>
        </div>
        {/* Brand stripe: one band of each theme colour */}
        <div className="flex h-1.5" aria-hidden="true">
          <div className="flex-1 bg-berry-300" />
          <div className="flex-1 bg-ocean-300" />
          <div className="flex-1 bg-mint-300" />
          <div className="flex-1 bg-sunny-300" />
        </div>
      </nav>

      {currentScreen === 'dashboard' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {!simpleMode && (
            <div className="mb-8">
              <h2 className="font-display text-3xl font-bold text-ink mb-2">Welcome back!</h2>
              <p className="text-ink/75">Here's your inbox overview</p>
            </div>
          )}

          {scanError && (
            <div className="mb-6 bg-berry-50 border border-berry-200 rounded-2xl p-4 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-berry-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-berry-900">Scan failed</p>
                <p className="text-sm text-berry-700">{scanError}</p>
              </div>
            </div>
          )}

          {scanResult && !scanning && (
            <div className="mb-6 bg-mint-50 border border-mint-200 rounded-2xl p-5 flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-mint-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-mint-900">
                  Scan complete: {scanResult.fetched.toLocaleString()} emails fetched from your entire inbox
                </p>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-mint-700">
                  <span>{scanResult.important.toLocaleString()} important</span>
                  <span>{scanResult.clutter.toLocaleString()} clutter</span>
                  <span>{scanResult.bundles.toLocaleString()} bundled</span>
                  <span>{scanResult.bundle_groups} bundle groups</span>
                </div>
              </div>
              <button
                onClick={() => setScanResult(null)}
                className="text-mint-600 hover:text-mint-800"
              >
                <span className="text-sm">Dismiss</span>
              </button>
            </div>
          )}

          {scanning && (
            <div className="mb-6 bg-ocean-50 border border-ocean-200 rounded-2xl p-6">
              <div className="flex items-center space-x-3 mb-3">
                <RefreshCw className="w-5 h-5 text-ocean-600 animate-spin" />
                <p className="font-medium text-ocean-900">Scanning your entire inbox...</p>
              </div>
              {scanProgress && scanProgress.totalInInbox > 0 ? (
                <>
                  <div className="w-full bg-ocean-100 rounded-full h-2 mb-2 overflow-hidden">
                    <div
                      className="bg-ocean-400 h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, Math.round((scanProgress.scannedSoFar / scanProgress.totalInInbox) * 100))}%`,
                      }}
                    />
                  </div>
                  <p className="text-sm text-ocean-700">
                    {scanProgress.scannedSoFar.toLocaleString()} of {scanProgress.totalInInbox.toLocaleString()} emails scanned
                  </p>
                </>
              ) : (
                <p className="text-sm text-ocean-700">
                  Fetching all emails from the very beginning. This may take a while if you have thousands of emails.
                </p>
              )}
            </div>
          )}

          {simpleMode ? (
            <SimpleHome
              emails={emails}
              scanning={scanning}
              onScan={simulateScan}
              onOpenVerified={() => openImportant('verified')}
              onOpenSenders={() => setCurrentScreen('senders')}
              onRefresh={loadData}
              onShowAllTools={toggleSimpleMode}
            />
          ) : (
          <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-ocean-200 rounded-2xl p-6 text-ink shadow-lg hover:shadow-xl transition">
              <Mail className="w-8 h-8 mb-4 opacity-90" />
              <div className="font-display text-3xl font-bold mb-1">{importantCount.toLocaleString()}</div>
              <div className="text-ocean-800">Important Emails</div>
            </div>

            <div className="bg-berry-200 rounded-2xl p-6 text-ink shadow-lg hover:shadow-xl transition">
              <Trash2 className="w-8 h-8 mb-4 opacity-90" />
              <div className="font-display text-3xl font-bold mb-1">{clutterCount.toLocaleString()}</div>
              <div className="text-berry-800">Clutter Emails</div>
            </div>

            <div className="bg-mint-200 rounded-2xl p-6 text-ink shadow-lg hover:shadow-xl transition">
              <Package className="w-8 h-8 mb-4 opacity-90" />
              <div className="font-display text-3xl font-bold mb-1">{bundles.length}</div>
              <div className="text-mint-800">Email Bundles</div>
            </div>

            <button
              onClick={() => setCurrentScreen('unread')}
              className="bg-sunny-200 rounded-2xl p-6 text-sunny-900 shadow-lg hover:shadow-xl transition text-left"
            >
              <Mail className="w-8 h-8 mb-4 opacity-90" />
              <div className="font-display text-3xl font-bold mb-1">{unreadCount.toLocaleString()}</div>
              <div className="text-sunny-800 font-semibold">Unread Emails</div>
            </button>
          </div>

          {emails.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center border-2 border-ink/10">
              <Mail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-ink mb-2">No emails yet</h3>
              <p className="text-ink/75 mb-6">Start by scanning your entire inbox to see all your emails organized</p>
              <button
                onClick={simulateScan}
                disabled={scanning}
                className="inline-flex items-center space-x-2 bg-mint-200 text-ink px-6 py-3 rounded-xl font-semibold hover:bg-mint-300 transition disabled:opacity-50 shadow-lg"
              >
                <RefreshCw className={scanning ? 'w-5 h-5 animate-spin' : 'w-5 h-5'} />
                <span>{scanning ? 'Scanning Entire Inbox...' : 'Scan Entire Inbox'}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <UpgradeBanner />

              {topSendersEmailCount > 0 && (
                <button
                  onClick={() => setCurrentScreen('senders')}
                  className="w-full bg-white rounded-2xl p-6 shadow-sm border-2 border-mint-100 hover:border-mint-400 transition text-left flex items-center gap-5"
                >
                  <div className="w-12 h-12 bg-mint-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Users className="w-6 h-6 text-mint-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-lg font-semibold text-ink">
                      Your top {topSenders.length} senders sent {topSendersEmailCount.toLocaleString()} emails
                    </div>
                    <div className="text-sm text-ink/75 truncate">
                      {topSenders.slice(0, 3).map((g) => g.name).join(', ')} and more. Unsubscribe and clear them out in one click.
                    </div>
                  </div>
                  <ChevronRight className="w-6 h-6 text-mint-600 flex-shrink-0" />
                </button>
              )}

              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-ink">
                  {emails.length.toLocaleString()} total emails loaded
                </h3>
                <button
                  onClick={simulateScan}
                  disabled={scanning}
                  className="flex items-center space-x-2 text-mint-600 hover:text-mint-700 font-medium transition disabled:opacity-50"
                >
                  <RefreshCw className={scanning ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
                  <span>{scanning ? 'Scanning...' : 'Rescan Entire Inbox'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  onClick={() => openImportant('all')}
                  className="bg-white rounded-2xl p-6 hover:shadow-lg transition text-left border-2 border-transparent hover:border-ocean-500"
                >
                  <Mail className="w-6 h-6 text-ocean-500 mb-3" />
                  <div className="text-lg font-semibold text-ink mb-1">Important</div>
                  <div className="text-sm text-ink/75">{importantCount.toLocaleString()} emails</div>
                </button>

                <button
                  onClick={() => setCurrentScreen('clutter')}
                  className="bg-white rounded-2xl p-6 hover:shadow-lg transition text-left border-2 border-transparent hover:border-berry-500"
                >
                  <Trash2 className="w-6 h-6 text-berry-500 mb-3" />
                  <div className="text-lg font-semibold text-ink mb-1">Clutter</div>
                  <div className="text-sm text-ink/75">{clutterCount.toLocaleString()} emails</div>
                </button>

                <button
                  onClick={() => setCurrentScreen('bundles')}
                  className="bg-white rounded-2xl p-6 hover:shadow-lg transition text-left border-2 border-transparent hover:border-mint-500"
                >
                  <Package className="w-6 h-6 text-mint-500 mb-3" />
                  <div className="text-lg font-semibold text-ink mb-1">Bundles</div>
                  <div className="text-sm text-ink/75">{bundles.length} groups ({bundleEmailCount.toLocaleString()} emails)</div>
                </button>

                <button
                  onClick={() => setCurrentScreen('reset')}
                  className="bg-mint-200 rounded-2xl p-6 hover:shadow-lg transition text-left"
                >
                  <Sparkles className="w-6 h-6 text-ink mb-3" />
                  <div className="text-lg font-semibold text-ink mb-1">Inbox Reset</div>
                  <div className="text-sm text-mint-800">Delete all clutter & bundles</div>
                </button>
              </div>
            </div>
          )}
          </>
          )}
        </div>
      )}

      {currentScreen === 'important' && (
        <ImportantEmails
          emails={emails.filter((e) => e.category === 'important')}
          verifiedEmails={emails.filter((e) => e.is_protected)}
          initialTab={importantStartTab}
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

      {currentScreen === 'account' && <AccountScreen onBack={() => setCurrentScreen('dashboard')} />}

      {currentScreen === 'senders' && (
        <SendersList
          emails={emails}
          simple={simpleMode}
          onBack={() => setCurrentScreen('dashboard')}
          onRefresh={loadData}
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
