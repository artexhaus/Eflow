import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// IMAP app passwords are stored AES-GCM encrypted as "v1:<iv>:<ciphertext>"
// (both base64). The key is derived from the CREDENTIALS_KEY function secret,
// so a leaked database row alone is not enough to log into someone's mailbox.
// Rows written before encryption existed hold plain base64; those are still
// readable and get re-encrypted the next time they are used.
const PREFIX = "v1:";

async function getKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("CREDENTIALS_KEY");
  if (!secret || secret.length < 32) {
    throw new Error(
      "Server misconfigured: CREDENTIALS_KEY secret is missing or shorter than 32 characters."
    );
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function encryptPassword(password: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await getKey(),
    new TextEncoder().encode(password)
  );
  return `${PREFIX}${toB64(iv)}:${toB64(new Uint8Array(ciphertext))}`;
}

async function decryptPassword(stored: string): Promise<string> {
  const [ivB64, ctB64] = stored.slice(PREFIX.length).split(":");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64) },
    await getKey(),
    fromB64(ctB64)
  );
  return new TextDecoder().decode(plaintext);
}

// Returns the plaintext IMAP password for a user, upgrading a legacy base64
// value to the encrypted format in place.
export async function readImapPassword(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  stored: string
): Promise<string> {
  if (stored.startsWith(PREFIX)) {
    return decryptPassword(stored);
  }

  const password = atob(stored);
  try {
    await supabase
      .from("users")
      .update({ encrypted_password: await encryptPassword(password) })
      .eq("id", userId);
  } catch (err) {
    console.error("Failed to upgrade legacy password encoding:", err);
  }
  return password;
}
