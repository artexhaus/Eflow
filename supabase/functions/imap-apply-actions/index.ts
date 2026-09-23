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

    const { action, emailIds, provider, category } = await req.json();

    if (!action || !provider || !imapHosts[provider]) {
      throw new Error("Action and valid provider are required");
    }

    // If category is provided, fetch all email UIDs for that category from the database
    let idsToDelete: string[] = [];
    if (category && !emailIds) {
      const { data: categoryEmails } = await supabase
        .from("emails")
        .select("email_id")
        .eq("user_id", user.id)
        .in("category", Array.isArray(category) ? category : [category]);

      idsToDelete = (categoryEmails || []).map((e) => e.email_id);
    } else if (emailIds && Array.isArray(emailIds)) {
      idsToDelete = emailIds;
    }

    if (idsToDelete.length === 0) {
      return new Response(
        JSON.stringify({ success: true, action, processed: 0, message: "No emails to process" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: userData } = await supabase
      .from("users")
      .select("connected_account_id, encrypted_password")
      .eq("id", user.id)
      .maybeSingle();

    if (!userData?.connected_account_id || !userData?.encrypted_password) {
      throw new Error("No IMAP credentials found. Please connect your email account first.");
    }

    const { host, port } = imapHosts[provider];
    const password = atob(userData.encrypted_password);

    const client = new ImapFlow({
      host,
      port,
      secure: true,
      auth: { user: userData.connected_account_id, pass: password },
      logger: false,
      emitLogs: false,
    });

    await client.connect();

    const lock = await client.getMailboxLock("INBOX");
    let processed = 0;
    let failed = 0;

    try {
      // Process in chunks of 100 to handle large batches
      const CHUNK = 100;
      for (let i = 0; i < idsToDelete.length; i += CHUNK) {
        const chunk = idsToDelete.slice(i, i + CHUNK);

        if (action === "delete") {
          const uids = chunk.map((id) => parseInt(id, 10)).filter((u) => !isNaN(u));
          if (uids.length > 0) {
            try {
              await client.messageDelete(uids, { uid: true });
              processed += uids.length;
            } catch (err) {
              console.error("Batch delete error:", err);
              failed += uids.length;
            }
          }
        } else if (action === "archive") {
          for (const emailId of chunk) {
            const uid = parseInt(emailId, 10);
            if (isNaN(uid)) continue;
            try {
              await client.messageMove(uid, "Archive", { uid: true });
              processed++;
            } catch {
              try {
                await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
                processed++;
              } catch {
                failed++;
              }
            }
          }
        } else if (action === "mark_read") {
          const uids = chunk.map((id) => parseInt(id, 10)).filter((u) => !isNaN(u));
          if (uids.length > 0) {
            try {
              await client.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
              processed += uids.length;
            } catch (err) {
              console.error("Batch mark read error:", err);
              failed += uids.length;
            }
          }
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();

    // Update database to reflect actions
    if (action === "delete") {
      if (category) {
        await supabase
          .from("emails")
          .update({ is_deleted: true })
          .eq("user_id", user.id)
          .in("category", Array.isArray(category) ? category : [category]);
      } else if (emailIds) {
        const emailIdStrings = emailIds.map(String);
        await supabase
          .from("emails")
          .update({ is_deleted: true })
          .eq("user_id", user.id)
          .in("email_id", emailIdStrings);
      }
    } else if (action === "archive") {
      if (category) {
        await supabase
          .from("emails")
          .update({ is_archived: true })
          .eq("user_id", user.id)
          .in("category", Array.isArray(category) ? category : [category]);
      } else if (emailIds) {
        const emailIdStrings = emailIds.map(String);
        await supabase
          .from("emails")
          .update({ is_archived: true })
          .eq("user_id", user.id)
          .in("email_id", emailIdStrings);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        action,
        processed,
        failed,
        total: idsToDelete.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("IMAP apply actions error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Failed to apply actions" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
