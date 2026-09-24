import { supabase } from './supabase';

// Must match FREE_MONTHLY_LIMIT in supabase/functions/_shared/billing.ts. The
// server enforces the limit; this copy is only for display.
export const FREE_MONTHLY_LIMIT = 500;

export type Plan = 'monthly' | 'annual';

// Display prices. The amount actually charged comes from the Stripe prices
// configured in STRIPE_PRICE_MONTHLY / STRIPE_PRICE_ANNUAL - keep in sync.
export const PRICES: Record<Plan, { amount: string; per: string }> = {
  monthly: { amount: '$6.99', per: 'month' },
  annual: { amount: '$49.99', per: 'year' },
};

// Statuses that unlock Pro (mirrors isProStatus on the server).
const PRO_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function isProStatus(status: string | null | undefined): boolean {
  return PRO_STATUSES.has(status ?? '');
}

// Usage resets on the 1st of each month, UTC - same as the database.
export function currentPeriodStart(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function nextResetDate(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export class BillingError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

async function callBillingFunction(name: string, body: unknown): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new BillingError('Your session expired. Please sign in again.');

  let response: Response;
  try {
    response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    // The request never got an answer: offline, or the function isn't
    // deployed (Supabase's "not found" reply is blocked by the browser).
    console.error(`Could not reach the ${name} edge function. Is it deployed? See scripts/setup-stripe.sh.`);
    throw new BillingError("We couldn't reach the billing service just now. Please check your connection and try again.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.url) {
    throw new BillingError(result.error || 'Something went wrong. Please try again.', result.code);
  }
  return result.url;
}

// Sends the user to Stripe Checkout; they come back to /?checkout=success.
export async function startCheckout(plan: Plan): Promise<void> {
  window.location.assign(await callBillingFunction('create-checkout-session', { plan }));
}

// Sends the user to the Stripe Customer Portal (card, plan switch, cancel).
export async function openBillingPortal(): Promise<void> {
  window.location.assign(await callBillingFunction('create-portal-session', {}));
}
