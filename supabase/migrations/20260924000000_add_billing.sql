/*
  # Billing: Stripe subscriptions and monthly cleaning quota

  1. New table `subscriptions`
    - One row per user, written only by edge functions using the service role
      (create-checkout-session stores the Stripe customer; stripe-webhook keeps
      status/plan in sync with Stripe).
    - `subscription_status` mirrors Stripe's subscription status ('active',
      'trialing', 'past_due', 'canceled', ...) or 'free' when the user never
      subscribed.
    - Deliberately NOT columns on `users`: users may update their own `users`
      row, which would let anyone mark themselves as paid.

  2. New table `usage_monthly`
    - Emails cleaned (archived or deleted) per user per calendar month (UTC).
    - Written only through the functions below, from imap-apply-actions.

  3. Functions (service role only)
    - reserve_clean_quota: atomically adds to this month's count only if the
      result stays within the limit, so concurrent clean-ups can't overshoot.
    - add_clean_usage: adjusts this month's count (negative to refund the part
      of a reservation the mail server didn't process; positive to record Pro
      usage, which is unlimited but still tracked).

  4. Security
    - RLS: users can read their own rows; there are no insert/update/delete
      policies, so only the service role can write.
*/

CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  subscription_status text NOT NULL DEFAULT 'free',
  plan text CHECK (plan IN ('monthly', 'annual')),
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.usage_monthly (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  emails_cleaned integer NOT NULL DEFAULT 0 CHECK (emails_cleaned >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period_start)
);

ALTER TABLE public.usage_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
  ON public.usage_monthly FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.current_usage_period()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT date_trunc('month', now() AT TIME ZONE 'utc')::date;
$$;

CREATE OR REPLACE FUNCTION public.reserve_clean_quota(p_user_id uuid, p_count integer, p_limit integer)
RETURNS TABLE (allowed boolean, used integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period date := public.current_usage_period();
  v_used integer;
BEGIN
  INSERT INTO usage_monthly (user_id, period_start)
  VALUES (p_user_id, v_period)
  ON CONFLICT (user_id, period_start) DO NOTHING;

  UPDATE usage_monthly
     SET emails_cleaned = emails_cleaned + p_count,
         updated_at = now()
   WHERE user_id = p_user_id
     AND period_start = v_period
     AND emails_cleaned + p_count <= p_limit
  RETURNING emails_cleaned INTO v_used;

  IF FOUND THEN
    RETURN QUERY SELECT true, v_used;
    RETURN;
  END IF;

  SELECT emails_cleaned INTO v_used
    FROM usage_monthly
   WHERE user_id = p_user_id AND period_start = v_period;
  RETURN QUERY SELECT false, v_used;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_clean_usage(p_user_id uuid, p_delta integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period date := public.current_usage_period();
  v_used integer;
BEGIN
  INSERT INTO usage_monthly (user_id, period_start, emails_cleaned)
  VALUES (p_user_id, v_period, GREATEST(p_delta, 0))
  ON CONFLICT (user_id, period_start) DO UPDATE
    SET emails_cleaned = GREATEST(usage_monthly.emails_cleaned + p_delta, 0),
        updated_at = now()
  RETURNING emails_cleaned INTO v_used;
  RETURN v_used;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_clean_quota(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_clean_usage(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_clean_quota(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_clean_usage(uuid, integer) TO service_role;
