import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getAppUrl, getServiceClient, getStripe } from "../_shared/billing.ts";

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

// Opens the Stripe Customer Portal, where the user can update their card,
// switch between monthly and annual, see invoices, or cancel.
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

    const { data, error } = await getServiceClient()
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new Error(`Failed to read subscription: ${error.message}`);
    if (!data?.stripe_customer_id) {
      return json({ error: "You don't have a subscription to manage yet.", code: "no_customer" }, 404);
    }

    // STRIPE_PORTAL_CONFIGURATION (set by scripts/setup-stripe.sh) picks the
    // portal settings: card updates, monthly/yearly switching, cancelling.
    const configuration = Deno.env.get("STRIPE_PORTAL_CONFIGURATION") || undefined;
    const session = await getStripe().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${getAppUrl(req)}/?portal=return`,
      configuration,
    });
    return json({ url: session.url });
  } catch (err) {
    console.error("Create portal session error:", err);
    return json({ error: (err as Error).message || "Could not open subscription settings." }, 400);
  }
});
