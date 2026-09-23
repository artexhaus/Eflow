import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

// The one-click URL comes from an email header, i.e. from whoever sent the
// email. Only POST to public https hosts so a crafted header can't point this
// function at localhost or an internal address.
function isSafePublicHttpsUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":") || host.startsWith("[")) return false;
  return true;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Unsubscribes the user from one sender, using the List-Unsubscribe header of
// that sender's most recent email:
// - RFC 8058 one-click (https + List-Unsubscribe-Post): done here, server side.
// - Otherwise the https page or mailto address is returned for the app to open,
//   since those need the user to finish the step themselves.
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

    const { sender } = (await req.json()) as { sender?: string };
    if (!sender) throw new Error("sender is required");
    const senderKey = sender.toLowerCase();

    const { data: latest, error } = await supabase
      .from("emails")
      .select("list_unsubscribe, list_unsubscribe_post")
      .eq("user_id", user.id)
      .ilike("sender", escapeLike(sender))
      .not("list_unsubscribe", "is", null)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Failed to look up sender: ${error.message}`);
    if (!latest?.list_unsubscribe) {
      return json({ status: "unavailable", message: "This sender didn't include an unsubscribe option in their emails." });
    }

    const uris = [...latest.list_unsubscribe.matchAll(/<([^>]+)>/g)].map((m) => m[1].trim());
    const httpsUrl = uris.find((u) => u.toLowerCase().startsWith("https://"));
    const mailtoUrl = uris.find((u) => u.toLowerCase().startsWith("mailto:"));

    if (httpsUrl && latest.list_unsubscribe_post && isSafePublicHttpsUrl(httpsUrl)) {
      try {
        const res = await fetch(httpsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "List-Unsubscribe=One-Click",
          redirect: "follow",
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          const unsubscribedAt = new Date().toISOString();
          const { error: saveError } = await supabase.from("sender_actions").upsert(
            { user_id: user.id, sender: senderKey, unsubscribe_status: "unsubscribed", unsubscribed_at: unsubscribedAt },
            { onConflict: "user_id,sender" }
          );
          if (saveError) console.error("Failed to record unsubscribe:", saveError);
          return json({ status: "unsubscribed", unsubscribed_at: unsubscribedAt });
        }
        console.error(`One-click unsubscribe returned ${res.status} for ${senderKey}`);
      } catch (err) {
        console.error("One-click unsubscribe request failed:", err);
      }
    }

    // Fall back to a page or email the user completes themselves.
    const fallback = httpsUrl ?? mailtoUrl;
    if (fallback) {
      return json({ status: "needs_user", url: fallback });
    }

    return json({ status: "unavailable", message: "This sender's unsubscribe option isn't one we can open." });
  } catch (err) {
    console.error("Unsubscribe error:", err);
    return json({ error: (err as Error).message || "Failed to unsubscribe" }, 400);
  }
});
