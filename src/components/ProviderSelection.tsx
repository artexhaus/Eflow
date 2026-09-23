import { Mail, ArrowRight } from 'lucide-react';

interface ProviderSelectionProps {
  onProviderSelect: (provider: string) => void;
}

const providers = [
  {
    id: 'gmail',
    name: 'Gmail',
    color: 'from-berry-500 to-berry-500',
    textColor: 'text-berry-600',
    bgColor: 'bg-berry-50',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    color: 'from-ocean-500 to-ocean-600',
    textColor: 'text-ocean-600',
    bgColor: 'bg-ocean-50',
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail (IMAP)',
    color: 'from-mint-500 to-mint-600',
    textColor: 'text-mint-600',
    bgColor: 'bg-mint-50',
  },
  {
    id: 'icloud',
    name: 'iCloud Mail',
    color: 'from-ocean-500 to-ocean-500',
    textColor: 'text-ocean-600',
    bgColor: 'bg-ocean-50',
  },
];

export default function ProviderSelection({ onProviderSelect }: ProviderSelectionProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-mint-50 via-sunny-50 to-berry-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-mint-500 to-ocean-600 rounded-3xl mb-6 shadow-2xl">
            <Mail className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-4">Eflow</h1>
          <p className="text-xl text-gray-600 mb-2">Reset your inbox. Automatically.</p>
          <p className="text-gray-500">Choose your email provider to get started</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {providers.map((provider) => (
              <button
                key={provider.id}
                onClick={() => onProviderSelect(provider.id)}
                className="group relative overflow-hidden rounded-2xl p-6 border-2 border-gray-100 hover:border-transparent hover:shadow-xl transition-all duration-300"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${provider.color} opacity-0 group-hover:opacity-10 transition-opacity`} />
                <div className="relative">
                  <div className={`w-14 h-14 ${provider.bgColor} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <Mail className={`w-7 h-7 ${provider.textColor}`} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{provider.name}</h3>
                  <div className="flex items-center text-gray-500 group-hover:text-mint-600 transition-colors">
                    <span className="text-sm font-medium">Connect securely</span>
                    <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-8 p-4 bg-gray-50 rounded-xl">
            <p className="text-sm text-gray-600 text-center">
              Your data stays private.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
