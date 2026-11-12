import { useState } from 'react';
import { Mail, ArrowRight, Clock } from 'lucide-react';
import SpeedLogo from './SpeedLogo';
import { useI18n } from '../lib/i18n';
import { track } from '../lib/analytics';

interface ProviderSelectionProps {
  onProviderSelect: (provider: string) => void;
}

const providers = [
  {
    id: 'gmail',
    name: 'Gmail',
    tile: 'bg-berry-200 hover:bg-berry-300',
    iconColor: 'text-berry-700',
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail (IMAP)',
    tile: 'bg-mint-200 hover:bg-mint-300',
    iconColor: 'text-mint-700',
  },
  {
    id: 'aol',
    name: 'AOL Mail',
    tile: 'bg-ocean-100 hover:bg-ocean-200',
    iconColor: 'text-ocean-800',
  },
  {
    id: 'icloud',
    name: 'iCloud Mail',
    tile: 'bg-sunny-200 hover:bg-sunny-300',
    iconColor: 'text-sunny-700',
  },
];

export default function ProviderSelection({ onProviderSelect }: ProviderSelectionProps) {
  const { t } = useI18n();
  // Microsoft turned off app passwords for Outlook, Hotmail and Microsoft 365
  // mail apps; they now require "Sign in with Microsoft", which Eflow doesn't
  // support yet. Clicks are counted to measure demand.
  const [outlookNote, setOutlookNote] = useState(false);
  return (
    <div className="min-h-screen bg-gradient-to-br from-mint-100 via-sunny-100 to-berry-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-mint-200 rounded-3xl mb-6 shadow-2xl">
            <Mail className="w-10 h-10 text-ink" />
          </div>
          <div className="mb-4">
            <SpeedLogo className="text-5xl -ml-[1.45em]" />
          </div>
          <p className="text-xl text-ink/75 mb-2">{t('Reset your inbox. Automatically.')}</p>
          <p className="text-ink/70">{t('Choose your email provider to get started')}</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-8 border-2 border-ink/10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {providers.map((provider) => (
              <button
                key={provider.id}
                onClick={() => onProviderSelect(provider.id)}
                className={`group relative rounded-2xl p-6 text-left sm:last:odd:col-span-2 border-2 border-ink/10 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 ${provider.tile}`}
              >
                <div className="relative">
                  <div className="w-14 h-14 bg-white/80 rounded-2xl flex items-center justify-center mb-4 shadow-sm group-hover:rotate-6 transition-transform">
                    <Mail className={`w-7 h-7 ${provider.iconColor}`} />
                  </div>
                  <h3 className="text-xl font-bold text-ink mb-2">{provider.name}</h3>
                  <div className="flex items-center text-ink/70 transition-colors">
                    <span className="text-sm font-medium">{t('Connect securely')}</span>
                    <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                if (!outlookNote) track('outlook_interest');
                setOutlookNote(true);
              }}
              aria-expanded={outlookNote}
              className="rounded-2xl p-6 text-left sm:col-span-2 border-2 border-dashed border-ink/15 bg-cream hover:bg-white transition"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm flex-shrink-0">
                  <Mail className="w-7 h-7 text-ocean-700/60" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-bold text-ink/70 flex flex-wrap items-center gap-2">
                    <span>Outlook / Hotmail</span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-sunny-200 text-ink rounded-full px-2.5 py-1">
                      <Clock className="w-3.5 h-3.5" />
                      {t('Coming soon')}
                    </span>
                  </h3>
                  {outlookNote && (
                    <p className="text-sm text-ink/75 mt-2" role="status">
                      {t('Microsoft now requires "Sign in with Microsoft" for mail apps, and we\'re adding it. Thanks for letting us know you want it!')}
                    </p>
                  )}
                </div>
              </div>
            </button>
          </div>

          <div className="mt-8 p-4 bg-sunny-100 rounded-2xl">
            <p className="text-sm text-ink/75 text-center">
              {t('Your data stays private.')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
