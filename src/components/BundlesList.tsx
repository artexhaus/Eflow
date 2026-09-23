import { useState } from 'react';
import { ChevronLeft, Package, Trash2, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Bundle, Email } from '../lib/types';

interface BundlesListProps {
  bundles: Bundle[];
  emails: Email[];
  onBack: () => void;
  onRefresh: () => void;
}

export default function BundlesList({ bundles, emails, onBack, onRefresh }: BundlesListProps) {
  const [processing, setProcessing] = useState<string | null>(null);

  const getBundleEmails = (bundleId: string) => {
    return emails.filter((e) => e.bundle_id === bundleId);
  };

  const getBundleTypeColor = (type: string) => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('promotion')) return 'from-pink-500 to-rose-500';
    if (lowerType.includes('notification')) return 'from-blue-500 to-cyan-500';
    if (lowerType.includes('newsletter')) return 'from-emerald-500 to-teal-500';
    return 'from-gray-500 to-gray-600';
  };

  const handleDeleteBundle = async (bundleId: string) => {
    setProcessing(bundleId);
    try {
      await supabase.from('emails').update({ is_deleted: true }).eq('bundle_id', bundleId);
      await supabase.from('bundles').delete().eq('id', bundleId);
      await onRefresh();
    } catch (error) {
      console.error('Error deleting bundle:', error);
    } finally {
      setProcessing(null);
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

      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Email Bundles</h2>
        <p className="text-gray-600">Groups of similar emails you can delete at once</p>
      </div>

      {bundles.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No bundles found</h3>
          <p className="text-gray-600">We'll group similar emails together for easy cleanup</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bundles.map((bundle) => {
            const bundleEmails = getBundleEmails(bundle.id);
            const exampleSubjects = Array.isArray(bundle.example_subjects)
              ? bundle.example_subjects
              : [];

            return (
              <div key={bundle.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className={`bg-gradient-to-r ${getBundleTypeColor(bundle.bundle_type)} p-6 text-white`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Package className="w-8 h-8" />
                      <div>
                        <h3 className="text-xl font-bold">{bundle.bundle_type}</h3>
                        <p className="text-sm opacity-90">from {bundle.sender}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold">{bundleEmails.length}</div>
                      <div className="text-sm opacity-90">emails</div>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <h4 className="font-semibold text-gray-900 mb-3">Example subjects:</h4>
                  <div className="space-y-2 mb-6">
                    {exampleSubjects.slice(0, 3).map((subject, idx) => (
                      <div key={idx} className="flex items-start space-x-2 text-sm text-gray-600">
                        <Mail className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />
                        <span>{subject}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => handleDeleteBundle(bundle.id)}
                    disabled={processing === bundle.id}
                    className="w-full flex items-center justify-center space-x-2 bg-red-500 hover:bg-red-600 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50"
                  >
                    <Trash2 className="w-5 h-5" />
                    <span>
                      {processing === bundle.id
                        ? 'Deleting...'
                        : `Delete all ${bundleEmails.length} emails`}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
