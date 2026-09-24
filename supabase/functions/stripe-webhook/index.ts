import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.7.0";
import { getServiceClient, getStripe } from "../_shared/billing.ts";

// Stripe calls this directly, so it has no Supabase JWT (verify_jwt = false in
// config.toml). Every request is authenticated by its Stripe signature instead.
//
// Events can arrive late, twice, or out of order. Rather than trusting each
// event's payload, the handler re-fetches the subscription from Stripe and
// writes its current state, which makes every event idempotent and ordering
// irrelevant.

const stripe = getStripe();
const cryptoProvider = Stripe.createSubtleCryptoProvider();

function planFromSubscription(sub: Stripe.Subscription): "monthly" | "annual" | null {
  const interval = sub.items.data[0]?.price?.recurring?.interval;
  if (interval === "year") return "annual";
  if (interval === "month") return "monthly";
  return null;
}

// current_period_end moved from the subscription to its items in newer
// Stripe API versions; read whichever is present.
function periodEnd(sub: Stripe.Subscription): string | null {
  const seconds =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    (sub.items.data[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end;
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

async function findUserId(sub: Stripe.Subscription, hint: string | null): Promise<string | null> {
  if (hint) return hint;
  if (sub.metadata?.supabase_user_id) return sub.metadata.supabase_user_id;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const { data } = await getServiceClient()
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}

async function syncSubscription(subscriptionId: string, userIdHint: string | null) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = await findUserId(sub, userIdHint);
  if (!userId) {
    // Nothing we can attach this to; don't make Stripe retry forever.
    console.error(`No Eflow user for subscription ${sub.id}`);
    return;
  }

  const { error } = await getServiceClient()
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        stripe_subscription_id: sub.id,
        subscription_status: sub.status,
        plan: planFromSubscription(sub),
        current_period_end: periodEnd(sub),
        cancel_at_period_end: sub.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  if (error) throw new Error(`Failed to save subscription: ${error.message}`);
}

Deno.serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signature || !secret) {
    return new Response("Missing signature or webhook secret", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    // The signature covers the exact raw body, so read it as text, unparsed.
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, signature, secret, undefined, cryptoProvider);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          await syncSubscription(subscriptionId, session.client_reference_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(sub.id, null);
        break;
      }
      default:
        // Other events are acknowledged and ignored.
        break;
    }
  } catch (err) {
    // A 500 makes Stripe retry later, e.g. after a transient database error.
    console.error(`Failed to handle ${event.type}:`, err);
    return new Response("Webhook handler failed", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
