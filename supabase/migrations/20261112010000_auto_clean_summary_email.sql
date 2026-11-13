/*
  # Automatic cleanup: summary email

  After each automatic cleanup that archived something, Eflow emails the
  account owner a short summary ("Eflow cleaned 84 emails this week") with the
  senders it cleared most. It can be switched off in Account.

  1. New columns on `auto_clean_settings`
    - summary_emails: send the summary (default on).
    - language: 'en' or 'es', the app language when the person last saved
      their settings, so the email arrives in the same language.
    - last_run_senders: [{ "name": ..., "count": ... }] for the run in
      progress, summed across catch-up passes; feeds the email.

  2. set_auto_clean gains two optional arguments (p_language,
     p_summary_emails). NULL keeps the current value, so the app can change
     one setting without resending the others.
*/

ALTER TABLE public.auto_clean_settings
  ADD COLUMN IF NOT EXISTS summary_emails boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es')),
  ADD COLUMN IF NOT EXISTS last_run_senders jsonb NOT NULL DEFAULT '[]'::jsonb;

DROP FUNCTION IF EXISTS public.set_auto_clean(boolean, text);

CREATE OR REPLACE FUNCTION public.set_auto_clean(
  p_enabled boolean,
  p_frequency text,
  p_language text DEFAULT NULL,
  p_summary_emails boolean DEFAULT NULL
)
RETURNS public.auto_clean_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_old public.auto_clean_settings;
  v_row public.auto_clean_settings;
  v_next timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_frequency NOT IN ('weekly', 'biweekly') THEN
    RAISE EXCEPTION 'Frequency must be weekly or biweekly';
  END IF;
  IF p_language IS NOT NULL AND p_language NOT IN ('en', 'es') THEN
    RAISE EXCEPTION 'Language must be en or es';
  END IF;
  IF p_enabled AND NOT public.has_yearly_plan(v_user) THEN
    RAISE EXCEPTION 'Automatic cleanup is included with Pro yearly';
  END IF;

  SELECT * INTO v_old FROM public.auto_clean_settings WHERE user_id = v_user;

  IF NOT p_enabled THEN
    v_next := NULL;
  ELSIF v_old.enabled AND v_old.next_run_at IS NOT NULL THEN
    v_next := CASE
      WHEN v_old.catching_up THEN v_old.next_run_at
      WHEN v_old.last_run_at IS NOT NULL THEN GREATEST(v_old.last_run_at + public.auto_clean_interval(p_frequency), now())
      ELSE v_old.next_run_at
    END;
  ELSIF v_old.last_run_at IS NOT NULL AND v_old.last_run_at + public.auto_clean_interval(p_frequency) > now() THEN
    v_next := v_old.last_run_at + public.auto_clean_interval(p_frequency);
  ELSE
    v_next := now();
  END IF;

  INSERT INTO public.auto_clean_settings (user_id, enabled, frequency, next_run_at, language, summary_emails, updated_at)
  VALUES (v_user, p_enabled, p_frequency, v_next, coalesce(p_language, 'en'), coalesce(p_summary_emails, true), now())
  ON CONFLICT (user_id) DO UPDATE
    SET enabled = EXCLUDED.enabled,
        frequency = EXCLUDED.frequency,
        next_run_at = EXCLUDED.next_run_at,
        language = coalesce(p_language, public.auto_clean_settings.language),
        summary_emails = coalesce(p_summary_emails, public.auto_clean_settings.summary_emails),
        catching_up = CASE WHEN EXCLUDED.enabled THEN public.auto_clean_settings.catching_up ELSE false END,
        updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_auto_clean(boolean, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_auto_clean(boolean, text, text, boolean) TO authenticated;
