import { Mail, ArrowRight } from 'lucide-react';
import SpeedLogo from './SpeedLogo';

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
    id: 'outlook',
    name: 'Outlook',
    tile: 'bg-ocean-200 hover:bg-ocean-300',
    iconColor: 'text-ocean-700',
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail (IMAP)',
    tile: 'bg-mint-200 hover:bg-mint-300',
    iconColor: 'text-mint-700',
  },
  {
    id: 'icloud',
    name: 'iCloud Mail',
    tile: 'bg-sunny-200 hover:bg-sunny-300',
    iconColor: 'text-sunny-700',
  },
];

export default function ProviderSelection({ onProviderSelect }: ProviderSelectionProps) {
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
          <p className="text-xl text-ink/75 mb-2">Reset your inbox. Automatically.</p>
          <p className="text-ink/70">Choose your email provider to get started</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-8 border-2 border-ink/10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {providers.map((provider) => (
              <button
                key={provider.id}
                onClick={() => onProviderSelect(provider.id)}
                className={`group relative rounded-2xl p-6 text-left border-2 border-ink/10 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 ${provider.tile}`}
              >
                <div className="relative">
                  <div className="w-14 h-14 bg-white/80 rounded-2xl flex items-center justify-center mb-4 shadow-sm group-hover:rotate-6 transition-transform">
                    <Mail className={`w-7 h-7 ${provider.iconColor}`} />
                  </div>
                  <h3 className="text-xl font-bold text-ink mb-2">{provider.name}</h3>
                  <div className="flex items-center text-ink/70 transition-colors">
                    <span className="text-sm font-medium">Connect securely</span>
                    <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-8 p-4 bg-sunny-100 rounded-2xl">
            <p className="text-sm text-ink/75 text-center">
              Your data stays private.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
