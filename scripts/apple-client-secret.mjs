// Builds the client secret Supabase needs for Sign in with Apple: a JWT signed
// with your Apple key (.p8). Apple caps its lifetime at about six months, so
// scripts/push-supabase-config.sh makes a fresh one when it's close to expiry.
//
//   node scripts/apple-client-secret.mjs <team-id> <key-id> <services-id> <path-to-AuthKey.p8>
//
// Prints the secret (and nothing else) to stdout.

import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [teamId, keyId, servicesId, keyPath] = process.argv.slice(2);
if (!teamId || !keyId || !servicesId || !keyPath) {
  console.error('Usage: node scripts/apple-client-secret.mjs <team-id> <key-id> <services-id> <path-to-AuthKey.p8>');
  process.exit(1);
}

// 180 days: inside Apple's 6-month maximum.
const LIFETIME_SECONDS = 180 * 24 * 60 * 60;

const now = Math.floor(Date.now() / 1000);
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const unsigned = `${encode({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${encode({
  iss: teamId,
  iat: now,
  exp: now + LIFETIME_SECONDS,
  aud: 'https://appleid.apple.com',
  sub: servicesId,
})}`;
const signature = sign('sha256', Buffer.from(unsigned), {
  key: createPrivateKey(readFileSync(keyPath)),
  dsaEncoding: 'ieee-p1363', // JWT ES256 wants raw r||s, not DER
});
process.stdout.write(`${unsigned}.${signature.toString('base64url')}`);
