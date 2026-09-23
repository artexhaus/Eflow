import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ImapFlow } from "npm:imapflow";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const imapHosts: Record<string, { host: string; port: number }> = {
  gmail: { host: "imap.gmail.com", port: 993 },
  outlook: { host: "outlook.office365.com", port: 993 },
  yahoo: { host: "imap.mail.yahoo.com", port: 993 },
  icloud: { host: "imap.mail.me.com", port: 993 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) throw new Error("Invalid user");

    const { email, password: rawPassword, provider } = await req.json();

    if (!email || !rawPassword) {
      throw new Error("Email and password are required");
    }

    // Strip spaces from app passwords (Yahoo/Gmail generate them with spaces for readability,
    // but IMAP auth requires the password without spaces)
    const password = rawPassword.replace(/\s+/g, "");

    if (!provider || !imapHosts[provider]) {
      throw new Error(`Unsupported provider: ${provider}. Supported: ${Object.keys(imapHosts).join(", ")}`);
    }

    const { host, port } = imapHosts[provider];
    const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);

    const client = new ImapFlow({
      host,
      port,
      secure: true,
      auth: { user: email, pass: password },
      logger: false,
      emitLogs: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      lock.release();
      await client.logout();
    } catch (imapError) {
      const errMsg = (imapError as Error).message || "Unknown error";
      console.error("IMAP raw error:", errMsg, "Code:", (imapError as any).code);

      let friendlyError: string;
      if (errMsg.includes("Authentication") || errMsg.toLowerCase().includes("auth") || errMsg.toLowerCase().includes("password") || errMsg.toLowerCase().includes("credentials") || errMsg.includes("INVALID")) {
        friendlyError = `Authentication failed. Please double-check: (1) your full Yahoo email address, (2) you are using the app password (not your regular password), (3) the app password was copied correctly without typos.`;
      } else if (errMsg.includes("connect") || errMsg.includes("timeout") || errMsg.includes("ETIMEDOUT") || errMsg.includes("ECONNREFUSED")) {
        friendlyError = `Could not reach ${providerName}'s mail server. Please try again.`;
      } else if (errMsg.includes("Command failed")) {
        friendlyError = `Yahoo rejected the login. Please verify: (1) 2-step verification is ON in Yahoo Account Security, (2) you generated an app password, (3) you are pasting that app password — not your regular Yahoo password. The app password should be 16 characters with no spaces.`;
      } else {
        friendlyError = `Connection failed: ${errMsg}`;
      }

      throw new Error(friendlyError);
    }

    const encryptedPassword = btoa(password);

    const { error: upsertError } = await supabase
      .from("users")
      .upsert({
        id: user.id,
        email: user.email || email,
        email_provider: provider,
        connected_account_id: email,
        encrypted_password: encryptedPassword,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (upsertError) {
      throw new Error(`Failed to save credentials: ${upsertError.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: "IMAP connection successful" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("IMAP connection error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Failed to connect to IMAP server" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
