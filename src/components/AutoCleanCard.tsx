import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CalendarCheck, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useBilling } from '../contexts/BillingContext';
import { useI18n } from '../lib/i18n';
import { track } from '../lib/analytics';

type Frequency = 'weekly' | 'biweekly';

interface AutoCleanSettings {
  enabled: boolean;
  frequency: Frequency;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_cleaned: number;
  last_run_status: 'ok' | 'failed' | null;
  last_error: string | null;
  total_cleaned: number;
  catching_up: boolean;
  summary_emails: boolean;
}

// Automatic cleanup, included with Pro yearly. The schedule runs on the
// server (supabase/functions/auto-clean); this card only switches it on or
// off, picks how often, and shows what the last run did.
export default function AutoCleanCard() {
  const { user } = useAuth();
  const { isPro, subscription, openPricing } = useBilling();
  const { t, plural, formatDate, formatNumber, lang } = useI18n();
  const [settings, setSettings] = useState<AutoCleanSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isYearly = isPro && subscription?.plan === 'annual';

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('auto_clean_settings')
      .select('enabled, frequency, next_run_at, last_run_at, last_run_cleaned, last_run_status, last_error, total_cleaned, catching_up, summary_emails')
      .eq('user_id', user.id)
      .maybeSingle();
    setSettings((data as AutoCleanSettings | null) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (enabled: boolean, frequency: Frequency, summaryEmails?: boolean) => {
    setSaving(true);
    setError('');
    // The app language goes along each time, so the summary email matches it.
    const { data, error: rpcError } = await supabase.rpc('set_auto_clean', {
      p_enabled: enabled,
      p_frequency: frequency,
      p_language: lang,
      ...(summaryEmails === undefined ? {} : { p_summary_emails: summaryEmails }),
    });
    setSaving(false);
    if (rpcError) {
      setError(t('Something went wrong. Please try again.'));
      return;
    }
    setSettings(data as AutoCleanSettings);
    track(enabled ? 'auto_clean_saved' : 'auto_clean_turned_off', { frequency });
  };

  const enabled = settings?.enabled ?? false;
  const frequency: Frequency = settings?.frequency ?? 'weekly';

  // Not on the yearly plan: show what it is and how to get it.
  if (!isYearly) {
    return (
      <section className="bg-white border-2 border-mint-200 border-t-[10px] border-t-mint-300 rounded-3xl shadow-lg p-7">
        <h3 className="text-xl font-bold text-ink flex items-center gap-2">
          <CalendarCheck className="w-5 h-5" /> {t('Automatic cleanup')}
        </h3>
        <p className="text-ink/80 mt-2">
          {t('Every week, Eflow archives unopened promos and alerts for you, so your inbox stays clean without lifting a finger.')}
        </p>
        <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-ink/70">
          <Lock className="w-4 h-4" /> {t('Included with Pro yearly')}
        </p>
        <button
          onClick={() => openPricing()}
          className="mt-5 w-full py-4 rounded-2xl text-lg font-display font-semibold text-ink bg-mint-200 hover:bg-mint-300 border-2 border-ink/15 shadow-lg"
        >
          {isPro ? t('Switch to yearly') : t('See Pro plans')}
        </button>
      </section>
    );
  }

  const errorText =
    settings?.last_error === 'mailbox_sign_in_failed'
      ? t("The last cleanup couldn't sign in to your mailbox. Reconnect it below with a new app password.")
      : settings?.last_error === 'mailbox_not_connected'
        ? t('Connect your mailbox so automatic cleanup can run.')
        : t("The last cleanup couldn't reach your mail server. We'll try again tomorrow.");

  return (
    <section className="bg-white border-2 border-mint-200 border-t-[10px] border-t-mint-300 rounded-3xl shadow-lg p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-ink flex items-center gap-2">
            <CalendarCheck className="w-5 h-5" /> {t('Automatic cleanup')}
          </h3>
          <p className="text-ink/80 mt-2">
            {t('Eflow moves unopened promos and alerts that are at least 7 days old to your Archive folder, on a schedule.')}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label={t('Automatic cleanup')}
          disabled={loading || saving}
          onClick={() => save(!enabled, frequency)}
          className={`relative flex-shrink-0 w-16 h-9 rounded-full border-2 border-ink/15 transition-colors disabled:opacity-60 ${enabled ? 'bg-mint-400' : 'bg-ink/15'}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-7 h-7 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-7' : ''}`}
          />
        </button>
      </div>

      {enabled && (
        <div className="mt-5">
          <p className="text-sm font-semibold text-ink/70 mb-2">{t('How often')}</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('How often')}>
            {(['weekly', 'biweekly'] as Frequency[]).map((f) => (
              <button
                key={f}
                role="radio"
                aria-checked={frequency === f}
                disabled={saving}
                onClick={() => frequency !== f && save(true, f)}
                className={`py-3 rounded-2xl font-display font-semibold border-2 transition ${
                  frequency === f ? 'bg-mint-200 border-mint-400 text-ink' : 'bg-white border-ink/10 text-ink/70 hover:bg-mint-50'
                }`}
              >
                {f === 'weekly' ? t('Every week') : t('Every 2 weeks')}
              </button>
            ))}
          </div>

          <label className="mt-4 flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 w-5 h-5 accent-mint-600"
              checked={settings?.summary_emails ?? true}
              disabled={saving}
              onChange={(e) => save(true, frequency, e.target.checked)}
            />
            <span className="text-ink/80">
              <span className="font-semibold text-ink inline-flex items-center gap-1.5">
                <Mail className="w-4 h-4" /> {t('Email me a summary')}
              </span>
              <br />
              {t('A short email after each cleanup with how many emails were cleared and from whom.')}
            </span>
          </label>
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 text-mint-800 font-medium">
        <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <span>{t('Receipts, invoices and personal emails are never touched, and nothing is deleted.')}</span>
      </p>

      {(loading || saving) && (
        <p className="mt-4 flex items-center gap-2 text-ink/70">
          <Loader2 className="w-4 h-4 animate-spin" /> {saving ? t('Saving...') : t('Loading...')}
        </p>
      )}

      {!loading && !saving && enabled && (
        <div className="mt-4 rounded-2xl bg-cream border-2 border-ink/10 p-4 space-y-1 text-ink/80">
          {settings?.catching_up ? (
            <p>{t('Working through your older emails now. This can take a few hours for a big inbox.')}</p>
          ) : settings?.next_run_at && new Date(settings.next_run_at).getTime() > Date.now() + 60 * 60 * 1000 ? (
            <p>{t('Next cleanup: {date}', { date: formatDate(settings.next_run_at) })}</p>
          ) : (
            <p>{t('Your first cleanup starts within the next 10 minutes.')}</p>
          )}
          {settings?.last_run_at && settings.last_run_status === 'ok' && (
            <p>
              {t('Last cleanup: {date}', { date: formatDate(settings.last_run_at) })}{' - '}
              {plural(settings.last_run_cleaned, '{n} email archived', '{n} emails archived')}
            </p>
          )}
          {(settings?.total_cleaned ?? 0) > 0 && (
            <p className="font-semibold text-ink">
              {t('{n} emails cleaned automatically so far', { n: formatNumber(settings!.total_cleaned) })}
            </p>
          )}
        </div>
      )}

      {!saving && enabled && settings?.last_run_status === 'failed' && (
        <p className="mt-4 flex items-start gap-2 bg-berry-100 text-berry-800 rounded-2xl p-3 border-2 border-berry-200">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{errorText}</span>
        </p>
      )}

      {error && (
        <p className="mt-4 flex items-start gap-2 bg-berry-100 text-berry-800 rounded-2xl p-3 border-2 border-berry-200">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </p>
      )}
    </section>
  );
}
