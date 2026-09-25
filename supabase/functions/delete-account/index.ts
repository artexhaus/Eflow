import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getServiceClient, getStripe, isProStatus } from "../_shared/billing.ts";

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

// Permanently deletes the caller's Eflow account:
//   1. cancels an active Stripe subscription immediately (no further charges),
//   2. deletes the users row - the stored (encrypted) mail password - which
//      cascades to their emails, bundles and unsubscribe history,
//   3. deletes the login, which cascades to subscription and usage rows.
// Nothing in the person's actual mailbox is touched.
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

    const { confirm } = (await req.json().catch(() => ({}))) as { confirm?: string };
    if (confirm !== "DELETE") {
      return json({ error: "Type DELETE to confirm." }, 400);
    }

    const service = getServiceClient();

    const { data: sub } = await service
      .from("subscriptions")
      .select("stripe_subscription_id, subscription_status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (sub?.stripe_subscription_id && isProStatus(sub.subscription_status)) {
      await getStripe().subscriptions.cancel(sub.stripe_subscription_id);
    }

    const { error: rowError } = await service.from("users").delete().eq("id", user.id);
    if (rowError) throw new Error(`Failed to delete account data: ${rowError.message}`);

    const { error: authError } = await service.auth.admin.deleteUser(user.id);
    if (authError) throw new Error(`Failed to delete login: ${authError.message}`);

    return json({ success: true });
  } catch (err) {
    console.error("Delete account error:", err);
    return json({ error: (err as Error).message || "Could not delete the account." }, 400);
  }
});
