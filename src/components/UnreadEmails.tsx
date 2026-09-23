import { useState } from 'react';
import { ChevronLeft, Mail, Paperclip, Clock, CheckCheck, AlertCircle, Loader2 } from 'lucide-react';
import { applyMailAction, describePartialFailure } from '../lib/mailActions';
import type { Email } from '../lib/types';

interface UnreadEmailsProps {
  emails: Email[];
  onBack: () => void;
  onRefresh: () => void;
}

export default function UnreadEmails({ emails, onBack, onRefresh }: UnreadEmailsProps) {
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [activeAction, setActiveAction] = useState<'selected' | 'all' | null>(null);
  const processing = activeAction !== null;
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  const visibleEmails = showAll ? emails : emails.slice(0, 50);

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

  const toggleEmail = (id: string) => {
    const newSelected = new Set(selectedEmails);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedEmails(newSelected);
  };

  const toggleAll = () => {
    if (selectedEmails.size === visibleEmails.length) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(visibleEmails.map((e) => e.id)));
    }
  };

  const markAsRead = async (emailIds: string[], scope: 'selected' | 'all') => {
    if (emailIds.length === 0) return;

    setActiveAction(scope);
    setError('');

    try {
      const result = await applyMailAction('mark_read', { emailIds });
      setError(describePartialFailure(result));
      setSelectedEmails(new Set());
      await onRefresh();
    } catch (err) {
      console.error('Error marking emails as read:', err);
      setError((err as Error).message);
    } finally {
      setActiveAction(null);
    }
  };

  const handleMarkSelectedRead = () => {
    const selected = emails.filter((e) => selectedEmails.has(e.id));
    markAsRead(selected.map((e) => e.email_id), 'selected');
  };

  const handleMarkAllRead = () => {
    markAsRead(emails.map((e) => e.email_id), 'all');
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
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Unread Emails</h2>
          <p className="text-gray-600">
            {emails.length.toLocaleString()} emails you haven't opened yet
          </p>
        </div>
        {emails.length > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={processing}
            className="flex items-center space-x-2 px-4 py-2 bg-sunny-300 hover:bg-sunny-400 text-sunny-900 rounded-lg transition disabled:opacity-50 shadow-sm"
          >
            {activeAction === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
            <span className="font-medium">{activeAction === 'all' ? 'Marking...' : 'Mark All Read'}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-berry-50 border border-berry-200 rounded-xl p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-berry-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-berry-700">{error}</p>
        </div>
      )}

      {emails.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
          <Mail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No unread emails</h3>
          <p className="text-gray-600">You're all caught up!</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl p-4 mb-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedEmails.size === visibleEmails.length && visibleEmails.length > 0}
                  onChange={toggleAll}
                  className="w-5 h-5 rounded border-gray-300 text-sunny-600 focus:ring-sunny-500"
                />
                <span className="font-medium text-gray-700">
                  {selectedEmails.size > 0 ? `${selectedEmails.size} selected` : 'Select All'}
                </span>
              </label>
            </div>
            {selectedEmails.size > 0 && (
              <button
                onClick={handleMarkSelectedRead}
                disabled={processing}
                className="flex items-center space-x-2 px-4 py-2 bg-sunny-300 hover:bg-sunny-400 text-sunny-900 rounded-lg transition disabled:opacity-50"
              >
                {activeAction === 'selected' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                <span className="font-medium">{activeAction === 'selected' ? 'Marking...' : 'Mark as Read'}</span>
              </button>
            )}
          </div>

          <div className="space-y-3">
            {visibleEmails.map((email) => (
              <div
                key={email.id}
                className={`bg-white rounded-xl p-6 transition border ${
                  selectedEmails.has(email.id)
                    ? 'border-sunny-500 shadow-md'
                    : 'border-ocean-200 bg-ocean-50/30 hover:border-sunny-300'
                }`}
              >
                <div className="flex items-start space-x-4">
                  <input
                    type="checkbox"
                    checked={selectedEmails.has(email.id)}
                    onChange={() => toggleEmail(email.id)}
                    className="w-5 h-5 rounded border-gray-300 text-sunny-600 focus:ring-sunny-500 mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 mb-1 truncate">
                          {email.sender_name || email.sender}
                        </h3>
                        <div className="text-sm text-gray-600 truncate">{email.sender}</div>
                      </div>
                      <div className="flex items-center space-x-2 text-sm text-gray-500 flex-shrink-0 ml-4">
                        <Clock className="w-4 h-4" />
                        <span>{formatTime(email.timestamp)}</span>
                      </div>
                    </div>
                    <h4 className="text-lg font-medium text-gray-900 mb-2 truncate">{email.subject}</h4>
                    <p className="text-gray-600 line-clamp-2">{email.snippet}</p>
                    <div className="flex items-center space-x-3 mt-2">
                      {email.has_attachment && (
                        <div className="flex items-center space-x-1 text-sm text-gray-500">
                          <Paperclip className="w-4 h-4" />
                          <span>Attachment</span>
                        </div>
                      )}
                      <span className="text-xs bg-ocean-100 text-ocean-700 px-2 py-1 rounded-full font-medium capitalize">
                        {email.category}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {emails.length > 50 && !showAll && (
            <div className="text-center mt-6">
              <button
                onClick={() => setShowAll(true)}
                className="text-sunny-600 hover:text-sunny-700 font-medium"
              >
                Show all {emails.length.toLocaleString()} emails
              </button>
            </div>
          )}
          {showAll && emails.length > 50 && (
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
