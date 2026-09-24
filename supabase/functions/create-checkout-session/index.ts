import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getAppUrl, getServiceClient, getStripe, isProStatus } from "../_shared/billing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// The client only says which plan it wants; the price is always resolved
// here from server-side config, never taken from the request.
const PRICE_ENV_FOR_PLAN: Record<string, string> = {
  monthly: "STRIPE_PRICE_MONTHLY",
  annual: "STRIPE_PRICE_ANNUAL",
};

// Starts a Stripe Checkout session for the Pro plan (monthly or annual) and
// returns its URL. The Stripe customer is created once per user and reused.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) throw new Error("Invalid user");

    const { plan } = (await req.json()) as { plan?: string };
    const priceEnv = plan ? PRICE_ENV_FOR_PLAN[plan] : undefined;
    if (!priceEnv) return json({ error: "Choose the monthly or annual plan." }, 400);
    const priceId = Deno.env.get(priceEnv);
    if (!priceId) throw new Error(`Server misconfigured: ${priceEnv} is not set.`);

    const service = getServiceClient();
    const stripe = getStripe();

    const { data: existing, error: readError } = await service
      .from("subscriptions")
      .select("stripe_customer_id, subscription_status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (readError) throw new Error(`Failed to read subscription: ${readError.message}`);

    // Avoid double-billing: an existing subscriber switches plans or cancels
    // in the Customer Portal instead.
    if (isProStatus(existing?.subscription_status)) {
      return json({ error: "You already have Pro. Use Manage Subscription to change or cancel your plan.", code: "already_subscribed" }, 409);
    }

    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      const { error: saveError } = await service
        .from("subscriptions")
        .upsert({ user_id: user.id, stripe_customer_id: customerId, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (saveError) throw new Error(`Failed to save customer: ${saveError.message}`);
    }

    const appUrl = getAppUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { supabase_user_id: user.id } },
      allow_promotion_codes: true,
      success_url: `${appUrl}/?checkout=success`,
      cancel_url: `${appUrl}/?checkout=cancelled`,
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return json({ url: session.url });
  } catch (err) {
    console.error("Create checkout session error:", err);
    return json({ error: (err as Error).message || "Could not start checkout." }, 400);
  }
});
