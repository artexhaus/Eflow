import { useState } from 'react';
import { ChevronLeft, Sparkles, Trash2, Archive, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { applyMailAction, describePartialFailure } from '../lib/mailActions';
import { t, plural, tKnown, useI18n } from '../lib/i18n';

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
  useI18n();
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
      action === 'delete'
        ? t('Deleting {n} clutter and newsletter emails on your mail server...', { n: totalToRemove })
        : t('Archiving {n} clutter and newsletter emails on your mail server...', { n: totalToRemove })
    );

    try {
      const result = await applyMailAction(action, { category: ['clutter', 'bundle'] }, { silent: true });
      setProcessedCount(result.processed);
      setPartialFailure(describePartialFailure(result));
      setStep('complete');
      onComplete();
      if (result.failed === 0) {
        setTimeout(onBack, 2000);
      }
    } catch (error) {
      console.error('Error during reset:', error);
      setError(tKnown((error as Error).message));
      setStep('choose');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {step === 'choose' && (
        <>
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-ink/75 hover:text-ink mb-6 transition"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="font-medium">{t('Back to Dashboard')}</span>
          </button>

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-mint-200 rounded-2xl mb-4 shadow-lg">
              <Sparkles className="w-8 h-8 text-ink" />
            </div>
            <h2 className="font-display text-3xl font-bold text-ink mb-2">{t('Clean Up Inbox')}</h2>
            <p className="text-ink/75">{t('Delete all clutter and bundled emails from your mail server')}</p>
          </div>

          {error && (
            <div className="mb-6 bg-berry-50 border border-berry-200 rounded-2xl p-4 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-berry-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-berry-900">{t('Something went wrong')}</p>
                <p className="text-sm text-berry-700">{error}</p>
              </div>
            </div>
          )}

          <div className="bg-white border-2 border-sunny-200 border-t-[10px] border-t-sunny-300 rounded-2xl shadow-sm p-8 mb-6">
            <h3 className="text-lg font-semibold text-ink mb-6">{t('What will be cleaned up?')}</h3>

            <div className="space-y-4 mb-8">
              <div className="flex items-center justify-between p-4 bg-berry-50 rounded-2xl">
                <div className="flex items-center space-x-3">
                  <Trash2 className="w-5 h-5 text-berry-500" />
                  <span className="font-medium text-ink">{t('Clutter Emails')}</span>
                </div>
                <span className="font-display text-2xl font-bold text-berry-600">{clutterCount.toLocaleString()}</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-mint-50 rounded-2xl">
                <div className="flex items-center space-x-3">
                  <Archive className="w-5 h-5 text-mint-500" />
                  <span className="font-medium text-ink">{t('Email Bundles')}</span>
                </div>
                <span className="font-display text-2xl font-bold text-mint-600">{bundleCount.toLocaleString()}</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-ocean-50 rounded-2xl">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5 text-ocean-500" />
                  <span className="font-medium text-ink">{t('Important Emails (kept safe)')}</span>
                </div>
                <span className="font-display text-2xl font-bold text-ocean-600">{importantCount.toLocaleString()}</span>
              </div>
            </div>

            <div className="bg-sunny-50 border border-sunny-200 rounded-2xl p-4 mb-6">
              <p className="text-sm text-sunny-800">
                <strong>{plural(totalToRemove, '{n} email', '{n} emails')}</strong>{' '}
                {action === 'delete'
                  ? t('will be permanently deleted from your mail server. This cannot be undone.')
                  : t('will be archived from your mail server.')}{' '}
                {t('Important emails will be kept safe.')}
              </p>
            </div>

            <h3 className="text-lg font-semibold text-ink mb-4">{t('Choose an action:')}</h3>

            <div className="space-y-3 mb-6">
              <button
                onClick={() => setAction('archive')}
                className={`w-full p-4 rounded-2xl border-2 transition text-left ${
                  action === 'archive'
                    ? 'border-mint-500 bg-mint-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      action === 'archive' ? 'border-mint-500 bg-mint-200' : 'border-gray-300'
                    }`}
                  >
                    {action === 'archive' && <div className="w-2 h-2 bg-ink rounded-full" />}
                  </div>
                  <div>
                    <div className="font-semibold text-ink">
                      {t('Archive All Clutter & Bundles')}
                      <span className="ml-2 text-xs font-medium bg-mint-100 text-mint-700 px-2 py-0.5 rounded-full">{t('Recommended')}</span>
                    </div>
                    <div className="text-sm text-ink/75">
                      {t('Moves {n} emails to Archive folder (restorable later)', { n: totalToRemove })}
                    </div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setAction('delete')}
                className={`w-full p-4 rounded-2xl border-2 transition text-left ${
                  action === 'delete'
                    ? 'border-berry-500 bg-berry-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      action === 'delete' ? 'border-berry-500 bg-berry-200' : 'border-gray-300'
                    }`}
                  >
                    {action === 'delete' && <div className="w-2 h-2 bg-ink rounded-full" />}
                  </div>
                  <div>
                    <div className="font-semibold text-ink">{t('Delete All Clutter & Bundles')}</div>
                    <div className="text-sm text-ink/75">
                      {t('Permanently deletes {n} emails from your mail server', { n: totalToRemove })}
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <button
            onClick={handleReset}
            disabled={totalToRemove === 0}
            className={`w-full text-ink py-4 rounded-2xl font-semibold transition shadow-lg hover:shadow-xl disabled:opacity-50 ${
              action === 'delete'
                ? 'bg-berry-200 hover:bg-berry-300'
                : 'bg-mint-200 hover:bg-mint-300'
            }`}
          >
            {action === 'delete'
              ? plural(totalToRemove, 'Delete {n} email', 'Delete {n} emails')
              : plural(totalToRemove, 'Archive {n} email', 'Archive {n} emails')}
          </button>
        </>
      )}

      {step === 'processing' && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-mint-200 rounded-full mb-6 shadow-lg">
            <Loader2 className="w-10 h-10 text-ink animate-spin" />
          </div>
          <h3 className="font-display text-2xl font-bold text-ink mb-2">{t('Cleaning up your inbox...')}</h3>
          <p className="text-ink/75">{progress}</p>
          <p className="text-sm text-ink/70 mt-2">{t('This may take a few minutes for large inboxes')}</p>
        </div>
      )}

      {step === 'complete' && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-mint-200 rounded-full mb-6 shadow-lg">
            <CheckCircle className="w-10 h-10 text-ink" />
          </div>
          <h3 className="font-display text-2xl font-bold text-ink mb-2">
            {partialFailure ? t('Mostly done') : t('All done!')}
          </h3>
          <p className="text-ink/75">
            {action === 'delete'
              ? plural(processedCount, '{n} email has been deleted from your inbox.', '{n} emails have been deleted from your inbox.')
              : plural(processedCount, '{n} email has been archived from your inbox.', '{n} emails have been archived from your inbox.')}
          </p>
          {partialFailure && (
            <>
              <p className="text-sm text-sunny-700 mt-3 max-w-md mx-auto">{partialFailure}</p>
              <button
                onClick={onBack}
                className="mt-6 inline-flex items-center space-x-2 text-mint-600 hover:text-mint-700 font-medium"
              >
                <ChevronLeft className="w-5 h-5" />
                <span>{t('Back to Dashboard')}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
