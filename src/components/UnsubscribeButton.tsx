import { useState } from 'react';
import { BellOff, CheckCircle, ExternalLink, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBilling } from '../contexts/BillingContext';
import { recordUnsubscribeLinkOpened, requestOneClickUnsubscribe, type SenderGroup } from '../lib/senders';
import type { SenderAction } from '../lib/types';

type UnsubscribeStatus = SenderAction['unsubscribe_status'];

interface UnsubscribeButtonProps {
  group: SenderGroup;
  status: UnsubscribeStatus | undefined;
  onStatus: (key: string, status: UnsubscribeStatus) => void;
  disabled?: boolean;
}

// One-click unsubscribe where the sender supports it (done on the server);
// otherwise a link to the sender's unsubscribe page or a pre-filled email.
export default function UnsubscribeButton({ group, status, onStatus, disabled }: UnsubscribeButtonProps) {
  const { user } = useAuth();
  const { isPro, unsubscribesUsed, unsubscribeLimit, openPricing, refresh } = useBilling();
  const [busy, setBusy] = useState(false);
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);

  if (status === 'unsubscribed') {
    return (
      <span className="flex items-center space-x-1 text-sm font-medium text-mint-700 bg-mint-50 px-3 py-2 rounded-xl">
        <CheckCircle className="w-4 h-4" />
        <span>Unsubscribed</span>
      </span>
    );
  }
  if (status === 'link_opened') {
    return (
      <span className="flex items-center space-x-1 text-sm font-medium text-ink/75 bg-gray-100 px-3 py-2 rounded-xl">
        <CheckCircle className="w-4 h-4" />
        <span>Unsubscribe page opened</span>
      </span>
    );
  }

  const withMessage = (control: JSX.Element) => (
    <span className="inline-flex flex-col items-end gap-1">
      {control}
      {message && (
        <span className={`text-xs max-w-[16rem] text-right ${message.tone === 'error' ? 'text-berry-700' : 'text-ocean-800'}`}>
          {message.text}
        </span>
      )}
    </span>
  );

  // Free plan allowance (the server enforces it too for one-click unsubscribes).
  const overLimit = !isPro && unsubscribesUsed >= unsubscribeLimit;

  const link = pendingLink ?? (!group.oneClick ? group.unsubscribeLink : null);
  if (link) {
    return withMessage(
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={async (e) => {
          if (overLimit) {
            e.preventDefault();
            openPricing({ kind: 'unsubscribe_limit' });
            return;
          }
          onStatus(group.key, 'link_opened');
          if (user) await recordUnsubscribeLinkOpened(user.id, group.key);
          refresh();
        }}
        className="flex items-center space-x-2 px-4 py-2 bg-white border-2 border-ink/10 text-ink/85 hover:bg-gray-50 rounded-xl font-medium text-sm transition"
      >
        <ExternalLink className="w-4 h-4" />
        <span>{link.startsWith('mailto:') ? 'Unsubscribe by email' : 'Open unsubscribe page'}</span>
      </a>
    );
  }

  if (!group.unsubscribeLink) {
    return <span className="text-xs text-gray-400 px-2">No unsubscribe option</span>;
  }

  const unsubscribe = async () => {
    if (overLimit) {
      openPricing({ kind: 'unsubscribe_limit' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await requestOneClickUnsubscribe(group.sender);
      if (result.status === 'limit') {
        openPricing({ kind: 'unsubscribe_limit' });
      } else if (result.status === 'unsubscribed') {
        onStatus(group.key, 'unsubscribed');
        refresh();
      } else if (result.status === 'needs_user') {
        setPendingLink(result.url);
        setMessage({ tone: 'info', text: 'This sender needs you to confirm on their page - open it to finish.' });
      } else {
        setMessage({ tone: 'error', text: result.message });
      }
    } catch (err) {
      setMessage({ tone: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return withMessage(
    <button
      onClick={unsubscribe}
      disabled={busy || disabled}
      className="flex items-center space-x-2 px-4 py-2 bg-white border-2 border-ink/10 text-ink/85 hover:bg-gray-50 rounded-xl font-medium text-sm transition disabled:opacity-50"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellOff className="w-4 h-4" />}
      <span>{busy ? 'Unsubscribing...' : 'Unsubscribe'}</span>
    </button>
  );
}
