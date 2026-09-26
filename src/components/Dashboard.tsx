import { useState, useEffect, useMemo } from 'react';
import { Mail, Sparkles, Trash2, Package, LogOut, RefreshCw, CheckCircle, AlertCircle, ChevronRight, LayoutGrid, Smile, Crown } from 'lucide-react';
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
import CleanUpJunkCard from './CleanUpJunkCard';
import TopSendersPanel from './TopSendersPanel';
import SuspiciousAlert from './SuspiciousAlert';
import { useBilling } from '../contexts/BillingContext';
import LanguageToggle from './LanguageToggle';
import { tKnown, useI18n, type MessageKey } from '../lib/i18n';

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

// Friendly lines shown (in rotation) while a scan runs.
const SCAN_TIPS: MessageKey[] = [
  'Hang tight - fetching all your mail...',
  'Sorting the keepers from the clutter...',
  'Spotting receipts to keep safe...',
  'Stacking up your senders...',
  'Big inboxes take a few minutes - thanks for waiting!',
];

interface ScanProgress {
  scannedSoFar: number;
  totalInInbox: number;
}

interface DashboardProps {
  // Called after the user disconnects their mailbox in Account settings.
  onMailboxDisconnected: () => void;
}

export default function Dashboard({ onMailboxDisconnected }: DashboardProps) {
  const { user, signOut } = useAuth();
  const billing = useBilling();
  const { t, plural, formatNumber } = useI18n();
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [emails, setEmails] = useState<Email[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState('');
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  // True when picking up a scan that was left unfinished (e.g. the tab closed).
  const [resumingScan, setResumingScan] = useState(false);
  // Set while a slow/failed scan step is being retried, so the banner can say
  // "still working" instead of looking frozen.
  const [scanRetrying, setScanRetrying] = useState(false);
  const [scanTip, setScanTip] = useState(0);
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

    // Start the first scan automatically, and pick up any scan that was left
    // unfinished. Scans run in chunks driven from this page, so closing the tab
    // pauses them; scan_total stays set on the server until one completes.
    const checkAndAutoScan = async () => {
      const { data: userData } = await supabase
        .from('users')
        .select('email_provider, connected_account_id, last_scan, scan_total')
        .eq('id', user.id)
        .maybeSingle();

      const unfinished = userData?.scan_total != null;
      if (userData?.connected_account_id && (!userData?.last_scan || unfinished)) {
        setResumingScan(unfinished);
        simulateScan();
      }
    };

    checkAndAutoScan();
  }, [user, loading]);

  // Rotate the friendly scanning lines every few seconds.
  useEffect(() => {
    if (!scanning) return;
    const timer = setInterval(() => setScanTip((t) => t + 1), 4000);
    return () => clearInterval(timer);
  }, [scanning]);

  // Closing the tab pauses a scan, so ask first while one is running.
  useEffect(() => {
    if (!scanning) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [scanning]);

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
            setScanRetrying(false);
          } catch (chunkError) {
            consecutiveFailures++;
            setScanRetrying(true);
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
      setScanError(tKnown((error as Error).message));
    } finally {
      setScanning(false);
      setResumingScan(false);
      setScanRetrying(false);
      setScanProgress(null);
    }
  };

  const fetchProviderEmailsChunk = async (): Promise<ScanChunkResponse | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/imap-fetch`;

    // A step normally takes seconds. If the mail server stalls, give up after
    // 90s and let the retry loop try again rather than sitting frozen. The
    // server keeps its progress, so a retried step never loses emails.
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || t('Failed to fetch emails'));
    }

    return await response.json();
  };

  const importantCount = emails.filter((e) => e.category === 'important').length;
  const clutterCount = emails.filter((e) => e.category === 'clutter').length;
  const bundleEmailCount = emails.filter((e) => e.category === 'bundle').length;
  const unreadCount = emails.filter((e) => !e.is_read).length;

  // Bundle groups that still have emails in the inbox; groups whose emails
  // were all archived or deleted since the last scan aren't worth showing.
  const activeBundles = useMemo(() => {
    const ids = new Set(emails.map((e) => e.bundle_id).filter(Boolean));
    return bundles.filter((b) => ids.has(b.id));
  }, [emails, bundles]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-mint-500 mx-auto mb-4" />
          <p className="text-ink/75">{t('Loading your inbox...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* The logo is the way home: Simple view or the All tools dashboard,
                whichever mode the user is in. */}
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                setCurrentScreen('dashboard');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              aria-label={simpleMode ? t('Eflow home (Simple view)') : t('Eflow home (dashboard)')}
              title={t('Back to home')}
              className="group flex items-center space-x-2 min-[360px]:space-x-3 rounded-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-ocean-300"
            >
              <div className="w-10 h-10 bg-mint-200 rounded-2xl flex items-center justify-center group-hover:-rotate-6 group-hover:bg-mint-300 transition">
                <Mail className="w-6 h-6 text-ink" />
              </div>
              <span className="hidden min-[360px]:block">
                <SpeedLogo className="text-xl sm:text-2xl" />
              </span>
            </a>
            {/* On phones: badge + icon-only view toggle, language and sign out,
                so all of it fits a 320px screen (Upgrade lives in the badge's
                account page and the dashboard's upgrade block there). View and
                sign-out labels appear from lg, where the Spanish ones fit too. */}
            <div className="flex items-center gap-2 min-[360px]:gap-3 lg:gap-5">
            <button
              onClick={() => setCurrentScreen('account')}
              className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-2xl border-2 border-ink/10 shadow-sm font-display font-semibold text-sm text-ink whitespace-nowrap transition ${
                billing.isPro ? 'bg-mint-200 hover:bg-mint-300' : 'bg-sunny-200 hover:bg-sunny-300'
              }`}
              title={t('Your plan and usage')}
            >
              {billing.isPro ? (
                <>
                  <Crown className="w-4 h-4" />
                  <span>Pro</span>
                </>
              ) : (
                <span>
                  <span className="hidden min-[400px]:inline">{t('Free')} · </span>
                  {formatNumber(billing.used)}/{formatNumber(billing.limit)}
                </span>
              )}
            </button>
            {!billing.isPro && !billing.loading && (
              <button
                onClick={() => billing.openPricing()}
                className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-2xl border-2 border-ink/10 shadow-sm font-display font-semibold text-sm text-ink bg-ocean-200 hover:bg-ocean-300 transition"
              >
                <Sparkles className="w-4 h-4" />
                <span>{t('Upgrade')}</span>
              </button>
            )}
            <button
              onClick={toggleSimpleMode}
              aria-label={simpleMode ? t('Show all tools') : t('Switch to Simple view')}
              className="flex items-center space-x-2 p-1 text-ink/75 hover:text-ink transition"
            >
              {simpleMode ? <LayoutGrid className="w-5 h-5" /> : <Smile className="w-5 h-5" />}
              <span className="hidden lg:inline text-sm font-medium">{simpleMode ? t('All tools') : t('Simple view')}</span>
            </button>
            <LanguageToggle className="hidden sm:inline-flex" />
            <LanguageToggle compact className="sm:hidden" />
            <button
              onClick={async () => {
                try {
                  await signOut();
                } catch (error) {
                  console.error('Sign out failed:', error);
                  alert(t('Failed to sign out. Please try again.'));
                }
              }}
              aria-label={t('Sign out')}
              className="flex items-center space-x-2 p-1 text-ink/75 hover:text-ink transition"
            >
              <LogOut className="w-5 h-5" />
              <span className="hidden lg:inline text-sm font-medium">{t('Sign out')}</span>
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
              <h2 className="font-display text-3xl font-bold text-ink mb-2">{t('Welcome back!')}</h2>
              <p className="text-ink/75">
                {billing.used > 0
                  ? plural(billing.used, "You've cleared {n} email this month. Nice work!", "You've cleared {n} emails this month. Nice work!")
                  : t("Here's your inbox overview")}
              </p>
            </div>
          )}

          {scanError && (
            <div className="mb-6 bg-berry-50 border-2 border-berry-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-start gap-3">
              <AlertCircle className="w-5 h-5 text-berry-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-berry-900">{t('Scan paused')}</p>
                <p className="text-sm text-berry-700">{scanError}</p>
                <p className="text-sm text-berry-700">{t('Your progress is saved - continue to pick up where it stopped.')}</p>
              </div>
              <button
                onClick={simulateScan}
                disabled={scanning}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-ocean-200 hover:bg-ocean-300 text-ink rounded-xl border-2 border-ink/10 shadow-sm font-semibold text-sm disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{t('Continue scan')}</span>
              </button>
            </div>
          )}

          {scanResult && !scanning && (
            <div className="mb-6 bg-mint-50 border border-mint-200 rounded-2xl p-5 flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-mint-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-mint-900">
                  {t('Scan complete: {n} emails fetched from your entire inbox', { n: scanResult.fetched })}
                </p>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-mint-700">
                  <span>{t('{n} important', { n: scanResult.important })}</span>
                  <span>{t('{n} clutter', { n: scanResult.clutter })}</span>
                  <span>{t('{n} bundled', { n: scanResult.bundles })}</span>
                  <span>{plural(scanResult.bundle_groups, '{n} bundle group', '{n} bundle groups')}</span>
                </div>
              </div>
              <button
                onClick={() => setScanResult(null)}
                className="text-mint-600 hover:text-mint-800"
              >
                <span className="text-sm">{t('Dismiss')}</span>
              </button>
            </div>
          )}

          {scanning && (
            <div className="mb-6 bg-ocean-50 border border-ocean-200 rounded-2xl p-6">
              <div className="flex items-center space-x-3 mb-3">
                <RefreshCw className="w-5 h-5 text-ocean-600 animate-spin" />
                <p className="font-medium text-ocean-900">
                  {scanRetrying
                    ? t('Hang tight - your mail is taking a little longer, still fetching...')
                    : resumingScan && scanTip === 0
                      ? t('Picking up your scan where it left off...')
                      : t(SCAN_TIPS[scanTip % SCAN_TIPS.length])}
                </p>
              </div>
              <p className="text-sm font-semibold text-ocean-900 mb-2">
                {t('Keep this tab open until it finishes. You can keep using Eflow meanwhile.')}
              </p>
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
                    {t('{done} of {total} emails scanned', { done: scanProgress.scannedSoFar, total: scanProgress.totalInInbox })}
                  </p>
                </>
              ) : (
                <p className="text-sm text-ocean-700">
                  {t('Getting your inbox ready. Big inboxes can take a few minutes.')}
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
          <div className="space-y-6">
            {/* The four blocks are the way into each list. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {[
                { key: 'important', label: t('Important'), count: importantCount, sub: t('emails'), icon: Mail, tone: 'bg-ocean-200 hover:bg-ocean-300', text: 'text-ocean-800', onClick: () => openImportant('all') },
                { key: 'clutter', label: t('Clutter'), count: clutterCount, sub: t('emails'), icon: Trash2, tone: 'bg-berry-200 hover:bg-berry-300', text: 'text-berry-800', onClick: () => setCurrentScreen('clutter') },
                {
                  key: 'bundles',
                  label: t('Bundles'),
                  count: bundleEmailCount,
                  sub: plural(activeBundles.length, 'emails in {n} group', 'emails in {n} groups'),
                  icon: Package,
                  tone: 'bg-mint-200 hover:bg-mint-300',
                  text: 'text-mint-800',
                  onClick: () => setCurrentScreen('bundles'),
                },
                { key: 'unread', label: t('Unread'), count: unreadCount, sub: t('emails'), icon: Mail, tone: 'bg-sunny-200 hover:bg-sunny-300', text: 'text-sunny-800', onClick: () => setCurrentScreen('unread') },
              ].map(({ key, label, count, sub, icon: Icon, tone, text, onClick }) => (
                <button
                  key={key}
                  onClick={onClick}
                  className={`group text-left rounded-3xl p-5 sm:p-6 text-ink border-2 border-ink/10 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition ${tone}`}
                >
                  <Icon className="w-8 h-8 mb-3 opacity-90" />
                  <div className="font-display text-3xl font-bold">{formatNumber(count)}</div>
                  <div className="font-semibold">{label}</div>
                  <div className={`text-sm ${text}`}>{sub}</div>
                  <div className={`mt-3 inline-flex items-center gap-1 text-sm font-semibold ${text}`}>
                    <span>{t('View')}</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              ))}
            </div>

            {emails.length === 0 ? (
              <div className="bg-white border-2 border-mint-200 border-t-[10px] border-t-mint-300 rounded-2xl shadow-sm p-12 text-center">
                <Mail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-ink mb-2">{t('No emails yet')}</h3>
                <p className="text-ink/75 mb-6">{t('Start by scanning your entire inbox to see all your emails organized')}</p>
                <button
                  onClick={simulateScan}
                  disabled={scanning}
                  className="inline-flex items-center space-x-2 bg-mint-200 text-ink px-6 py-3 rounded-xl font-semibold hover:bg-mint-300 transition disabled:opacity-50 shadow-lg"
                >
                  <RefreshCw className={scanning ? 'w-5 h-5 animate-spin' : 'w-5 h-5'} />
                  <span>{scanning ? t('Scanning your entire inbox...') : t('Scan entire inbox')}</span>
                </button>
              </div>
            ) : (
              <>
                <SuspiciousAlert emails={emails} onRefresh={loadData} />

                <CleanUpJunkCard emails={emails} onRefresh={loadData} onOpenVerified={() => openImportant('verified')} />

                <TopSendersPanel emails={emails} onRefresh={loadData} onOpenSenders={() => setCurrentScreen('senders')} />

                <UpgradeBanner />

                {/* Occasional tools, kept out of the way of the daily actions. */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-sm">
                  <span className="text-ink/70">{plural(emails.length, '{n} email in your inbox', '{n} emails in your inbox')}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={simulateScan}
                      disabled={scanning}
                      className="flex items-center gap-2 px-4 py-2 bg-ocean-200 hover:bg-ocean-300 text-ink rounded-xl border-2 border-ink/10 shadow-sm font-medium transition disabled:opacity-50"
                    >
                      <RefreshCw className={scanning ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
                      <span>{scanning ? t('Scanning...') : t('Rescan inbox')}</span>
                    </button>
                    <button
                      onClick={() => billing.requirePro(t('Inbox Reset')) && setCurrentScreen('reset')}
                      className="flex items-center gap-2 px-4 py-2 bg-mint-200 hover:bg-mint-300 text-ink rounded-xl border-2 border-ink/10 shadow-sm font-medium transition"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{t('Inbox Reset')}</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
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
          bundles={activeBundles}
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

      {currentScreen === 'account' && (
        <AccountScreen onBack={() => setCurrentScreen('dashboard')} onMailboxDisconnected={onMailboxDisconnected} />
      )}

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
