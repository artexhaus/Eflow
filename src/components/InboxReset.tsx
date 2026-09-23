import { useState } from 'react';
import { ChevronLeft, Sparkles, Trash2, Archive, CheckCircle, AlertCircle } from 'lucide-react';
import { applyMailAction, describePartialFailure } from '../lib/mailActions';

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
  const [step, setStep] = useState<'choose' | 'processing' | 'complete'>('choose');
  const [action, setAction] = useState<'archive' | 'delete'>('archive');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [processedCount, setProcessedCount] = useState(0);
  const [partialFailure, setPartialFailure] = useState('');

  const totalToRemove = clutterCount + bundleCount;

  const handleReset = async () => {
    setStep('processing');
    setError('');
    setProgress(
      `${action === 'delete' ? 'Deleting' : 'Archiving'} ${totalToRemove.toLocaleString()} clutter and newsletter emails on your mail server...`
    );

    try {
      const result = await applyMailAction(action, { category: ['clutter', 'bundle'] });
      setProcessedCount(result.processed);
      setPartialFailure(describePartialFailure(result));
      setStep('complete');
      onComplete();
      if (result.failed === 0) {
        setTimeout(onBack, 2000);
      }
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
                    <div className="font-semibold text-gray-900">
                      Archive All Clutter & Bundles
                      <span className="ml-2 text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Recommended</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      Moves {totalToRemove.toLocaleString()} emails to Archive folder (restorable later)
                    </div>
                  </div>
                </div>
              </button>

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
          <h3 className="text-2xl font-bold text-gray-900 mb-2">
            {partialFailure ? 'Mostly done' : 'All done!'}
          </h3>
          <p className="text-gray-600">
            {processedCount.toLocaleString()} emails have been {action === 'delete' ? 'deleted' : 'archived'} from your inbox.
          </p>
          {partialFailure && (
            <>
              <p className="text-sm text-amber-700 mt-3 max-w-md mx-auto">{partialFailure}</p>
              <button
                onClick={onBack}
                className="mt-6 inline-flex items-center space-x-2 text-emerald-600 hover:text-emerald-700 font-medium"
              >
                <ChevronLeft className="w-5 h-5" />
                <span>Back to Dashboard</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
