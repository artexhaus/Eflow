import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { ImapFlow } from "npm:imapflow";
import { encryptPassword } from "../_shared/credentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Wording for login errors, so each provider's users get their own instructions.
const providerHelp: Record<string, { name: string; passwordPage: string; tip: string }> = {
  gmail: {
    name: "Gmail",
    passwordPage: "Google Account > Security > App passwords",
    tip: "IMAP must also be on: Gmail Settings > See all settings > Forwarding and POP/IMAP > Enable IMAP.",
  },
  yahoo: {
    name: "Yahoo",
    passwordPage: "Yahoo Account Security > Generate app password",
    tip: "Two-step verification must be turned on before Yahoo lets you create an app password.",
  },
  outlook: {
    name: "Outlook",
    passwordPage: "Microsoft account > Security > Advanced security options > App passwords",
    tip: "Two-step verification must be on. Some Outlook.com accounts no longer allow app passwords for mail apps.",
  },
  icloud: {
    name: "iCloud",
    passwordPage: "account.apple.com > Sign-In and Security > App-Specific Passwords",
    tip: "Use your full @icloud.com (or @me.com) address, not a Gmail or other address linked to your Apple Account.",
  },
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
    const help = providerHelp[provider];
    const providerName = help.name;

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
        friendlyError = `${providerName} didn't accept that login. Please check: (1) your full ${providerName} email address, (2) you're using an app password (${help.passwordPage}), not your regular password, (3) it was copied without typos. ${help.tip}`;
      } else if (errMsg.includes("connect") || errMsg.includes("timeout") || errMsg.includes("ETIMEDOUT") || errMsg.includes("ECONNREFUSED")) {
        friendlyError = `Could not reach ${providerName}'s mail server. Please try again.`;
      } else if (errMsg.includes("Command failed")) {
        friendlyError = `${providerName} rejected the login. Please make sure you created an app password (${help.passwordPage}) and pasted it here instead of your regular ${providerName} password. ${help.tip}`;
      } else {
        friendlyError = `Connection failed: ${errMsg}`;
      }

      throw new Error(friendlyError);
    }

    const encryptedPassword = await encryptPassword(password);

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
