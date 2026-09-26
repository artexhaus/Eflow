import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  Users,
  Search,
  Archive,
  Trash2,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Loader2,
} from 'lucide-react';
import { applyMailAction, describePartialFailure, type MailAction } from '../lib/mailActions';
import { groupBySender, type SenderGroup } from '../lib/senders';
import { useBilling } from '../contexts/BillingContext';
import type { Email } from '../lib/types';
import UnsubscribeButton from './UnsubscribeButton';
import { useSenderActions } from '../hooks/useSenderActions';
import { t, plural, tKnown, timeAgo, useI18n } from '../lib/i18n';

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

export default function SendersList({ emails, simple = false, onBack, onRefresh }: SendersListProps) {
  useI18n();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [includeOneOffs, setIncludeOneOffs] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { statuses: senderActions, setStatus } = useSenderActions();
  const [busy, setBusy] = useState<{ key: string; action: MailAction } | null>(null);
  const [messages, setMessages] = useState<Record<string, RowMessage>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMessage, setBulkMessage] = useState<RowMessage | null>(null);

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

  const handleMailAction = async (group: SenderGroup, action: 'archive' | 'delete') => {
    if (
      action === 'delete' &&
      !confirm(
        plural(group.count - group.protectedCount, 'Permanently delete {n} email from {name}? This cannot be undone.', 'Permanently delete {n} emails from {name}? This cannot be undone.', { name: group.name }) +
          (group.protectedCount > 0
            ? ` ${plural(group.protectedCount, 'Their {n} receipt or invoice will be kept.', 'Their {n} receipts and invoices will be kept.')}`
            : '')
      )
    ) {
      return;
    }

    setBusy({ key: group.key, action });
    setMessage(group.key, null);
    try {
      const result = await applyMailAction(action, { sender: group.sender }, { label: t('emails from {name}', { name: group.name }) });
      if (result.failed > 0) setMessage(group.key, { tone: 'error', text: describePartialFailure(result) });
      await onRefresh();
    } catch (err) {
      setMessage(group.key, { tone: 'error', text: tKnown((err as Error).message) });
    } finally {
      setBusy(null);
    }
  };

  // Drop selections for senders that disappeared (e.g. after a clean-up).
  const selectedGroups = useMemo(() => groups.filter((g) => selected.has(g.key)), [groups, selected]);
  const selectedEmailCount = selectedGroups.reduce((sum, g) => sum + g.count, 0);
  const selectedProtectedCount = selectedGroups.reduce((sum, g) => sum + g.protectedCount, 0);
  const allVisibleSelected = visible.length > 0 && visible.every((g) => selected.has(g.key));

  // Free plan: one sender at a time; selecting several is a Pro feature.
  const { requirePro } = useBilling();

  const toggleSelected = (key: string) => {
    if (!selected.has(key) && selected.size >= 1 && !requirePro(t('Selecting several senders'))) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllVisible = () => {
    if (!allVisibleSelected && !requirePro(t('Select all senders'))) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const g of visible) {
        if (allVisibleSelected) next.delete(g.key);
        else next.add(g.key);
      }
      return next;
    });
  };

  // Acts on every email from all checked senders in a single request, so the
  // mail server is connected to once rather than once per sender. Protected
  // receipts and invoices are filtered out by the server.
  const handleBulkAction = async (action: 'archive' | 'delete') => {
    if (selectedGroups.length === 0) return;
    const removable = selectedEmailCount - selectedProtectedCount;
    const senderLabel = plural(selectedGroups.length, '{n} sender', '{n} senders');
    const keptNote =
      selectedProtectedCount > 0
        ? ` ${plural(selectedProtectedCount, '{n} receipt or invoice will be kept.', '{n} receipts and invoices will be kept.')}`
        : '';
    const prompt =
      (action === 'delete'
        ? plural(removable, 'Permanently delete {n} email from {name}? This cannot be undone.', 'Permanently delete {n} emails from {name}? This cannot be undone.', { name: senderLabel })
        : plural(removable, 'Move {n} email from {name} to your Archive folder?', 'Move {n} emails from {name} to your Archive folder?', { name: senderLabel })) +
      keptNote;
    if (!confirm(prompt)) return;

    const keys = new Set(selectedGroups.map((g) => g.key));
    const emailIds = emails.filter((e) => keys.has(e.sender.toLowerCase())).map((e) => e.email_id);

    setBusy({ key: '__bulk__', action });
    setBulkMessage(null);
    try {
      const result = await applyMailAction(action, { emailIds });
      let text =
        action === 'delete'
          ? plural(result.processed, 'Deleted {n} email from {name}.', 'Deleted {n} emails from {name}.', { name: senderLabel })
          : plural(result.processed, 'Archived {n} email from {name}.', 'Archived {n} emails from {name}.', { name: senderLabel });
      if (result.protectedSkipped > 0) {
        text += ` ${plural(result.protectedSkipped, '{n} receipt or invoice was kept safe.', '{n} receipts and invoices were kept safe.')}`;
      }
      if (result.failed > 0) text += ` ${describePartialFailure(result)}`;
      setBulkMessage({ tone: result.failed > 0 ? 'error' : 'info', text });
      setSelected(new Set());
      await onRefresh();
    } catch (err) {
      setBulkMessage({ tone: 'error', text: tKnown((err as Error).message) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button
        onClick={onBack}
        className="flex items-center space-x-2 text-ink/75 hover:text-ink mb-6 transition"
      >
        <ChevronLeft className="w-5 h-5" />
        <span className="font-medium">{t('Back to Dashboard')}</span>
      </button>

      <div className="mb-6">
        <h2 className="font-display text-3xl font-bold text-ink mb-2">{t('Senders')}</h2>
        <p className="text-ink/75">
          {t('Everyone who emails you, biggest first. Unsubscribe, then clear out everything they already sent in one click.')}
        </p>
      </div>

      {emails.length > 0 && !hasUnsubscribeData && (
        <div className="mb-6 bg-sunny-50 border border-sunny-200 rounded-2xl p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-sunny-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-sunny-800">
            {t('Unsubscribe buttons appear after your next scan. Go back and choose Rescan inbox to turn them on.')}
          </p>
        </div>
      )}

      <div className="bg-berry-100 rounded-2xl p-4 mb-4 shadow-sm space-y-3 border-2 border-ink/10">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder={t('Search by name or email address')}
            className="w-full pl-9 pr-3 py-2 border-2 border-ink/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-mint-500"
          />
        </div>
        {!simple && (
        <div className="flex flex-wrap items-center gap-2">
          {([
            ['all', t('All senders')],
            ['unsubscribable', t('Can unsubscribe')],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setFilter(key);
                setVisibleCount(PAGE_SIZE);
              }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                filter === key
                  ? 'bg-mint-200 border-mint-600 text-ink'
                  : 'bg-white border-gray-200 text-ink/85 hover:border-mint-300'
              }`}
            >
              {label}
            </button>
          ))}
          <label className="flex items-center space-x-2 text-sm text-ink/75 ml-auto cursor-pointer">
            <input
              type="checkbox"
              checked={includeOneOffs}
              onChange={(e) => setIncludeOneOffs(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-mint-600 focus:ring-mint-500"
            />
            <span>{t('Include senders with only 1 email')}</span>
          </label>
        </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border-2 border-berry-200 border-t-[10px] border-t-berry-300 rounded-2xl shadow-sm p-12 text-center">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-ink mb-2">{t('No senders to show')}</h3>
          <p className="text-ink/75">
            {query ? t('Nobody matches that search.') : t('Nothing here - your inbox is looking tidy.')}
          </p>
        </div>
      ) : (
        <>
          {bulkMessage && (
            <div
              className={`mb-4 text-sm rounded-2xl p-4 flex items-start justify-between gap-3 ${
                bulkMessage.tone === 'error' ? 'bg-berry-50 text-berry-700' : 'bg-mint-50 text-mint-800'
              }`}
            >
              <span>{bulkMessage.text}</span>
              <button onClick={() => setBulkMessage(null)} className="font-medium whitespace-nowrap">
                {t('Dismiss')}
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
                className="w-5 h-5 rounded border-gray-300 text-berry-600 focus:ring-berry-500"
              />
              <span className="text-sm font-medium text-ink/85">{t('Select all shown')}</span>
            </label>
            <p className="text-sm text-ink/70">
              {plural(filtered.length, '{n} sender', '{n} senders')} ·{' '}
              {plural(filtered.reduce((sum, g) => sum + g.count, 0), '{n} email', '{n} emails')}
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
                  className={`bg-white rounded-2xl p-5 border-2 shadow-sm transition ${
                    selected.has(group.key) ? 'border-berry-400 ring-1 ring-berry-200' : 'border-berry-200 hover:border-berry-300'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <label className="flex items-start space-x-4 flex-1 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(group.key)}
                        onChange={() => toggleSelected(group.key)}
                        disabled={busy !== null}
                        aria-label={t('Select {name}', { name: group.name })}
                        className="w-6 h-6 mt-2.5 rounded border-gray-300 text-berry-600 focus:ring-berry-500 flex-shrink-0"
                      />
                      <div className="w-11 h-11 rounded-full bg-mint-200 text-ink flex items-center justify-center font-semibold flex-shrink-0">
                        {group.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col sm:flex-row sm:items-baseline sm:space-x-2 min-w-0">
                          <h3 className="font-semibold text-ink truncate">{group.name}</h3>
                          <span className="text-sm text-ink/70 truncate">{group.sender}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-ink/75">
                          <span className="font-semibold text-ink">{plural(group.count, '{n} email', '{n} emails')}</span>
                          {group.unreadCount > 0 && <span>{t('{n} unread', { n: group.unreadCount })}</span>}
                          <span className="flex items-center space-x-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{t('Latest {time}', { time: timeAgo(group.latest, { dayPrecision: true }) })}</span>
                          </span>
                        </div>
                        <p className="text-sm text-ink/70 truncate mt-1">{group.exampleSubjects.join(' · ')}</p>
                        {group.protectedCount > 0 && (
                          <p className="flex items-center space-x-1 text-xs text-mint-700 mt-2">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>
                              {plural(group.protectedCount, '{n} receipt or invoice from them is Paid & Verified and will be kept.', '{n} receipts or invoices from them are Paid & Verified and will be kept.')}
                            </span>
                          </p>
                        )}
                        {group.importantCount > 0 && (
                          <p className="flex items-center space-x-1 text-xs text-sunny-700 mt-2">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>
                              {plural(group.importantCount, '{n} of these looks important - check before clearing.', '{n} of these look important - check before clearing.')}
                            </span>
                          </p>
                        )}
                      </div>
                    </label>

                    <div className="flex flex-wrap items-center gap-2 md:flex-shrink-0">
                      <UnsubscribeButton group={group} status={senderActions[group.key]} onStatus={setStatus} disabled={busy !== null} />
                      <button
                        onClick={() => handleMailAction(group, 'archive')}
                        disabled={busy !== null}
                        className="flex items-center space-x-2 px-4 py-2 bg-mint-200 hover:bg-mint-300 text-ink rounded-xl font-medium text-sm transition disabled:opacity-50"
                      >
                        {isBusy && busy?.action === 'archive' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Archive className="w-4 h-4" />
                        )}
                        <span>{isBusy && busy?.action === 'archive' ? t('Archiving...') : t('Archive all')}</span>
                      </button>
                      <button
                        onClick={() => handleMailAction(group, 'delete')}
                        disabled={busy !== null}
                        title={t('Delete all permanently')}
                        aria-label={t('Delete all emails from {name}', { name: group.name })}
                        className="p-2 border border-berry-200 text-berry-600 hover:bg-berry-50 rounded-xl transition disabled:opacity-50"
                      >
                        {isBusy && busy?.action === 'delete' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {message && (
                    <div
                      className={`mt-3 text-sm rounded-xl p-3 ${
                        message.tone === 'error' ? 'bg-berry-50 text-berry-700' : 'bg-ocean-50 text-ocean-800'
                      }`}
                    >
                      {message.text}
                    </div>
                  )}

                  {showArchivePrompt && !message && !isBusy && (
                    <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-mint-50 rounded-xl p-3">
                      <p className="text-sm text-mint-800">
                        {senderActions[group.key] === 'unsubscribed'
                          ? t("You won't get new mail from them.")
                          : t('Once you confirm on their page, new mail will stop.')}{' '}
                        {plural(group.count, 'Want to clear the {n} email they already sent?', 'Want to clear the {n} emails they already sent?')}
                      </p>
                      <button
                        onClick={() => handleMailAction(group, 'archive')}
                        disabled={busy !== null}
                        className="text-sm font-semibold text-mint-700 hover:text-mint-900 whitespace-nowrap disabled:opacity-50"
                      >
                        {t('Archive them')}
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
                className="text-mint-600 hover:text-mint-700 font-medium"
              >
                {t('Show more senders ({n} left)', { n: filtered.length - visibleCount })}
              </button>
            </div>
          )}
        </>
      )}

      {selectedGroups.length > 0 && (
        <>
          {/* Spacer so the fixed bar never covers the last row */}
          <div className="h-28" />
          <div className="fixed bottom-0 inset-x-0 z-20 bg-berry-100 border-t border-gray-200 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <p className="font-semibold text-ink">
                  {plural(selectedGroups.length, '{n} sender selected', '{n} senders selected')} ·{' '}
                  {plural(selectedEmailCount, '{n} email', '{n} emails')}
                </p>
                {selectedProtectedCount > 0 && (
                  <p className="text-sm text-mint-700 flex items-center space-x-1">
                    <ShieldCheck className="w-4 h-4" />
                    <span>{plural(selectedProtectedCount, '{n} receipt or invoice will be kept', '{n} receipts and invoices will be kept')}</span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelected(new Set())}
                  disabled={busy !== null}
                  className="px-4 py-3 text-ink/75 hover:text-ink font-medium disabled:opacity-50"
                >
                  {t('Clear')}
                </button>
                <button
                  onClick={() => handleBulkAction('archive')}
                  disabled={busy !== null}
                  className="flex items-center space-x-2 px-5 py-3 bg-mint-200 border-2 border-ink/10 text-ink hover:bg-mint-300 rounded-2xl font-semibold disabled:opacity-50"
                >
                  {busy?.key === '__bulk__' && busy.action === 'archive' ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Archive className="w-5 h-5" />
                  )}
                  <span>{busy?.key === '__bulk__' && busy.action === 'archive' ? t('Archiving...') : t('Archive')}</span>
                </button>
                <button
                  onClick={() => handleBulkAction('delete')}
                  disabled={busy !== null}
                  className="flex items-center space-x-2 px-5 py-3 bg-berry-200 hover:bg-berry-300 text-ink rounded-2xl font-semibold shadow-sm disabled:opacity-50"
                >
                  {busy?.key === '__bulk__' && busy.action === 'delete' ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Trash2 className="w-5 h-5" />
                  )}
                  <span>
                    {busy?.key === '__bulk__' && busy.action === 'delete'
                      ? t('Deleting...')
                      : t('Delete selected')}
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
