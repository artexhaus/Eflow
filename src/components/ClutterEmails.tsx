import { useState } from 'react';
import { ChevronLeft, Trash2, Archive, Mail, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { applyMailAction, describePartialFailure } from '../lib/mailActions';
import { useBilling } from '../contexts/BillingContext';
import type { Email } from '../lib/types';
import { ScamBadge } from './ProtectedEmailControls';
import { t, plural, tKnown, timeAgo, useI18n } from '../lib/i18n';

interface ClutterEmailsProps {
  emails: Email[];
  onBack: () => void;
  onRefresh: () => void;
}

export default function ClutterEmails({ emails, onBack, onRefresh }: ClutterEmailsProps) {
  useI18n();
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  // Free plan: one email at a time; selecting several is a Pro feature.
  const { requirePro } = useBilling();
  const [activeAction, setActiveAction] = useState<'archive' | 'delete' | 'archive_all' | null>(null);
  const processing = activeAction !== null;
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  const visibleEmails = showAll ? emails : emails.slice(0, 50);

  const toggleEmail = (id: string) => {
    if (!selectedEmails.has(id) && selectedEmails.size >= 1 && !requirePro(t('Selecting several emails'))) return;
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
      if (!requirePro(t('Select All'))) return;
      setSelectedEmails(new Set(visibleEmails.map((e) => e.id)));
    }
  };

  const applyAction = async (action: 'delete' | 'archive') => {
    if (selectedEmails.size === 0) return;

    setActiveAction(action);
    setError('');

    try {
      const selected = emails.filter((e) => selectedEmails.has(e.id));
      const result = await applyMailAction(action, { emailIds: selected.map((e) => e.email_id) });
      setError(describePartialFailure(result));
      setSelectedEmails(new Set());
      await onRefresh();
    } catch (err) {
      console.error(`Error ${action}ing emails:`, err);
      setError(tKnown((err as Error).message));
    } finally {
      setActiveAction(null);
    }
  };

  // Archive rather than delete: a misclassified email can still be found in
  // the Archive folder, so the one-click bulk action is always recoverable.
  const handleArchiveAll = async () => {
    if (!requirePro(t('Archive All'))) return;
    const confirmMsg = t('Move all {n} clutter emails to your Archive folder? You can still find them there later.', { n: emails.length });
    if (!confirm(confirmMsg)) return;

    setActiveAction('archive_all');
    setError('');

    try {
      const result = await applyMailAction('archive', { category: 'clutter' }, { count: emails.length });
      setError(describePartialFailure(result));
      await onRefresh();
    } catch (err) {
      console.error('Error archiving all clutter:', err);
      setError(tKnown((err as Error).message));
    } finally {
      setActiveAction(null);
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

      <div className="mb-8 flex items-start justify-between">
        <div>
          <h2 className="font-display text-3xl font-bold text-ink mb-2">{t('Clutter Emails')}</h2>
          <p className="text-ink/75">
            {plural(emails.length, '{n} low-value email you can safely remove', '{n} low-value emails you can safely remove')}
          </p>
        </div>
        {emails.length > 0 && (
          <button
            onClick={handleArchiveAll}
            disabled={processing}
            className="flex items-center space-x-2 px-4 py-2 bg-mint-200 hover:bg-mint-300 text-ink rounded-xl transition disabled:opacity-50 shadow-sm"
          >
            {activeAction === 'archive_all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
            <span className="font-medium">{activeAction === 'archive_all' ? t('Archiving...') : t('Archive All')}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-berry-50 border border-berry-200 rounded-2xl p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-berry-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-berry-700">{error}</p>
        </div>
      )}

      {emails.length === 0 ? (
        <div className="bg-white border-2 border-berry-200 border-t-[10px] border-t-berry-300 rounded-2xl shadow-sm p-12 text-center">
          <Mail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-ink mb-2">{t('No clutter emails')}</h3>
          <p className="text-ink/75">{t('Your inbox is clean!')}</p>
        </div>
      ) : (
        <>
          <div className="bg-berry-100 rounded-2xl p-4 mb-4 flex items-center justify-between shadow-sm border-2 border-ink/10">
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedEmails.size === visibleEmails.length && visibleEmails.length > 0}
                  onChange={toggleAll}
                  className="w-5 h-5 rounded border-gray-300 text-mint-600 focus:ring-mint-500"
                />
                <span className="font-medium text-ink/85">
                  {selectedEmails.size > 0 ? t('{n} selected', { n: selectedEmails.size }) : t('Select All')}
                </span>
              </label>
            </div>
            {selectedEmails.size > 0 && (
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => applyAction('archive')}
                  disabled={processing}
                  className="flex items-center space-x-2 px-4 py-2 bg-mint-200 hover:bg-mint-300 text-ink border-2 border-ink/10 shadow-sm rounded-xl transition disabled:opacity-50"
                >
                  {activeAction === 'archive' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                  <span className="font-medium">{activeAction === 'archive' ? t('Archiving...') : t('Archive')}</span>
                </button>
                <button
                  onClick={() => applyAction('delete')}
                  disabled={processing}
                  className="flex items-center space-x-2 px-4 py-2 bg-berry-200 hover:bg-berry-300 text-ink rounded-xl transition disabled:opacity-50"
                >
                  {activeAction === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  <span className="font-medium">{activeAction === 'delete' ? t('Deleting...') : t('Delete')}</span>
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {visibleEmails.map((email) => (
              <div
                key={email.id}
                className={`bg-white rounded-2xl p-6 transition border-2 shadow-sm ${
                  selectedEmails.has(email.id)
                    ? 'border-mint-500 shadow-md'
                    : 'border-berry-200 hover:border-berry-300'
                }`}
              >
                <div className="flex items-start space-x-4">
                  <input
                    type="checkbox"
                    checked={selectedEmails.has(email.id)}
                    onChange={() => toggleEmail(email.id)}
                    className="w-5 h-5 rounded border-gray-300 text-mint-600 focus:ring-mint-500 mt-1"
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
                        <span>{timeAgo(email.timestamp)}</span>
                      </div>
                    </div>
                    <h4 className="text-lg font-medium text-ink mb-2 truncate">{email.subject}</h4>
                    <p className="text-ink/75 line-clamp-2">{email.snippet}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {!email.is_read && (
                        <span className="inline-block text-xs bg-ocean-100 text-ocean-700 px-2 py-1 rounded-full font-medium">
                          {t('Unread')}
                        </span>
                      )}
                      {email.is_suspicious && <ScamBadge />}
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
                className="text-mint-600 hover:text-mint-700 font-medium"
              >
                {t('Show all {n} emails', { n: emails.length })}
              </button>
            </div>
          )}
          {showAll && emails.length > 50 && (
            <div className="text-center mt-6">
              <button
                onClick={() => setShowAll(false)}
                className="text-ink/75 hover:text-ink font-medium"
              >
                {t('Show fewer')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
