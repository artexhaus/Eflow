import { useState } from 'react';
import { ChevronLeft, Sparkles, Trash2, Archive, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface InboxResetProps {
  importantCount: number;
  clutterCount: number;
  bundleCount: number;
  onBack: () => void;
  onComplete: () => void;
}

export default function InboxReset({
  importantCount,
  clutterCount,
  bundleCount,
  onBack,
  onComplete,
}: InboxResetProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<'choose' | 'processing' | 'complete'>('choose');
  const [action, setAction] = useState<'archive' | 'delete'>('delete');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const totalToRemove = clutterCount + bundleCount;

  const handleReset = async () => {
    if (!user) return;

    setStep('processing');
    setError('');
    setProgress('Connecting to your email server...');

    try {
      const { data: userData } = await supabase
        .from('users')
        .select('email_provider, connected_account_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!userData?.email_provider || !userData?.connected_account_id) {
        throw new Error('No email account connected. Please connect your email first.');
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      setProgress(`Deleting ${totalToRemove} clutter and bundle emails from your mail server...`);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/imap-apply-actions`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          provider: userData.email_provider,
          category: ['clutter', 'bundle'],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete emails from mail server');
      }

      const result = await response.json();
      setProgress(`Processed ${result.processed || 0} emails on the server. Updating database...`);

      // Mark emails as deleted/archived in database
      if (action === 'delete') {
        await supabase
          .from('emails')
          .update({ is_deleted: true })
          .eq('user_id', user.id)
          .in('category', ['clutter', 'bundle']);
      } else {
        await supabase
          .from('emails')
          .update({ is_archived: true })
          .eq('user_id', user.id)
          .in('category', ['clutter', 'bundle']);
      }

      setStep('complete');
      setTimeout(() => {
        onComplete();
        onBack();
      }, 2000);
    } catch (error) {
      console.error('Error during reset:', error);
      setError((error as Error).message);
      setStep('choose');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {step === 'choose' && (
        <>
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-6 transition"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="font-medium">Back to Dashboard</span>
          </button>

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl mb-4 shadow-lg">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Clean Up Inbox</h2>
            <p className="text-gray-600">Delete all clutter and bundled emails from your mail server</p>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Something went wrong</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm p-8 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">What will be cleaned up?</h3>

            <div className="space-y-4 mb-8">
              <div className="flex items-center justify-between p-4 bg-orange-50 rounded-xl">
                <div className="flex items-center space-x-3">
                  <Trash2 className="w-5 h-5 text-orange-500" />
                  <span className="font-medium text-gray-900">Clutter Emails</span>
                </div>
                <span className="text-2xl font-bold text-orange-600">{clutterCount.toLocaleString()}</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl">
                <div className="flex items-center space-x-3">
                  <Archive className="w-5 h-5 text-emerald-500" />
                  <span className="font-medium text-gray-900">Email Bundles</span>
                </div>
                <span className="text-2xl font-bold text-emerald-600">{bundleCount.toLocaleString()}</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5 text-blue-500" />
                  <span className="font-medium text-gray-900">Important Emails (kept safe)</span>
                </div>
                <span className="text-2xl font-bold text-blue-600">{importantCount.toLocaleString()}</span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-amber-800">
                <strong>{totalToRemove.toLocaleString()} emails</strong> will be {action === 'delete' ? 'permanently deleted' : 'archived'} from your mail server.
                {action === 'delete' && ' This cannot be undone.'}
                {' '}Important emails will be kept safe.
              </p>
            </div>

            <h3 className="text-lg font-semibold text-gray-900 mb-4">Choose an action:</h3>

            <div className="space-y-3 mb-6">
              <button
                onClick={() => setAction('delete')}
                className={`w-full p-4 rounded-xl border-2 transition text-left ${
                  action === 'delete'
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      action === 'delete' ? 'border-red-500 bg-red-500' : 'border-gray-300'
                    }`}
                  >
                    {action === 'delete' && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Delete All Clutter & Bundles</div>
                    <div className="text-sm text-gray-600">
                      Permanently deletes {totalToRemove.toLocaleString()} emails from your mail server
                    </div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setAction('archive')}
                className={`w-full p-4 rounded-xl border-2 transition text-left ${
                  action === 'archive'
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      action === 'archive' ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
                    }`}
                  >
                    {action === 'archive' && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">Archive All Clutter & Bundles</div>
                    <div className="text-sm text-gray-600">
                      Moves {totalToRemove.toLocaleString()} emails to Archive folder (restorable later)
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <button
            onClick={handleReset}
            disabled={totalToRemove === 0}
            className={`w-full text-white py-4 rounded-xl font-semibold transition shadow-lg hover:shadow-xl disabled:opacity-50 ${
              action === 'delete'
                ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
                : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700'
            }`}
          >
            {action === 'delete' ? `Delete ${totalToRemove.toLocaleString()} Emails` : `Archive ${totalToRemove.toLocaleString()} Emails`}
          </button>
        </>
      )}

      {step === 'processing' && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full mb-6 shadow-lg animate-pulse">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Cleaning up your inbox...</h3>
          <p className="text-gray-600">{progress}</p>
          <p className="text-sm text-gray-500 mt-2">This may take a few minutes for large inboxes</p>
        </div>
      )}

      {step === 'complete' && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full mb-6 shadow-lg">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">All done!</h3>
          <p className="text-gray-600">{totalToRemove.toLocaleString()} emails have been {action === 'delete' ? 'deleted' : 'archived'} from your inbox.</p>
        </div>
      )}
    </div>
  );
}
