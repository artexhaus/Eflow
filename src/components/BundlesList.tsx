import { useState } from 'react';
import { ChevronLeft, Package, Trash2, Mail, Archive, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { applyMailAction, describePartialFailure, type MailAction } from '../lib/mailActions';
import type { Bundle, Email } from '../lib/types';

interface BundlesListProps {
  bundles: Bundle[];
  emails: Email[];
  onBack: () => void;
  onRefresh: () => void;
}

export default function BundlesList({ bundles, emails, onBack, onRefresh }: BundlesListProps) {
  const [processing, setProcessing] = useState<{ bundleId: string; action: MailAction } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const getBundleEmails = (bundleId: string) => {
    return emails.filter((e) => e.bundle_id === bundleId);
  };

  const getBundleTypeColor = (type: string) => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('promotion')) return 'from-berry-200 to-berry-200';
    if (lowerType.includes('notification')) return 'from-ocean-200 to-ocean-200';
    if (lowerType.includes('newsletter')) return 'from-mint-200 to-mint-200';
    return 'from-sunny-200 to-sunny-200';
  };

  // Runs the action on the real mail server first. The bundle row is only
  // removed once every one of its emails was handled, so a partial failure
  // leaves the remaining emails visible here to retry.
  const handleBundleAction = async (bundleId: string, action: 'archive' | 'delete') => {
    setProcessing({ bundleId, action });
    setErrors((prev) => ({ ...prev, [bundleId]: '' }));
    try {
      const result = await applyMailAction(action, { bundleId });
      if (result.failed === 0) {
        await supabase.from('bundles').delete().eq('id', bundleId);
      } else {
        setErrors((prev) => ({ ...prev, [bundleId]: describePartialFailure(result) }));
      }
      await onRefresh();
    } catch (error) {
      console.error(`Error ${action}ing bundle:`, error);
      setErrors((prev) => ({ ...prev, [bundleId]: (error as Error).message }));
    } finally {
      setProcessing(null);
    }
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

      <div className="mb-8">
        <h2 className="font-display text-3xl font-bold text-ink mb-2">Email Bundles</h2>
        <p className="text-ink/75">Groups of similar emails you can clear out at once</p>
      </div>

      {bundles.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center border-2 border-ink/10">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-ink mb-2">No bundles found</h3>
          <p className="text-ink/75">We'll group similar emails together for easy cleanup</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bundles.map((bundle) => {
            const bundleEmails = getBundleEmails(bundle.id);
            const exampleSubjects = Array.isArray(bundle.example_subjects)
              ? bundle.example_subjects
              : [];

            return (
              <div key={bundle.id} className="bg-white rounded-2xl shadow-sm overflow-hidden border-2 border-ink/10">
                <div className={`bg-gradient-to-r ${getBundleTypeColor(bundle.bundle_type)} p-6 text-ink`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Package className="w-8 h-8" />
                      <div>
                        <h3 className="text-xl font-bold">{bundle.bundle_type}</h3>
                        <p className="text-sm opacity-90">from {bundle.sender}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-3xl font-bold">{bundleEmails.length}</div>
                      <div className="text-sm opacity-90">emails</div>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <h4 className="font-semibold text-ink mb-3">Example subjects:</h4>
                  <div className="space-y-2 mb-6">
                    {exampleSubjects.slice(0, 3).map((subject, idx) => (
                      <div key={idx} className="flex items-start space-x-2 text-sm text-ink/75">
                        <Mail className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />
                        <span>{subject}</span>
                      </div>
                    ))}
                  </div>

                  {errors[bundle.id] && (
                    <div className="mb-4 bg-berry-50 border border-berry-200 rounded-xl p-3 flex items-start space-x-2">
                      <AlertCircle className="w-4 h-4 text-berry-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-berry-700">{errors[bundle.id]}</p>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => handleBundleAction(bundle.id, 'archive')}
                      disabled={processing !== null}
                      className="flex-1 flex items-center justify-center space-x-2 bg-mint-200 hover:bg-mint-300 text-ink py-3 rounded-xl font-semibold transition disabled:opacity-50"
                    >
                      {processing?.bundleId === bundle.id && processing.action === 'archive' ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Archive className="w-5 h-5" />
                      )}
                      <span>
                        {processing?.bundleId === bundle.id && processing.action === 'archive'
                          ? 'Archiving...'
                          : `Archive all ${bundleEmails.length}`}
                      </span>
                    </button>
                    <button
                      onClick={() => handleBundleAction(bundle.id, 'delete')}
                      disabled={processing !== null}
                      className="flex items-center justify-center space-x-2 bg-white border border-berry-300 text-berry-600 hover:bg-berry-50 px-5 py-3 rounded-xl font-semibold transition disabled:opacity-50"
                    >
                      {processing?.bundleId === bundle.id && processing.action === 'delete' ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Trash2 className="w-5 h-5" />
                      )}
                      <span>
                        {processing?.bundleId === bundle.id && processing.action === 'delete'
                          ? 'Deleting...'
                          : 'Delete'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
