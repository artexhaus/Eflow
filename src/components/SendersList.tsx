import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  Users,
  Search,
  Archive,
  Trash2,
  BellOff,
  CheckCircle,
  ExternalLink,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { applyMailAction, describePartialFailure, type MailAction } from '../lib/mailActions';
import {
  groupBySender,
  requestOneClickUnsubscribe,
  recordUnsubscribeLinkOpened,
  type SenderGroup,
} from '../lib/senders';
import type { Email, SenderAction } from '../lib/types';

interface SendersListProps {
  emails: Email[];
  // Simple view hides the filter controls: biggest senders first, plus search.
  simple?: boolean;
  onBack: () => void;
  onRefresh: () => void;
}

type Filter = 'all' | 'unsubscribable';
type RowMessage = { tone: 'error' | 'info'; text: string };

const PAGE_SIZE = 50;

function formatTime(timestamp: string) {
  const diffDays = Math.floor((Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 1) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

export default function SendersList({ emails, simple = false, onBack, onRefresh }: SendersListProps) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [includeOneOffs, setIncludeOneOffs] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [senderActions, setSenderActions] = useState<Record<string, SenderAction['unsubscribe_status']>>({});
  const [busy, setBusy] = useState<{ key: string; action: MailAction | 'unsubscribe' } | null>(null);
  const [messages, setMessages] = useState<Record<string, RowMessage>>({});
  const [pendingLinks, setPendingLinks] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMessage, setBulkMessage] = useState<RowMessage | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('sender_actions')
      .select('sender, unsubscribe_status')
      .eq('user_id', user.id)
      .then(({ data }) => {
        const map: Record<string, SenderAction['unsubscribe_status']> = {};
        for (const row of data ?? []) map[row.sender] = row.unsubscribe_status;
        setSenderActions(map);
      });
  }, [user]);

  const groups = useMemo(() => groupBySender(emails), [emails]);
  const hasUnsubscribeData = useMemo(() => emails.some((e) => e.list_unsubscribe), [emails]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      if (!includeOneOffs && g.count < 2 && !q) return false;
      if (filter === 'unsubscribable' && (!g.unsubscribeLink || senderActions[g.key])) return false;
      if (q && !g.key.includes(q) && !g.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [groups, query, filter, includeOneOffs, senderActions]);

  const visible = filtered.slice(0, visibleCount);

  const setMessage = (key: string, message: RowMessage | null) =>
    setMessages((prev) => {
      const next = { ...prev };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });

  const markStatus = (key: string, status: SenderAction['unsubscribe_status']) =>
    setSenderActions((prev) => ({ ...prev, [key]: status }));

  const handleMailAction = async (group: SenderGroup, action: 'archive' | 'delete') => {
    if (
      action === 'delete' &&
      !confirm(
        `Permanently delete ${(group.count - group.protectedCount).toLocaleString()} emails from ${group.name}? This cannot be undone.` +
          (group.protectedCount > 0 ? ` Their ${group.protectedCount.toLocaleString()} bills and receipts will be kept.` : '')
      )
    ) {
      return;
    }

    setBusy({ key: group.key, action });
    setMessage(group.key, null);
    try {
      const result = await applyMailAction(action, { sender: group.sender });
      if (result.failed > 0) setMessage(group.key, { tone: 'error', text: describePartialFailure(result) });
      await onRefresh();
    } catch (err) {
      setMessage(group.key, { tone: 'error', text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const handleUnsubscribe = async (group: SenderGroup) => {
    if (!group.oneClick && group.unsubscribeLink) {
      // No one-click support: the link itself is rendered as the button, see below.
      return;
    }

    setBusy({ key: group.key, action: 'unsubscribe' });
    setMessage(group.key, null);
    try {
      const result = await requestOneClickUnsubscribe(group.sender);
      if (result.status === 'unsubscribed') {
        markStatus(group.key, 'unsubscribed');
      } else if (result.status === 'needs_user') {
        setPendingLinks((prev) => ({ ...prev, [group.key]: result.url }));
        setMessage(group.key, {
          tone: 'info',
          text: "This sender needs you to confirm on their page. Open it below to finish unsubscribing.",
        });
      } else {
        setMessage(group.key, { tone: 'error', text: result.message });
      }
    } catch (err) {
      setMessage(group.key, { tone: 'error', text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const handleLinkOpened = (group: SenderGroup) => {
    if (!user) return;
    markStatus(group.key, 'link_opened');
    setMessage(group.key, null);
    recordUnsubscribeLinkOpened(user.id, group.key);
  };

  // Drop selections for senders that disappeared (e.g. after a clean-up).
  const selectedGroups = useMemo(() => groups.filter((g) => selected.has(g.key)), [groups, selected]);
  const selectedEmailCount = selectedGroups.reduce((sum, g) => sum + g.count, 0);
  const selectedProtectedCount = selectedGroups.reduce((sum, g) => sum + g.protectedCount, 0);
  const allVisibleSelected = visible.length > 0 && visible.every((g) => selected.has(g.key));

  const toggleSelected = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const g of visible) {
        if (allVisibleSelected) next.delete(g.key);
        else next.add(g.key);
      }
      return next;
    });

  // Acts on every email from all checked senders in a single request, so the
  // mail server is connected to once rather than once per sender. Protected
  // bills and receipts are filtered out by the server.
  const handleBulkAction = async (action: 'archive' | 'delete') => {
    if (selectedGroups.length === 0) return;
    const removable = selectedEmailCount - selectedProtectedCount;
    const senderLabel = `${selectedGroups.length.toLocaleString()} sender${selectedGroups.length === 1 ? '' : 's'}`;
    const keptNote =
      selectedProtectedCount > 0
        ? ` ${selectedProtectedCount.toLocaleString()} bills and receipts will be kept.`
        : '';
    const prompt =
      action === 'delete'
        ? `Permanently delete ${removable.toLocaleString()} emails from ${senderLabel}? This cannot be undone.${keptNote}`
        : `Move ${removable.toLocaleString()} emails from ${senderLabel} to your Archive folder?${keptNote}`;
    if (!confirm(prompt)) return;

    const keys = new Set(selectedGroups.map((g) => g.key));
    const emailIds = emails.filter((e) => keys.has(e.sender.toLowerCase())).map((e) => e.email_id);

    setBusy({ key: '__bulk__', action });
    setBulkMessage(null);
    try {
      const result = await applyMailAction(action, { emailIds });
      const verb = action === 'delete' ? 'Deleted' : 'Archived';
      let text = `${verb} ${result.processed.toLocaleString()} emails from ${senderLabel}.`;
      if (result.protectedSkipped > 0) {
        text += ` ${result.protectedSkipped.toLocaleString()} bills and receipts were kept safe.`;
      }
      if (result.failed > 0) text += ` ${describePartialFailure(result)}`;
      setBulkMessage({ tone: result.failed > 0 ? 'error' : 'info', text });
      setSelected(new Set());
      await onRefresh();
    } catch (err) {
      setBulkMessage({ tone: 'error', text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const renderUnsubscribe = (group: SenderGroup) => {
    const status = senderActions[group.key];
    if (status === 'unsubscribed') {
      return (
        <span className="flex items-center space-x-1 text-sm font-medium text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">
          <CheckCircle className="w-4 h-4" />
          <span>Unsubscribed</span>
        </span>
      );
    }
    if (status === 'link_opened') {
      return (
        <span className="flex items-center space-x-1 text-sm font-medium text-gray-600 bg-gray-100 px-3 py-2 rounded-lg">
          <CheckCircle className="w-4 h-4" />
          <span>Unsubscribe page opened</span>
        </span>
      );
    }

    const link = pendingLinks[group.key] ?? (!group.oneClick ? group.unsubscribeLink : null);
    if (link) {
      return (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => handleLinkOpened(group)}
          className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-medium text-sm transition"
        >
          <ExternalLink className="w-4 h-4" />
          <span>{link.startsWith('mailto:') ? 'Unsubscribe by email' : 'Open unsubscribe page'}</span>
        </a>
      );
    }

    if (!group.unsubscribeLink) {
      return <span className="text-xs text-gray-400 px-2">No unsubscribe option</span>;
    }

    return (
      <button
        onClick={() => handleUnsubscribe(group)}
        disabled={busy !== null}
        className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-medium text-sm transition disabled:opacity-50"
      >
        <BellOff className="w-4 h-4" />
        <span>{busy?.key === group.key && busy.action === 'unsubscribe' ? 'Unsubscribing...' : 'Unsubscribe'}</span>
      </button>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button
        onClick={onBack}
        className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-6 transition"
      >
        <ChevronLeft className="w-5 h-5" />
        <span className="font-medium">Back to Dashboard</span>
      </button>

      <div className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Senders</h2>
        <p className="text-gray-600">
          Everyone who emails you, biggest first. Unsubscribe, then clear out everything they already sent in one click.
        </p>
      </div>

      {emails.length > 0 && !hasUnsubscribeData && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Unsubscribe buttons appear after your next scan. Go back and choose <strong>Rescan Entire Inbox</strong> to turn them on.
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl p-4 mb-4 shadow-sm space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="Search by name or email address"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        {!simple && (
        <div className="flex flex-wrap items-center gap-2">
          {([
            ['all', 'All senders'],
            ['unsubscribable', 'Can unsubscribe'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setFilter(key);
                setVisibleCount(PAGE_SIZE);
              }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                filter === key
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-emerald-300'
              }`}
            >
              {label}
            </button>
          ))}
          <label className="flex items-center space-x-2 text-sm text-gray-600 ml-auto cursor-pointer">
            <input
              type="checkbox"
              checked={includeOneOffs}
              onChange={(e) => setIncludeOneOffs(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Include senders with only 1 email</span>
          </label>
        </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No senders to show</h3>
          <p className="text-gray-600">
            {query ? 'Nobody matches that search.' : 'Nothing here - your inbox is looking tidy.'}
          </p>
        </div>
      ) : (
        <>
          {bulkMessage && (
            <div
              className={`mb-4 text-sm rounded-xl p-4 flex items-start justify-between gap-3 ${
                bulkMessage.tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'
              }`}
            >
              <span>{bulkMessage.text}</span>
              <button onClick={() => setBulkMessage(null)} className="font-medium whitespace-nowrap">
                Dismiss
              </button>
            </div>
          )}

          <div className="flex items-center justify-between mb-3 px-1">
            <label className="flex items-center space-x-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
                disabled={busy !== null}
                className="w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm font-medium text-gray-700">Select all shown</span>
            </label>
            <p className="text-sm text-gray-500">
              {filtered.length.toLocaleString()} senders ·{' '}
              {filtered.reduce((sum, g) => sum + g.count, 0).toLocaleString()} emails
            </p>
          </div>
          <div className="space-y-3">
            {visible.map((group) => {
              const message = messages[group.key];
              const isBusy = busy?.key === group.key;
              const showArchivePrompt = senderActions[group.key] && group.count > 0;

              return (
                <div
                  key={group.key}
                  className={`bg-white rounded-xl p-5 border transition ${
                    selected.has(group.key) ? 'border-red-400 ring-1 ring-red-200' : 'border-gray-100 hover:border-gray-300'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <label className="flex items-start space-x-4 flex-1 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(group.key)}
                        onChange={() => toggleSelected(group.key)}
                        disabled={busy !== null}
                        aria-label={`Select ${group.name}`}
                        className="w-6 h-6 mt-2.5 rounded border-gray-300 text-red-600 focus:ring-red-500 flex-shrink-0"
                      />
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center font-semibold flex-shrink-0">
                        {group.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline space-x-2">
                          <h3 className="font-semibold text-gray-900 truncate">{group.name}</h3>
                          <span className="text-sm text-gray-500 truncate">{group.sender}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-gray-600">
                          <span className="font-semibold text-gray-900">{group.count.toLocaleString()} emails</span>
                          {group.unreadCount > 0 && <span>{group.unreadCount.toLocaleString()} unread</span>}
                          <span className="flex items-center space-x-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Latest {formatTime(group.latest)}</span>
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 truncate mt-1">{group.exampleSubjects.join(' · ')}</p>
                        {group.protectedCount > 0 && (
                          <p className="flex items-center space-x-1 text-xs text-emerald-700 mt-2">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>
                              {group.protectedCount.toLocaleString()} bills or receipts from them are Paid & Verified and will be kept.
                            </span>
                          </p>
                        )}
                        {group.importantCount > 0 && (
                          <p className="flex items-center space-x-1 text-xs text-amber-700 mt-2">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>
                              {group.importantCount.toLocaleString()} of these look important - check before clearing.
                            </span>
                          </p>
                        )}
                      </div>
                    </label>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {renderUnsubscribe(group)}
                      <button
                        onClick={() => handleMailAction(group, 'archive')}
                        disabled={busy !== null}
                        className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium text-sm transition disabled:opacity-50"
                      >
                        <Archive className="w-4 h-4" />
                        <span>{isBusy && busy?.action === 'archive' ? 'Archiving...' : 'Archive all'}</span>
                      </button>
                      <button
                        onClick={() => handleMailAction(group, 'delete')}
                        disabled={busy !== null}
                        title="Delete all permanently"
                        aria-label={`Delete all emails from ${group.name}`}
                        className="p-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {message && (
                    <div
                      className={`mt-3 text-sm rounded-lg p-3 ${
                        message.tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-800'
                      }`}
                    >
                      {message.text}
                    </div>
                  )}

                  {showArchivePrompt && !message && !isBusy && (
                    <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-emerald-50 rounded-lg p-3">
                      <p className="text-sm text-emerald-800">
                        {senderActions[group.key] === 'unsubscribed'
                          ? "You won't get new mail from them."
                          : 'Once you confirm on their page, new mail will stop.'}{' '}
                        Want to clear the {group.count.toLocaleString()} emails they already sent?
                      </p>
                      <button
                        onClick={() => handleMailAction(group, 'archive')}
                        disabled={busy !== null}
                        className="text-sm font-semibold text-emerald-700 hover:text-emerald-900 whitespace-nowrap disabled:opacity-50"
                      >
                        Archive them
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filtered.length > visibleCount && (
            <div className="text-center mt-6">
              <button
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Show more senders ({(filtered.length - visibleCount).toLocaleString()} left)
              </button>
            </div>
          )}
        </>
      )}

      {selectedGroups.length > 0 && (
        <>
          {/* Spacer so the fixed bar never covers the last row */}
          <div className="h-28" />
          <div className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-gray-200 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <p className="font-semibold text-gray-900">
                  {selectedGroups.length.toLocaleString()} sender{selectedGroups.length === 1 ? '' : 's'} selected ·{' '}
                  {selectedEmailCount.toLocaleString()} emails
                </p>
                {selectedProtectedCount > 0 && (
                  <p className="text-sm text-emerald-700 flex items-center space-x-1">
                    <ShieldCheck className="w-4 h-4" />
                    <span>{selectedProtectedCount.toLocaleString()} bills and receipts will be kept</span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelected(new Set())}
                  disabled={busy !== null}
                  className="px-4 py-3 text-gray-600 hover:text-gray-900 font-medium disabled:opacity-50"
                >
                  Clear
                </button>
                <button
                  onClick={() => handleBulkAction('archive')}
                  disabled={busy !== null}
                  className="flex items-center space-x-2 px-5 py-3 bg-white border border-gray-300 text-gray-800 hover:bg-gray-50 rounded-xl font-semibold disabled:opacity-50"
                >
                  <Archive className="w-5 h-5" />
                  <span>{busy?.key === '__bulk__' && busy.action === 'archive' ? 'Archiving...' : 'Archive'}</span>
                </button>
                <button
                  onClick={() => handleBulkAction('delete')}
                  disabled={busy !== null}
                  className="flex items-center space-x-2 px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold shadow-sm disabled:opacity-50"
                >
                  <Trash2 className="w-5 h-5" />
                  <span>
                    {busy?.key === '__bulk__' && busy.action === 'delete'
                      ? 'Deleting...'
                      : `Delete selected`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
