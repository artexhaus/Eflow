import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// Free tier: emails cleaned (archived or deleted) per calendar month, UTC.
// The app shows the same number (src/lib/billing.ts) - keep them in sync.
export const FREE_MONTHLY_LIMIT = 500;

// Free tier: senders a user may unsubscribe from per calendar month (UTC).
// The app shows the same number (src/lib/billing.ts) - keep them in sync.
export const FREE_UNSUBSCRIBE_LIMIT = 10;

export function currentPeriodStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// Statuses that unlock Pro. past_due keeps access while Stripe retries the
// card; Stripe moves the subscription to unpaid/canceled if retries fail.
const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);

export function isProStatus(status: string | null | undefined): boolean {
  return PRO_STATUSES.has(status ?? "");
}

export function getStripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Server misconfigured: STRIPE_SECRET_KEY is not set.");
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

// Where Stripe sends people back after checkout / the portal. APP_URL wins
// when set (production); otherwise the site the request came from, so local
// development works with no extra setup.
export function getAppUrl(req: Request): string {
  const configured = Deno.env.get("APP_URL");
  if (configured) return configured.replace(/\/$/, "");
  const origin = req.headers.get("Origin");
  if (origin && /^https?:\/\/[^/]+$/.test(origin)) return origin;
  throw new Error("Server misconfigured: set the APP_URL secret to your site's address.");
}

export type Plan = "monthly" | "annual";

// Prices are found by these Stripe lookup keys (created by
// scripts/setup-stripe.sh), so no price IDs need copying into secrets.
// STRIPE_PRICE_MONTHLY / STRIPE_PRICE_ANNUAL still override them if set.
const PLAN_LOOKUP_KEYS: Record<Plan, string> = {
  monthly: "eflow_pro_monthly",
  annual: "eflow_pro_annual",
};
const PLAN_PRICE_ENV: Record<Plan, string> = {
  monthly: "STRIPE_PRICE_MONTHLY",
  annual: "STRIPE_PRICE_ANNUAL",
};

export function isPlan(value: unknown): value is Plan {
  return value === "monthly" || value === "annual";
}

export async function resolvePriceId(stripe: Stripe, plan: Plan): Promise<string> {
  const override = Deno.env.get(PLAN_PRICE_ENV[plan]);
  if (override) return override;
  const { data } = await stripe.prices.list({ lookup_keys: [PLAN_LOOKUP_KEYS[plan]], active: true, limit: 1 });
  if (!data[0]) {
    throw new Error("The Pro plan isn't set up in Stripe yet. Run scripts/setup-stripe.sh.");
  }
  return data[0].id;
}

// Service-role client: bypasses RLS. Only used for billing tables, which users
// can read but never write.
export function getServiceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

export async function getSubscriptionStatus(userId: string): Promise<string> {
  const { data, error } = await getServiceClient()
    .from("subscriptions")
    .select("subscription_status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read subscription: ${error.message}`);
  return data?.subscription_status ?? "free";
}

// Atomically reserves `count` cleans from this month's free quota. Returns
// whether it fit, and how many were used (after reserving, if allowed).
export async function reserveCleanQuota(userId: string, count: number) {
  const { data, error } = await getServiceClient().rpc("reserve_clean_quota", {
    p_user_id: userId,
    p_count: count,
    p_limit: FREE_MONTHLY_LIMIT,
  });
  if (error) throw new Error(`Failed to check usage: ${error.message}`);
  const row = (data as { allowed: boolean; used: number | null }[])[0];
  return { allowed: row?.allowed ?? false, used: row?.used ?? 0 };
}

export async function addCleanUsage(userId: string, delta: number) {
  if (delta === 0) return;
  const { error } = await getServiceClient().rpc("add_clean_usage", { p_user_id: userId, p_delta: delta });
  if (error) console.error("Failed to record usage:", error);
}
