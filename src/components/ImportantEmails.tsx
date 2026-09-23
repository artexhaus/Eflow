import { useMemo, useState } from 'react';
import { ChevronLeft, Mail, Paperclip, Clock, Eye, EyeOff, Receipt, ShoppingBag, CalendarClock, ShieldCheck, User, Tag, KeyRound } from 'lucide-react';
import type { Email } from '../lib/types';

interface ImportantEmailsProps {
  emails: Email[];
  // Every protected bill/receipt, whatever category the scan gave it - a
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

// Display-only split inside Paid & Verified: money already sent vs bills.
function getVerifiedKind(email: Email): 'Paid' | 'Bill' {
  return /receipt|paid|confirm|refund|successful|processed|complete|transaction/i.test(email.subject || '')
    ? 'Paid'
    : 'Bill';
}

export default function ImportantEmails({ emails, verifiedEmails, initialTab = 'all', onBack }: ImportantEmailsProps) {
  const [showAll, setShowAll] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>(initialTab);

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
    if (!reason) return 'bg-gray-100 text-gray-700';
    const r = reason.toLowerCase();
    if (r.includes('bank') || r.includes('financial') || r.includes('legal')) return 'bg-red-100 text-red-700';
    if (r.includes('security') || r.includes('account')) return 'bg-orange-100 text-orange-700';
    if (r.includes('time-sensitive') || r.includes('delivery')) return 'bg-green-100 text-green-700';
    if (r.includes('personal')) return 'bg-blue-100 text-blue-700';
    if (r.includes('attachment')) return 'bg-purple-100 text-purple-700';
    return 'bg-emerald-100 text-emerald-700';
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

      <div className="mb-8 flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Important Emails</h2>
          <p className="text-gray-600">
            {emails.length.toLocaleString()} emails flagged as important
          </p>
        </div>
        <button
          onClick={() => setFilterUnread(!filterUnread)}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition ${
            filterUnread
              ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
            }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-full whitespace-nowrap transition border ${
              key === 'verified'
                ? activeCategory === key
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-300'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-sm shadow-emerald-200 hover:bg-emerald-100'
                : activeCategory === key
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-700'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium text-sm">{label}</span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                activeCategory === key
                  ? key === 'verified' ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white'
                  : key === 'verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {categoryCounts[key]}
            </span>
          </button>
        ))}
      </div>

      {isVerifiedTab && (
        <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start space-x-4">
          <div className="w-11 h-11 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold text-emerald-900 text-lg">Your bills and receipts are safely filed</p>
            <p className="text-emerald-800">
              Everything here is protected. Clean-ups, Archive All and Delete buttons always skip these emails.
            </p>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
          <Mail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {isVerifiedTab
              ? 'No bills or receipts yet'
              : filterUnread ? 'No unread important emails' : 'No important emails'}
          </h3>
          <p className="text-gray-600">
            {isVerifiedTab ? "When a bill or receipt arrives, it'll be filed here automatically." : "You're all caught up!"}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {visibleEmails.map((email) => (
              <div
                key={email.id}
                className={`bg-white rounded-xl p-6 hover:shadow-lg transition border ${
                  email.is_protected
                    ? 'border-emerald-300 ring-1 ring-emerald-200 shadow-md shadow-emerald-100'
                    : !email.is_read
                      ? 'border-blue-200 bg-blue-50/30'
                      : 'border-gray-100 hover:border-blue-300'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {email.sender_name || email.sender}
                      </h3>
                      {email.is_protected && (
                        <span className="flex items-center space-x-1 text-xs px-2 py-1 rounded-full font-semibold flex-shrink-0 bg-emerald-100 text-emerald-800">
                          <Receipt className="w-3.5 h-3.5" />
                          <span>{getVerifiedKind(email) === 'Paid' ? 'Paid · Safe' : 'Bill · Safe'}</span>
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
                    <div className="text-sm text-gray-600 truncate">{email.sender}</div>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-gray-500 flex-shrink-0 ml-4">
                    <Clock className="w-4 h-4" />
                    <span>{formatTime(email.timestamp)}</span>
                  </div>
                </div>

                <h4 className="text-lg font-medium text-gray-900 mb-2 truncate">{email.subject}</h4>
                <p className="text-gray-600 mb-3 line-clamp-2">{email.snippet}</p>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="flex items-center space-x-4">
                    {email.has_attachment && (
                      <div className="flex items-center space-x-1 text-sm text-gray-500">
                        <Paperclip className="w-4 h-4" />
                        <span>Attachment</span>
                      </div>
                    )}
                    {!email.is_read && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                        Unread
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filtered.length > 50 && !showAll && (
            <div className="text-center mt-6">
              <button
                onClick={() => setShowAll(true)}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Show all {filtered.length.toLocaleString()} emails
              </button>
            </div>
          )}
          {showAll && filtered.length > 50 && (
            <div className="text-center mt-6">
              <button
                onClick={() => setShowAll(false)}
                className="text-gray-600 hover:text-gray-800 font-medium"
              >
                Show fewer
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
