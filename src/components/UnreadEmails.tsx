import { useState } from 'react';
import { ChevronLeft, Mail, Paperclip, Clock, CheckCheck, AlertCircle, Loader2, Archive, Trash2, ShieldCheck } from 'lucide-react';
import { applyMailAction, describePartialFailure } from '../lib/mailActions';
import type { Email } from '../lib/types';
import { ProtectedBadge } from './ProtectedEmailControls';
import RemoveConfirmDialog from './RemoveConfirmDialog';

interface UnreadEmailsProps {
  emails: Email[];
  onBack: () => void;
  onRefresh: () => void;
}

export default function UnreadEmails({ emails, onBack, onRefresh }: UnreadEmailsProps) {
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  // True after "Select all N unread emails": the selection is every unread
  // email, not just the ones rendered on the page.
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [activeAction, setActiveAction] = useState<'selected' | 'all' | 'archive' | 'delete' | null>(null);
  const processing = activeAction !== null;
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingRemove, setPendingRemove] = useState<'archive' | 'delete' | null>(null);
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

  const selectedList = selectAllMatching ? emails : emails.filter((e) => selectedEmails.has(e.id));
  const selectedCount = selectedList.length;
  const allVisibleSelected =
    selectAllMatching || (visibleEmails.length > 0 && visibleEmails.every((e) => selectedEmails.has(e.id)));

  const clearSelection = () => {
    setSelectedEmails(new Set());
    setSelectAllMatching(false);
  };

  const toggleEmail = (id: string) => {
    if (selectAllMatching) {
      // Unticking one email turns "everything" back into an explicit list.
      setSelectAllMatching(false);
      setSelectedEmails(new Set(emails.filter((e) => e.id !== id).map((e) => e.id)));
      return;
    }
    const newSelected = new Set(selectedEmails);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedEmails(newSelected);
  };

  const toggleAll = () => {
    if (allVisibleSelected) {
      clearSelection();
    } else {
      setSelectedEmails(new Set(visibleEmails.map((e) => e.id)));
    }
  };

  const markAsRead = async (emailIds: string[], scope: 'selected' | 'all') => {
    if (emailIds.length === 0) return;

    setActiveAction(scope);
    setError('');
    setNotice('');

    try {
      const result = await applyMailAction('mark_read', { emailIds });
      setError(describePartialFailure(result));
      clearSelection();
      await onRefresh();
    } catch (err) {
      console.error('Error marking emails as read:', err);
      setError((err as Error).message);
    } finally {
      setActiveAction(null);
    }
  };

  const handleMarkSelectedRead = () => {
    markAsRead(selectedList.map((e) => e.email_id), 'selected');
  };

  // Archive or delete the selection. Bills and receipts (Paid & Verified) are
  // always skipped by the server; the confirmation says so up front.
  // Delete/Archive opens one confirmation window. If the selection includes
  // bills or receipts it names them and lets the user keep or include them.
  const handleRemoveSelected = (action: 'archive' | 'delete') => {
    if (selectedCount === 0) return;
    setPendingRemove(action);
  };

  const runRemove = async (action: 'archive' | 'delete', includeProtected: boolean) => {
    setPendingRemove(null);
    const targets = includeProtected ? selectedList : selectedList.filter((e) => !e.is_protected);
    const kept = selectedCount - targets.length;

    setActiveAction(action);
    setError('');
    setNotice('');
    try {
      const result = await applyMailAction(
        action,
        { emailIds: targets.map((e) => e.email_id) },
        { allowProtected: includeProtected }
      );
      let text = `${action === 'delete' ? 'Deleted' : 'Archived'} ${result.processed.toLocaleString()} email${result.processed === 1 ? '' : 's'}.`;
      const safe = kept + result.protectedSkipped;
      if (safe > 0) text += ` Kept ${safe.toLocaleString()} ${safe === 1 ? 'bill or receipt' : 'bills and receipts'} safe.`;
      setNotice(text);
      setError(describePartialFailure(result));
      clearSelection();
      await onRefresh();
    } catch (err) {
      console.error(`Error ${action}ing emails:`, err);
      setError((err as Error).message);
    } finally {
      setActiveAction(null);
    }
  };

  const handleMarkAllRead = () => {
    markAsRead(emails.map((e) => e.email_id), 'all');
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
          <h2 className="font-display text-3xl font-bold text-ink mb-2">Unread Emails</h2>
          <p className="text-ink/75">
            {emails.length.toLocaleString()} emails you haven't opened yet
          </p>
        </div>
        {emails.length > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={processing}
            className="flex items-center space-x-2 px-4 py-2 bg-sunny-300 hover:bg-sunny-400 text-sunny-900 rounded-xl transition disabled:opacity-50 shadow-sm"
          >
            {activeAction === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
            <span className="font-medium">{activeAction === 'all' ? 'Marking...' : 'Mark All Read'}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-berry-50 border border-berry-200 rounded-2xl p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-berry-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-berry-700">{error}</p>
        </div>
      )}

      {notice && (
        <div className="mb-4 bg-mint-100 border-2 border-mint-200 rounded-2xl p-4 flex items-start space-x-3">
          <ShieldCheck className="w-5 h-5 text-mint-700 flex-shrink-0 mt-0.5" />
          <p className="flex-1 text-sm text-mint-900">{notice}</p>
          <button onClick={() => setNotice('')} className="text-sm font-medium text-mint-800">
            Dismiss
          </button>
        </div>
      )}

      {emails.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center border-2 border-ink/10">
          <Mail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-ink mb-2">No unread emails</h3>
          <p className="text-ink/75">You're all caught up!</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm border-2 border-ink/10 sticky top-20 z-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                  disabled={processing}
                  className="w-5 h-5 rounded border-gray-300 text-sunny-600 focus:ring-sunny-500"
                />
                <span className="font-medium text-ink/85">
                  {selectedCount > 0 ? `${selectedCount.toLocaleString()} selected` : 'Select All'}
                </span>
              </label>
              {selectedCount > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleMarkSelectedRead}
                    disabled={processing}
                    className="flex items-center space-x-2 px-4 py-2 bg-sunny-300 hover:bg-sunny-400 text-sunny-900 rounded-xl border-2 border-ink/10 shadow-sm transition disabled:opacity-50"
                  >
                    {activeAction === 'selected' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                    <span className="font-medium">{activeAction === 'selected' ? 'Marking...' : 'Mark as Read'}</span>
                  </button>
                  <button
                    onClick={() => handleRemoveSelected('archive')}
                    disabled={processing}
                    className="flex items-center space-x-2 px-4 py-2 bg-mint-200 hover:bg-mint-300 text-ink rounded-xl border-2 border-ink/10 shadow-sm transition disabled:opacity-50"
                  >
                    {activeAction === 'archive' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                    <span className="font-medium">{activeAction === 'archive' ? 'Archiving...' : 'Archive'}</span>
                  </button>
                  <button
                    onClick={() => handleRemoveSelected('delete')}
                    disabled={processing}
                    className="flex items-center space-x-2 px-4 py-2 bg-berry-200 hover:bg-berry-300 text-ink rounded-xl border-2 border-ink/10 shadow-sm transition disabled:opacity-50"
                  >
                    {activeAction === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    <span className="font-medium">{activeAction === 'delete' ? 'Deleting...' : 'Delete'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Gmail-style: after ticking the page, offer to extend to every unread email. */}
            {allVisibleSelected && emails.length > visibleEmails.length && (
              <div className="mt-3 pt-3 border-t-2 border-ink/5 text-sm text-ink/80 text-center">
                {selectAllMatching ? (
                  <>
                    All {emails.length.toLocaleString()} unread emails are selected.{' '}
                    <button onClick={clearSelection} className="font-semibold text-ocean-700 hover:underline">
                      Clear selection
                    </button>
                  </>
                ) : (
                  <>
                    All {visibleEmails.length.toLocaleString()} on this page are selected.{' '}
                    <button
                      onClick={() => setSelectAllMatching(true)}
                      className="font-semibold text-ocean-700 hover:underline"
                    >
                      Select all {emails.length.toLocaleString()} unread emails
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {visibleEmails.map((email) => (
              <div
                key={email.id}
                className={`bg-white rounded-2xl p-6 transition border ${
                  selectAllMatching || selectedEmails.has(email.id)
                    ? 'border-sunny-500 shadow-md'
                    : 'border-ocean-200 bg-ocean-50/30 hover:border-sunny-300'
                }`}
              >
                <div className="flex items-start space-x-4">
                  <input
                    type="checkbox"
                    checked={selectAllMatching || selectedEmails.has(email.id)}
                    onChange={() => toggleEmail(email.id)}
                    className="w-5 h-5 rounded border-gray-300 text-sunny-600 focus:ring-sunny-500 mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-ink mb-1 truncate">
                          {email.sender_name || email.sender}
                        </h3>
                        <div className="text-sm text-ink/75 truncate">{email.sender}</div>
                      </div>
                      <div className="flex items-center space-x-2 text-sm text-ink/70 flex-shrink-0 ml-4">
                        <Clock className="w-4 h-4" />
                        <span>{formatTime(email.timestamp)}</span>
                      </div>
                    </div>
                    <h4 className="text-lg font-medium text-ink mb-2 truncate">{email.subject}</h4>
                    <p className="text-ink/75 line-clamp-2">{email.snippet}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      {email.has_attachment && (
                        <div className="flex items-center space-x-1 text-sm text-ink/70">
                          <Paperclip className="w-4 h-4" />
                          <span>Attachment</span>
                        </div>
                      )}
                      <span className="text-xs bg-ocean-100 text-ocean-700 px-2 py-1 rounded-full font-medium capitalize">
                        {email.category}
                      </span>
                      {email.is_protected && <ProtectedBadge />}
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
          total={selectedCount}
          protectedEmails={selectedList.filter((e) => e.is_protected)}
          importantCount={selectedList.filter((e) => e.category === 'important' && !e.is_protected).length}
          onConfirm={(includeProtected) => runRemove(pendingRemove, includeProtected)}
          onCancel={() => setPendingRemove(null)}
        />
      )}
    </div>
  );
}
