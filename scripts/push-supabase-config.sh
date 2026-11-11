#!/usr/bin/env bash
# Pushes supabase/config.toml (auth settings, email templates, Google/Apple
# sign-in) to the live Supabase project.
#
#   ./scripts/push-supabase-config.sh
#
# Always use this instead of a bare `supabase config push`. The Google/Apple
# IDs and secrets live in supabase/.env (never committed); a push without them
# sends placeholder text to Supabase and breaks those sign-in buttons. This
# script loads them, refuses to run if a switched-on provider is missing its
# values, renews the Apple secret when it's within 30 days of expiring, then
# shows the changes and asks before applying them.
#
# Needs: the supabase CLI (logged in and linked) and node.

set -euo pipefail

cd "$(dirname "$0")/.."

die() { echo "Error: $*" >&2; exit 1; }

# Use an installed supabase CLI, or the project's copy through npx.
SUPABASE=supabase
command -v supabase >/dev/null || SUPABASE="npx supabase"

PROJECT_REF="$(cat supabase/.temp/project-ref 2>/dev/null || true)"
[ -n "$PROJECT_REF" ] || die "this folder isn't linked to a Supabase project. Run: supabase link"

ENV_FILE=supabase/.env
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

# enabled <provider>: prints the "enabled" value of [auth.external.<provider>].
enabled() {
  awk -v section="[auth.external.$1]" '
    $0 == section { inside = 1; next }
    /^\[/ { inside = 0 }
    inside && $1 == "enabled" { print $3 }
  ' supabase/config.toml
}

# set_env KEY VALUE: writes KEY='VALUE' to supabase/.env, replacing any old value.
set_env() {
  touch "$ENV_FILE"
  (umask 077; grep -v "^$1=" "$ENV_FILE" > "$ENV_FILE.tmp" || true)
  printf "%s='%s'\n" "$1" "$2" >> "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
  chmod 600 "$ENV_FILE" # readable only by you
}

if [ "$(enabled google)" = "true" ]; then
  [ -n "${SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID:-}" ] && [ -n "${SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET:-}" ] \
    || die "Google sign-in is switched on but its client ID/secret aren't in $ENV_FILE. Run: ./scripts/setup-social-login.sh google"
fi

if [ "$(enabled apple)" = "true" ]; then
  for name in APPLE_TEAM_ID APPLE_KEY_ID APPLE_KEY_PATH SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID; do
    [ -n "${!name:-}" ] || die "Apple sign-in is switched on but $name isn't in $ENV_FILE. Run: ./scripts/setup-social-login.sh apple"
  done
  now=$(date +%s)
  if [ -z "${SUPABASE_AUTH_EXTERNAL_APPLE_SECRET:-}" ] || [ "${APPLE_SECRET_EXPIRES:-0}" -lt $((now + 30 * 86400)) ]; then
    [ -f "$APPLE_KEY_PATH" ] || die "the Apple secret needs renewing, but the key file $APPLE_KEY_PATH isn't there."
    echo "Renewing the Apple sign-in secret (valid for 180 days)..."
    SUPABASE_AUTH_EXTERNAL_APPLE_SECRET="$(node scripts/apple-client-secret.mjs "$APPLE_TEAM_ID" "$APPLE_KEY_ID" "$SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID" "$APPLE_KEY_PATH")"
    APPLE_SECRET_EXPIRES=$((now + 180 * 86400))
    set_env SUPABASE_AUTH_EXTERNAL_APPLE_SECRET "$SUPABASE_AUTH_EXTERNAL_APPLE_SECRET"
    set_env APPLE_SECRET_EXPIRES "$APPLE_SECRET_EXPIRES"
    export SUPABASE_AUTH_EXTERNAL_APPLE_SECRET
  fi
  expires_on=$(date -r "$APPLE_SECRET_EXPIRES" +%Y-%m-%d 2>/dev/null || date -d "@$APPLE_SECRET_EXPIRES" +%Y-%m-%d)
  echo "Apple sign-in secret is valid until $expires_on. Run this script again before then to renew it."
fi

# Shows the differences, then asks "Do you want to push ...? [Y/n]".
$SUPABASE config push --project-ref "$PROJECT_REF"
