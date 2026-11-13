/*
  # Automatic cleanup (Pro yearly)

  Every week (or every 2 weeks, the person's choice) Eflow moves unopened
  junk - promos, repetitive alerts, notices - that is at least 7 days old to
  the mailbox's Archive folder. Receipts and invoices are never touched.

  1. Table `auto_clean_settings`
    - One row per user. Users can read their own row; it is changed only
      through set_auto_clean (below) and by the auto-clean edge function, so
      nobody can point next_run_at at "every 10 minutes" for themselves.

  2. Scheduling
    - pg_cron runs dispatch_auto_clean every 10 minutes. It picks people whose
      cleanup is due and who are on an active yearly plan, claims them (pushes
      next_run_at forward so a slow run is never started twice) and calls the
      auto-clean edge function once per person with pg_net.
    - The call carries a random secret kept in Vault. The edge function checks
      it with verify_auto_clean_secret; the secret never leaves the database.

  3. Functions
    - set_auto_clean(enabled, frequency): for the signed-in user. Turning it
      on requires an active yearly plan; the first cleanup runs within about
      10 minutes.
    - dispatch_auto_clean(), verify_auto_clean_secret(text): service only.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.auto_clean_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  frequency text NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('weekly', 'biweekly')),
  next_run_at timestamptz,
  last_run_at timestamptz,
  -- Emails archived by the most recent cleanup (summed across catch-up runs
  -- when a backlog takes more than one pass).
  last_run_cleaned integer NOT NULL DEFAULT 0,
  last_run_status text CHECK (last_run_status IN ('ok', 'failed')),
  last_error text,
  total_cleaned integer NOT NULL DEFAULT 0,
  -- True while a large backlog is being worked through in several passes.
  catching_up boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_clean_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own auto clean settings" ON public.auto_clean_settings;
CREATE POLICY "Users can view own auto clean settings"
  ON public.auto_clean_settings FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_auto_clean_due
  ON public.auto_clean_settings (next_run_at)
  WHERE enabled;

CREATE OR REPLACE FUNCTION public.auto_clean_interval(p_frequency text)
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN p_frequency = 'biweekly' THEN interval '14 days' ELSE interval '7 days' END;
$$;

CREATE OR REPLACE FUNCTION public.has_yearly_plan(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
     WHERE user_id = p_user_id
       AND plan = 'annual'
       AND subscription_status IN ('active', 'trialing', 'past_due')
  );
$$;

CREATE OR REPLACE FUNCTION public.set_auto_clean(p_enabled boolean, p_frequency text)
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
  IF p_enabled AND NOT public.has_yearly_plan(v_user) THEN
    RAISE EXCEPTION 'Automatic cleanup is included with Pro yearly';
  END IF;

  SELECT * INTO v_old FROM public.auto_clean_settings WHERE user_id = v_user;

  IF NOT p_enabled THEN
    v_next := NULL;
  ELSIF v_old.enabled AND v_old.next_run_at IS NOT NULL THEN
    -- Already on: keep the rhythm, just re-space it for the new frequency.
    v_next := CASE
      WHEN v_old.catching_up THEN v_old.next_run_at
      WHEN v_old.last_run_at IS NOT NULL THEN GREATEST(v_old.last_run_at + public.auto_clean_interval(p_frequency), now())
      ELSE v_old.next_run_at
    END;
  ELSIF v_old.last_run_at IS NOT NULL AND v_old.last_run_at + public.auto_clean_interval(p_frequency) > now() THEN
    -- Switched off and on again soon after a cleanup: don't run again early.
    v_next := v_old.last_run_at + public.auto_clean_interval(p_frequency);
  ELSE
    -- First time on: the first cleanup runs on the next dispatch.
    v_next := now();
  END IF;

  INSERT INTO public.auto_clean_settings (user_id, enabled, frequency, next_run_at, updated_at)
  VALUES (v_user, p_enabled, p_frequency, v_next, now())
  ON CONFLICT (user_id) DO UPDATE
    SET enabled = EXCLUDED.enabled,
        frequency = EXCLUDED.frequency,
        next_run_at = EXCLUDED.next_run_at,
        catching_up = CASE WHEN EXCLUDED.enabled THEN public.auto_clean_settings.catching_up ELSE false END,
        updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- The shared secret between the scheduler and the edge function, generated
-- here so it is never typed, printed or copied anywhere.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'auto_clean_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'auto_clean_secret',
      'Authenticates scheduled calls to the auto-clean edge function'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.verify_auto_clean_secret(p_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(p_secret, '') <> ''
     AND EXISTS (
       SELECT 1 FROM vault.decrypted_secrets
        WHERE name = 'auto_clean_secret' AND decrypted_secret = p_secret
     );
$$;

CREATE OR REPLACE FUNCTION public.dispatch_auto_clean()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret text;
  v_user uuid;
  v_count integer := 0;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'auto_clean_secret';
  IF v_secret IS NULL THEN
    RAISE WARNING 'auto_clean_secret is missing from Vault';
    RETURN 0;
  END IF;

  FOR v_user IN
    UPDATE public.auto_clean_settings s
       SET next_run_at = now() + interval '30 minutes'
     WHERE s.user_id IN (
       SELECT user_id FROM public.auto_clean_settings
        WHERE enabled
          AND next_run_at <= now()
          AND public.has_yearly_plan(user_id)
        ORDER BY next_run_at
        LIMIT 25
        FOR UPDATE SKIP LOCKED
     )
    RETURNING s.user_id
  LOOP
    PERFORM net.http_post(
      url := 'https://xqskistgkihlewsxanib.supabase.co/functions/v1/auto-clean',
      body := jsonb_build_object('user_id', v_user),
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Auto-Clean-Secret', v_secret),
      timeout_milliseconds := 150000
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_auto_clean(boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_auto_clean(boolean, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_yearly_plan(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_auto_clean_secret(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_auto_clean() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_yearly_plan(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_auto_clean_secret(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_auto_clean() TO service_role;

-- Every 10 minutes. Cheap when nobody is due: one indexed query.
SELECT cron.unschedule('eflow-auto-clean')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'eflow-auto-clean');
SELECT cron.schedule('eflow-auto-clean', '*/10 * * * *', 'SELECT public.dispatch_auto_clean()');
