import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// Free tier: emails cleaned (archived or deleted) per calendar month, UTC.
// The app shows the same number (src/lib/billing.ts) - keep them in sync.
export const FREE_MONTHLY_LIMIT = 500;

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

export function getAppUrl(): string {
  const url = Deno.env.get("APP_URL");
  if (!url) throw new Error("Server misconfigured: APP_URL is not set.");
  return url.replace(/\/$/, "");
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
