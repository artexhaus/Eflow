import { useState } from 'react';
import { ChevronLeft, Trash2, Archive, Mail, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Email } from '../lib/types';

interface ClutterEmailsProps {
  emails: Email[];
  onBack: () => void;
  onRefresh: () => void;
}

export default function ClutterEmails({ emails, onBack, onRefresh }: ClutterEmailsProps) {
  const { user } = useAuth();
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
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

  const applyAction = async (action: 'delete' | 'archive') => {
    if (selectedEmails.size === 0 || !user) return;

    setProcessing(true);
    setError('');

    try {
      const selected = emails.filter((e) => selectedEmails.has(e.id));
      const emailIds = selected.map((e) => e.email_id);

      const { data: userData } = await supabase
        .from('users')
        .select('email_provider')
        .eq('id', user.id)
        .maybeSingle();

      if (userData?.email_provider) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/imap-apply-actions`;
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action,
              emailIds,
              provider: userData.email_provider,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to ${action} emails on mail server`);
          }
        }
      }

      const dbAction = action === 'delete' ? { is_deleted: true } : { is_archived: true };
      await supabase.from('emails').update(dbAction).in('id', Array.from(selectedEmails));
      setSelectedEmails(new Set());
      await onRefresh();
    } catch (err) {
      console.error(`Error ${action}ing emails:`, err);
      setError((err as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!user) return;

    const confirmMsg = `Delete ALL ${emails.length} clutter emails from your mail server? This cannot be undone.`;
    if (!confirm(confirmMsg)) return;

    setProcessing(true);
    setError('');

    try {
      const { data: userData } = await supabase
        .from('users')
        .select('email_provider')
        .eq('id', user.id)
        .maybeSingle();

      if (userData?.email_provider) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/imap-apply-actions`;
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'delete',
              provider: userData.email_provider,
              category: 'clutter',
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete emails from mail server');
          }
        }
      }

      await supabase
        .from('emails')
        .update({ is_deleted: true })
        .eq('user_id', user.id)
        .eq('category', 'clutter');

      await onRefresh();
    } catch (err) {
      console.error('Error deleting all clutter:', err);
      setError((err as Error).message);
    } finally {
      setProcessing(false);
    }
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
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Clutter Emails</h2>
          <p className="text-gray-600">
            {emails.length.toLocaleString()} low-value emails you can safely remove
          </p>
        </div>
        {emails.length > 0 && (
          <button
            onClick={handleDeleteAll}
            disabled={processing}
            className="flex items-center space-x-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition disabled:opacity-50 shadow-sm"
          >
            <Trash2 className="w-4 h-4" />
            <span className="font-medium">Delete All</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {emails.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
          <Mail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No clutter emails</h3>
          <p className="text-gray-600">Your inbox is clean!</p>
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
                  className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="font-medium text-gray-700">
                  {selectedEmails.size > 0 ? `${selectedEmails.size} selected` : 'Select All'}
                </span>
              </label>
            </div>
            {selectedEmails.size > 0 && (
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => applyAction('archive')}
                  disabled={processing}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition disabled:opacity-50"
                >
                  <Archive className="w-4 h-4" />
                  <span className="font-medium">Archive</span>
                </button>
                <button
                  onClick={() => applyAction('delete')}
                  disabled={processing}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="font-medium">Delete</span>
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {visibleEmails.map((email) => (
              <div
                key={email.id}
                className={`bg-white rounded-xl p-6 transition border ${
                  selectedEmails.has(email.id)
                    ? 'border-emerald-500 shadow-md'
                    : 'border-gray-100 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start space-x-4">
                  <input
                    type="checkbox"
                    checked={selectedEmails.has(email.id)}
                    onChange={() => toggleEmail(email.id)}
                    className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 mt-1"
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
                    {!email.is_read && (
                      <span className="inline-block mt-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                        Unread
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {emails.length > 50 && !showAll && (
            <div className="text-center mt-6">
              <button
                onClick={() => setShowAll(true)}
                className="text-emerald-600 hover:text-emerald-700 font-medium"
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
