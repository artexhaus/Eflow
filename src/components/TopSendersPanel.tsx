import { useMemo, useState } from 'react';
import { Users, Archive, Loader2, ChevronRight } from 'lucide-react';
import { applyMailAction, describePartialFailure } from '../lib/mailActions';
import { groupBySender, type SenderGroup } from '../lib/senders';
import { useSenderActions } from '../hooks/useSenderActions';
import UnsubscribeButton from './UnsubscribeButton';
import type { Email } from '../lib/types';
import { t, tKnown, useI18n } from '../lib/i18n';

interface TopSendersPanelProps {
  emails: Email[];
  onRefresh: () => Promise<void> | void;
  onOpenSenders: () => void;
}

const SHOWN = 5;

// Dashboard shortcut to the biggest wins: the top senders by volume, each
// with Unsubscribe and Archive all right here, plus a link to the full list.
export default function TopSendersPanel({ emails, onRefresh, onOpenSenders }: TopSendersPanelProps) {
  const groups = useMemo(() => groupBySender(emails).slice(0, SHOWN), [emails]);
  const { statuses, setStatus } = useSenderActions();
  const { plural } = useI18n();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ key: string; text: string } | null>(null);

  if (groups.length === 0) return null;

  const archiveAll = async (group: SenderGroup) => {
    setBusyKey(group.key);
    setMessage(null);
    try {
      const result = await applyMailAction('archive', { sender: group.sender }, { label: t('emails from {name}', { name: group.name }) });
      if (result.failed > 0) setMessage({ key: group.key, text: describePartialFailure(result) });
      await onRefresh();
    } catch (err) {
      setMessage({ key: group.key, text: tKnown((err as Error).message) });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section className="bg-white border-2 border-berry-200 border-t-[10px] border-t-berry-300 rounded-3xl shadow-lg p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-berry-200 rounded-2xl border-2 border-ink/10 flex items-center justify-center -rotate-6">
            <Users className="w-6 h-6 text-berry-700" />
          </div>
          <div>
            <h3 className="font-display text-xl font-bold text-ink">{t('Who emails you most')}</h3>
            <p className="text-sm text-ink/70">{t('Unsubscribe and clear them out right here.')}</p>
          </div>
        </div>
        <button
          onClick={onOpenSenders}
          className="hidden sm:flex items-center gap-1 text-sm font-semibold text-ocean-700 hover:text-ocean-900"
        >
          <span>{t('See all senders')}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <ul className="divide-y-2 divide-ink/5">
        {groups.map((group) => (
          <li key={group.key} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-ocean-100 text-ocean-800 font-display font-bold flex items-center justify-center flex-shrink-0">
                {group.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-ink truncate">{group.name}</p>
                <p className="text-sm text-ink/70">
                  {plural(group.count, '{n} email', '{n} emails')}
                  {group.unreadCount > 0 && ` · ${t('{n} unread', { n: group.unreadCount })}`}
                </p>
                {message?.key === group.key && <p className="text-xs text-berry-700 mt-1">{message.text}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <UnsubscribeButton group={group} status={statuses[group.key]} onStatus={setStatus} disabled={busyKey !== null} />
              <button
                onClick={() => archiveAll(group)}
                disabled={busyKey !== null}
                className="flex items-center gap-2 px-4 py-2 bg-mint-200 hover:bg-mint-300 text-ink rounded-xl border-2 border-ink/10 shadow-sm font-medium text-sm transition disabled:opacity-50"
              >
                {busyKey === group.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                <span>{t('Archive all')}</span>
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button
        onClick={onOpenSenders}
        className="sm:hidden mt-3 w-full text-center text-sm font-semibold text-ocean-700"
      >
        {t('See all senders')}
      </button>
    </section>
  );
}
