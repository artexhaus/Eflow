import { useEffect, useState } from 'react';
import { KeyRound, MailX, Trash2, Loader2, AlertCircle, CheckCircle, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { t, tKnown, useI18n } from '../lib/i18n';

interface AccountControlsProps {
  onMailboxDisconnected: () => void;
}

const MIN_PASSWORD = 8;
const providerNames: Record<string, string> = { gmail: 'Gmail', outlook: 'Outlook', yahoo: 'Yahoo Mail', aol: 'AOL Mail', icloud: 'iCloud Mail' };

type Msg = { tone: 'error' | 'success'; text: string } | null;

function Message({ msg }: { msg: Msg }) {
  if (!msg) return null;
  const Icon = msg.tone === 'error' ? AlertCircle : CheckCircle;
  return (
    <p
      className={`flex items-start gap-2 text-sm rounded-2xl p-3 border-2 ${
        msg.tone === 'error' ? 'bg-berry-50 text-berry-800 border-berry-200' : 'bg-mint-100 text-mint-900 border-mint-200'
      }`}
      role={msg.tone === 'error' ? 'alert' : 'status'}
    >
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{msg.text}</span>
    </p>
  );
}

// Account settings a person controls themselves: their password, the mailbox
// connection (and the app password stored for it), and deleting everything.
export default function AccountControls({ onMailboxDisconnected }: AccountControlsProps) {
  const { user, updatePassword, signOut } = useAuth();
  useI18n();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<Msg>(null);

  const [mailbox, setMailbox] = useState<{ provider: string; address: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [mailboxMsg, setMailboxMsg] = useState<Msg>(null);

  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<Msg>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('users')
      .select('email_provider, connected_account_id')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.connected_account_id) setMailbox({ provider: data.email_provider, address: data.connected_account_id });
      });
  }, [user]);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (password.length < MIN_PASSWORD) return setPwMsg({ tone: 'error', text: t('Passwords need at least {n} characters.', { n: MIN_PASSWORD }) });
    if (password !== confirm) return setPwMsg({ tone: 'error', text: t("Those passwords don't match.") });
    setPwBusy(true);
    try {
      await updatePassword(password);
      setPassword('');
      setConfirm('');
      setPwMsg({ tone: 'success', text: t('Password updated.') });
    } catch (err) {
      setPwMsg({ tone: 'error', text: tKnown((err as Error).message) || t('Could not update your password.') });
    } finally {
      setPwBusy(false);
    }
  };

  // Removes the stored app password and every saved detail about the mailbox's
  // emails. The mailbox itself is not touched. Row-level security limits every
  // statement to this user's own rows.
  const disconnectMailbox = async () => {
    if (!user) return;
    setDisconnecting(true);
    setMailboxMsg(null);
    try {
      const { error: userError } = await supabase
        .from('users')
        .update({
          connected_account_id: null,
          encrypted_password: null,
          last_scan: null,
          scan_total: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (userError) throw userError;
      await supabase.from('emails').delete().eq('user_id', user.id);
      await supabase.from('bundles').delete().eq('user_id', user.id);
      await supabase.from('sender_actions').delete().eq('user_id', user.id);
      onMailboxDisconnected();
    } catch (err) {
      setMailboxMsg({ tone: 'error', text: tKnown((err as Error).message) || t('Could not disconnect your mailbox.') });
      setDisconnecting(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t('Your session expired. Please sign in again.'));
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ? tKnown(body.error) : t('Could not delete your account.'));
      await signOut();
    } catch (err) {
      setDeleteMsg({ tone: 'error', text: (err as Error).message });
      setDeleting(false);
    }
  };

  const inputClass = 'w-full px-4 py-3 border-2 border-ink/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-mint-400';

  return (
    <>
      {/* Sign-in & security */}
      <section className="bg-white border-2 border-sunny-200 border-t-[10px] border-t-sunny-300 rounded-3xl shadow-lg p-7">
        <h3 className="text-xl font-bold text-ink mb-1 flex items-center gap-2">
          <KeyRound className="w-5 h-5" /> {t('Sign-in & security')}
        </h3>
        <p className="text-ink/70 mb-4 break-all">{t('You sign in as {email}', { email: user?.email ?? '' })}</p>
        <form onSubmit={changePassword} className="space-y-3 max-w-md">
          <input
            type="password"
            autoComplete="new-password"
            placeholder={t('New password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder={t('Confirm new password')}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
          <Message msg={pwMsg} />
          <button
            type="submit"
            disabled={pwBusy || !password}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl font-display font-semibold text-ink bg-mint-200 hover:bg-mint-300 border-2 border-ink/15 shadow-md disabled:opacity-60"
          >
            {pwBusy && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{t('Change password')}</span>
          </button>
        </form>
      </section>

      {/* Connected mailbox */}
      <section className="bg-white border-2 border-mint-200 border-t-[10px] border-t-mint-300 rounded-3xl shadow-lg p-7">
        <h3 className="text-xl font-bold text-ink mb-1 flex items-center gap-2">
          <Mail className="w-5 h-5" /> {t('Connected mailbox')}
        </h3>
        {mailbox ? (
          <>
            <p className="text-ink/80 mb-1 break-all">
              <span className="font-semibold">{providerNames[mailbox.provider] ?? mailbox.provider}</span> · {mailbox.address}
            </p>
            <p className="text-sm text-ink/70 mb-4">
              {t("Disconnecting removes the app password Eflow stored and everything Eflow saved about your emails. Your actual mailbox isn't changed. You can reconnect any time.")}
            </p>
            <Message msg={mailboxMsg} />
            {confirmDisconnect ? (
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={disconnectMailbox}
                  disabled={disconnecting}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl font-display font-semibold text-ink bg-sunny-200 hover:bg-sunny-300 border-2 border-ink/15 shadow-md disabled:opacity-60"
                >
                  {disconnecting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{t('Yes, disconnect')}</span>
                </button>
                <button onClick={() => setConfirmDisconnect(false)} className="px-4 py-3 font-semibold text-ink/75 hover:text-ink">
                  {t('Cancel')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDisconnect(true)}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl font-display font-semibold text-ink bg-sunny-200 hover:bg-sunny-300 border-2 border-ink/15 shadow-md"
              >
                <MailX className="w-4 h-4" />
                <span>{t('Disconnect mailbox')}</span>
              </button>
            )}
          </>
        ) : (
          <p className="text-ink/70">{t('No mailbox connected.')}</p>
        )}
      </section>

      {/* Delete account */}
      <section className="bg-white border-2 border-berry-200 border-t-[10px] border-t-berry-300 rounded-3xl shadow-lg p-7">
        <h3 className="text-xl font-bold text-berry-900 mb-1 flex items-center gap-2">
          <Trash2 className="w-5 h-5" /> {t('Delete account')}
        </h3>
        <p className="text-sm text-berry-900/80 mb-4">
          {t("Permanently deletes your Eflow account, the stored app password and everything Eflow saved. An active Pro subscription is cancelled right away with no further charges. Your actual mailbox isn't changed. This can't be undone.")}
        </p>
        <label className="block max-w-md">
          <span className="block text-sm font-semibold text-berry-900 mb-1">{t('Type DELETE to confirm')}</span>
          <input value={deleteText} onChange={(e) => setDeleteText(e.target.value)} className={inputClass} autoComplete="off" />
        </label>
        <div className="mt-3 max-w-md">
          <Message msg={deleteMsg} />
        </div>
        <button
          onClick={deleteAccount}
          disabled={deleteText !== 'DELETE' || deleting}
          className="mt-3 flex items-center gap-2 px-5 py-3 rounded-2xl font-display font-semibold text-ink bg-berry-200 hover:bg-berry-300 border-2 border-ink/15 shadow-md disabled:opacity-50"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          <span>{t('Delete my account')}</span>
        </button>
      </section>
    </>
  );
}
