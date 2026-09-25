import { useMemo, useState } from 'react';
import {
  ChevronLeft, Mail, Paperclip, Clock, Eye, EyeOff, Receipt, ShoppingBag, CalendarClock, ShieldCheck, User, Tag, KeyRound,
  CheckCheck, Archive, Trash2, Loader2, Download, AlertCircle,
} from 'lucide-react';
import { useBilling } from '../contexts/BillingContext';
import type { Email } from '../lib/types';
import { applyMailAction, describePartialFailure } from '../lib/mailActions';
import RemoveConfirmDialog from './RemoveConfirmDialog';
import { ScamBadge } from './ProtectedEmailControls';

interface ImportantEmailsProps {
  emails: Email[];
  // Every protected receipt/invoice, whatever category the scan gave it - a
  // receipt filed under "clutter" still belongs in Paid & Verified.
  verifiedEmails: Email[];
  initialTab?: 'all' | 'verified';
  onBack: () => void;
  onRefresh: () => void;
}

type CategoryKey = 'all' | 'verified' | 'orders' | 'dates' | 'security' | 'personal' | 'other';

const CATEGORY_TABS: { key: CategoryKey; label: string; icon: typeof Tag }[] = [
  { key: 'all', label: 'All', icon: Tag },
  { key: 'verified', label: 'Paid & Verified', icon: ShieldCheck },
  { key: 'orders', label: 'Orders & Deliveries', icon: ShoppingBag },
  { key: 'dates', label: 'Upcoming Dates', icon: CalendarClock },
  { key: 'security', label: 'Security & Accounts', icon: KeyRound },
  { key: 'personal', label: 'Personal', icon: User },
  { key: 'other', label: 'Other', icon: Mail },
];

// Buckets important emails into user-facing topics so a large "Important"
// list stays scannable. Keyword rules mirror (and reuse the intent of) the
// backend classifier's importance_reason values, plus subject-line keywords
// for finer-grained grouping than the single "important" category stores.
function getEmailCategory(email: Email): CategoryKey {
  // Paid & Verified comes straight from the database's is_protected flag - the
  // same flag the server uses to refuse clean-ups - so this tab always shows
  // exactly the emails that are safe from deletion.
  if (email.is_protected) return 'verified';

  const reason = (email.importance_reason || '').toLowerCase();
  const subject = (email.subject || '').toLowerCase();
  const sender = (email.sender || '').toLowerCase();
  const text = `${subject} ${reason} ${sender}`;

  const orderKeywords = ['order', 'purchase', 'shipped', 'delivery', 'delivered', 'tracking', 'package'];
  if (orderKeywords.some((kw) => text.includes(kw))) return 'orders';

  const dateKeywords = ['appointment', 'reminder', 'confirmation', 'booking', 'reservation', 'flight', 'ticket', 'boarding', 'check-in', 'checkin', 'event', 'meeting', 'interview', 'deadline', 'renewal', 'expires', 'expiring', 'rsvp', 'schedule', 'due', 'mortgage', 'rent', 'lease', 'autopay'];
  if (dateKeywords.some((kw) => text.includes(kw))) return 'dates';

  const securityKeywords = ['security', 'verification', 'password', 'login', 'sign in', 'verify', 'confirm your', 'reset', 'account alert', 'two-factor', '2fa', 'suspicious'];
  if (securityKeywords.some((kw) => text.includes(kw))) return 'security';

  if (reason.includes('personal')) return 'personal';

  return 'other';
}

// Display-only label inside Paid & Verified: what kind of payment proof it is.
function getVerifiedKind(email: Email): 'Receipt' | 'Order' | 'Invoice' {
  const subject = email.subject || '';
  if (/receipt|paid|payment|refund|thank/i.test(subject)) return 'Receipt';
  if (/order|purchase/i.test(subject)) return 'Order';
  return 'Invoice';
}

// Saves the receipts and invoices as a CSV spreadsheet (e.g. for taxes or
// expenses). Built in the browser from the list already on screen.
function downloadReceiptsCsv(rows: Email[]) {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [
    ['Date', 'From', 'Email address', 'Subject', 'Type', 'Attachment'].map(cell).join(','),
    ...rows.map((e) =>
      [
        new Date(e.timestamp).toISOString().slice(0, 10),
        e.sender_name || '',
        e.sender,
        e.subject,
        getVerifiedKind(e),
        e.has_attachment ? 'Yes' : 'No',
      ]
        .map(cell)
        .join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `eflow-receipts-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

type BulkAction = 'mark_read' | 'archive' | 'delete';

export default function ImportantEmails({ emails, verifiedEmails, initialTab = 'all', onBack, onRefresh }: ImportantEmailsProps) {
  const [showAll, setShowAll] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>(initialTab);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeAction, setActiveAction] = useState<BulkAction | null>(null);
  const [pendingRemove, setPendingRemove] = useState<'archive' | 'delete' | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const categorized = useMemo(
    () => emails.map((email) => ({ email, category: getEmailCategory(email) })),
    [emails]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryKey, number> = {
      all: emails.length,
      verified: 0,
      orders: 0,
      dates: 0,
      security: 0,
      personal: 0,
      other: 0,
    };
    for (const { category } of categorized) {
      if (category !== 'verified') counts[category]++;
    }
    counts.verified = verifiedEmails.length;
    return counts;
  }, [categorized, emails.length, verifiedEmails.length]);

  const isVerifiedTab = activeCategory === 'verified';
  const byCategory =
    activeCategory === 'all'
      ? emails
      : isVerifiedTab
        ? verifiedEmails
        : categorized.filter((c) => c.category === activeCategory).map((c) => c.email);

  const filtered = filterUnread ? byCategory.filter((e) => !e.is_read) : byCategory;
  const visibleEmails = showAll ? filtered : filtered.slice(0, 50);

  const selectedList = filtered.filter((e) => selected.has(e.id));
  const allVisibleSelected = visibleEmails.length > 0 && visibleEmails.every((e) => selected.has(e.id));
  const processing = activeAction !== null;

  // Free plan: one email at a time; selecting several and exporting receipts
  // are Pro features.
  const { requirePro } = useBilling();

  const toggleOne = (id: string) => {
    if (!selected.has(id) && selected.size >= 1 && !requirePro('Selecting several emails')) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    if (!allVisibleSelected && !requirePro('Select All')) return;
    setSelected(allVisibleSelected ? new Set() : new Set(visibleEmails.map((e) => e.id)));
  };

  // Receipts and invoices here are ones the user picked by hand; the
  // confirmation window names them before anything is removed.
  const runAction = async (action: BulkAction, includeProtected = false) => {
    setPendingRemove(null);
    const targets =
      action === 'mark_read' || includeProtected ? selectedList : selectedList.filter((e) => !e.is_protected);
    const kept = selectedList.length - targets.length;
    if (targets.length === 0) return;

    setActiveAction(action);
    setNotice('');
    setError('');
    try {
      const result = await applyMailAction(
        action,
        { emailIds: targets.map((e) => e.email_id) },
        { allowProtected: includeProtected }
      );
      const verb = action === 'delete' ? 'Deleted' : action === 'archive' ? 'Archived' : 'Marked as read:';
      let text = `${verb} ${result.processed.toLocaleString()} email${result.processed === 1 ? '' : 's'}.`;
      if (action === 'archive') text += ' You can find them in your Archive folder.';
      if (kept > 0) text += ` Kept ${kept.toLocaleString()} ${kept === 1 ? 'receipt or invoice' : 'receipts and invoices'}.`;
      setNotice(text);
      setError(describePartialFailure(result));
      setSelected(new Set());
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActiveAction(null);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays} days ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  const getReasonBadgeColor = (reason: string | null) => {
    if (!reason) return 'bg-gray-100 text-ink/85';
    const r = reason.toLowerCase();
    if (r.includes('bank') || r.includes('financial') || r.includes('legal')) return 'bg-berry-100 text-berry-700';
    if (r.includes('security') || r.includes('account')) return 'bg-berry-100 text-berry-700';
    if (r.includes('time-sensitive') || r.includes('delivery')) return 'bg-mint-100 text-mint-700';
    if (r.includes('personal')) return 'bg-ocean-100 text-ocean-700';
    if (r.includes('attachment')) return 'bg-sunny-100 text-sunny-700';
    return 'bg-mint-100 text-mint-700';
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button
        onClick={onBack}
        className="flex items-center space-x-2 text-ink/75 hover:text-ink mb-6 transition"
      >
        <ChevronLeft className="w-5 h-5" />
        <span className="font-medium">Back to Dashboard</span>
      </button>

      <div className="mb-8 flex items-start justify-between">
        <div>
          <h2 className="font-display text-3xl font-bold text-ink mb-2">Important Emails</h2>
          <p className="text-ink/75">
            {emails.length.toLocaleString()} emails flagged as important
          </p>
        </div>
        <button
          onClick={() => setFilterUnread(!filterUnread)}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition ${
            filterUnread
              ? 'bg-ocean-100 text-ocean-700'
              : 'bg-gray-100 text-ink/85 hover:bg-gray-200'
          }`}
        >
          {filterUnread ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          <span className="font-medium text-sm">
            {filterUnread ? 'Unread only' : 'All emails'}
          </span>
        </button>
      </div>

      <div className="flex items-center space-x-2 overflow-x-auto pb-2 mb-6 -mx-1 px-1">
        {CATEGORY_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => {
              setActiveCategory(key);
              setShowAll(false);
              setSelected(new Set());
            }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-full whitespace-nowrap transition border ${
              key === 'verified'
                ? activeCategory === key
                  ? 'bg-mint-200 border-mint-600 text-ink shadow-md shadow-mint-300'
                  : 'bg-mint-50 border-mint-300 text-mint-800 shadow-sm shadow-mint-200 hover:bg-mint-100'
                : activeCategory === key
                  ? 'bg-ocean-200 border-ocean-600 text-ink shadow-sm'
                  : 'bg-white border-gray-200 text-ink/85 hover:border-ocean-300 hover:text-ocean-700'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium text-sm">{label}</span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                activeCategory === key
                  ? key === 'verified' ? 'bg-mint-200 text-ink' : 'bg-ocean-200 text-ink'
                  : key === 'verified' ? 'bg-mint-100 text-mint-700' : 'bg-gray-100 text-ink/75'
              }`}
            >
              {categoryCounts[key]}
            </span>
          </button>
        ))}
      </div>

      {isVerifiedTab && (
        <div className="mb-6 bg-mint-50 border-2 border-mint-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-11 h-11 bg-mint-100 rounded-2xl flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-6 h-6 text-mint-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-mint-900 text-lg">Your receipts and invoices are safely filed</p>
            <p className="text-mint-800">
              Clean Up and bulk actions always skip these. To archive or delete some yourself, tick them below.
            </p>
          </div>
          {verifiedEmails.length > 0 && (
            <button
              onClick={() => requirePro('Receipt export') && downloadReceiptsCsv(verifiedEmails)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-mint-100 text-ink rounded-2xl border-2 border-ink/10 shadow-sm font-semibold flex-shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Download list</span>
            </button>
          )}
        </div>
      )}

      {notice && (
        <div className="mb-4 bg-mint-100 border-2 border-mint-200 rounded-2xl p-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-mint-700 flex-shrink-0 mt-0.5" />
          <p className="flex-1 text-sm text-mint-900">{notice}</p>
          <button onClick={() => setNotice('')} className="text-sm font-medium text-mint-800">
            Dismiss
          </button>
        </div>
      )}
      {error && (
        <div className="mb-4 bg-berry-50 border-2 border-berry-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-berry-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-berry-700">{error}</p>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center border-2 border-ink/10">
          <Mail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-ink mb-2">
            {isVerifiedTab
              ? 'No receipts or invoices yet'
              : filterUnread ? 'No unread important emails' : 'No important emails'}
          </h3>
          <p className="text-ink/75">
            {isVerifiedTab ? "When a receipt or invoice arrives, it'll be filed here automatically." : "You're all caught up!"}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm border-2 border-ink/10 sticky top-20 z-10 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
                disabled={processing}
                className="w-5 h-5 rounded border-gray-300 text-mint-600 focus:ring-mint-500"
              />
              <span className="font-medium text-ink/85">
                {selectedList.length > 0 ? `${selectedList.length.toLocaleString()} selected` : 'Select All'}
              </span>
            </label>
            {selectedList.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => runAction('mark_read')}
                  disabled={processing}
                  className="flex items-center space-x-2 px-4 py-2 bg-sunny-300 hover:bg-sunny-400 text-sunny-900 rounded-xl border-2 border-ink/10 shadow-sm transition disabled:opacity-50"
                >
                  {activeAction === 'mark_read' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                  <span className="font-medium">Mark as Read</span>
                </button>
                <button
                  onClick={() => setPendingRemove('archive')}
                  disabled={processing}
                  className="flex items-center space-x-2 px-4 py-2 bg-mint-200 hover:bg-mint-300 text-ink rounded-xl border-2 border-ink/10 shadow-sm transition disabled:opacity-50"
                >
                  {activeAction === 'archive' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                  <span className="font-medium">Archive</span>
                </button>
                <button
                  onClick={() => setPendingRemove('delete')}
                  disabled={processing}
                  className="flex items-center space-x-2 px-4 py-2 bg-berry-200 hover:bg-berry-300 text-ink rounded-xl border-2 border-ink/10 shadow-sm transition disabled:opacity-50"
                >
                  {activeAction === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  <span className="font-medium">Delete</span>
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {visibleEmails.map((email) => (
              <div
                key={email.id}
                className={`rounded-2xl p-6 transition border-2 shadow-md ${
                  selected.has(email.id)
                    ? 'ring-2 ring-ocean-300 '
                    : ''
                }${
                  email.is_protected
                    ? 'bg-mint-50 border-mint-300 shadow-mint-300'
                    : !email.is_read
                      ? 'bg-ocean-50 border-ocean-200'
                      : 'bg-white border-ink/10 hover:border-ocean-300'
                }`}
              >
                <div className="flex items-start gap-4">
                <input
                  type="checkbox"
                  checked={selected.has(email.id)}
                  onChange={() => toggleOne(email.id)}
                  disabled={processing}
                  aria-label={`Select ${email.subject}`}
                  className="w-5 h-5 mt-1 rounded border-gray-300 text-mint-600 focus:ring-mint-500 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="font-semibold text-ink truncate">
                        {email.sender_name || email.sender}
                      </h3>
                      {email.is_protected && (
                        <span className="flex items-center space-x-1 text-xs px-2 py-1 rounded-full font-semibold flex-shrink-0 bg-mint-100 text-mint-800">
                          <Receipt className="w-3.5 h-3.5" />
                          <span>{getVerifiedKind(email)} · Safe</span>
                        </span>
                      )}
                      {email.importance_reason && !email.is_protected && (
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${getReasonBadgeColor(
                            email.importance_reason
                          )}`}
                        >
                          {email.importance_reason}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-ink/75 truncate">{email.sender}</div>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-ink/70 flex-shrink-0 ml-4">
                    <Clock className="w-4 h-4" />
                    <span>{formatTime(email.timestamp)}</span>
                  </div>
                </div>

                <h4 className="text-lg font-medium text-ink mb-2 truncate">{email.subject}</h4>
                <p className="text-ink/75 mb-3 line-clamp-2">{email.snippet}</p>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="flex items-center space-x-4">
                    {email.has_attachment && (
                      <div className="flex items-center space-x-1 text-sm text-ink/70">
                        <Paperclip className="w-4 h-4" />
                        <span>Attachment</span>
                      </div>
                    )}
                    {!email.is_read && (
                      <span className="text-xs bg-ocean-100 text-ocean-700 px-2 py-1 rounded-full font-medium">
                        Unread
                      </span>
                    )}
                    {email.is_suspicious && <ScamBadge />}
                  </div>
                </div>
                </div>
                </div>
              </div>
            ))}
          </div>

          {filtered.length > 50 && !showAll && (
            <div className="text-center mt-6">
              <button
                onClick={() => setShowAll(true)}
                className="text-ocean-600 hover:text-ocean-700 font-medium"
              >
                Show all {filtered.length.toLocaleString()} emails
              </button>
            </div>
          )}
          {showAll && filtered.length > 50 && (
            <div className="text-center mt-6">
              <button
                onClick={() => setShowAll(false)}
                className="text-ink/75 hover:text-ink font-medium"
              >
                Show fewer
              </button>
            </div>
          )}
        </>
      )}
      {pendingRemove && (
        <RemoveConfirmDialog
          action={pendingRemove}
          total={selectedList.length}
          protectedEmails={selectedList.filter((e) => e.is_protected)}
          importantCount={0}
          onConfirm={(includeProtected) => runAction(pendingRemove, includeProtected)}
          onCancel={() => setPendingRemove(null)}
        />
      )}
    </div>
  );
}
