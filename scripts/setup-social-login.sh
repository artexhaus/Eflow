#!/usr/bin/env bash
# Switches on "Continue with Google" or "Continue with Apple".
#
#   ./scripts/setup-social-login.sh google
#   ./scripts/setup-social-login.sh apple
#
# Do the console steps in SOCIAL_LOGIN_SETUP.md first. This script asks for the
# IDs it needs (secrets are typed hidden), keeps them in supabase/.env on this
# computer only (never committed), switches the provider on in
# supabase/config.toml, then pushes to Supabase through
# scripts/push-supabase-config.sh, which shows the changes and asks first.
#
# The sign-in screen shows each button by itself once its provider is on.
# Commit the config.toml change afterwards so the setting is kept.
#
# Needs: the supabase CLI (logged in and linked) and node.

set -euo pipefail

cd "$(dirname "$0")/.."

die() { echo "Error: $*" >&2; exit 1; }

PROVIDER="${1:-}"
[ "$PROVIDER" = "google" ] || [ "$PROVIDER" = "apple" ] || die "say which one: ./scripts/setup-social-login.sh google   (or apple)"

ENV_FILE=supabase/.env

# set_env KEY VALUE: writes KEY='VALUE' to supabase/.env, replacing any old value.
set_env() {
  case "$2" in *"'"*) die "$1 can't contain a single quote." ;; esac
  touch "$ENV_FILE"
  (umask 077; grep -v "^$1=" "$ENV_FILE" > "$ENV_FILE.tmp" || true)
  printf "%s='%s'\n" "$1" "$2" >> "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
  chmod 600 "$ENV_FILE" # readable only by you
}

ask() { # ask VAR "prompt": visible input
  local value
  printf '%s: ' "$2"
  read -r value
  [ -n "$value" ] || die "nothing entered."
  printf -v "$1" '%s' "$value"
}

ask_hidden() { # ask_hidden VAR "prompt": input not shown
  local value
  printf '%s (input hidden): ' "$2"
  read -rs value
  echo
  [ -n "$value" ] || die "nothing entered."
  printf -v "$1" '%s' "$value"
}

if [ "$PROVIDER" = "google" ]; then
  ask GOOGLE_CLIENT_ID "Google OAuth client ID (ends in .apps.googleusercontent.com)"
  case "$GOOGLE_CLIENT_ID" in *.apps.googleusercontent.com) ;; *) die "that doesn't look like a Google client ID." ;; esac
  ask_hidden GOOGLE_SECRET "Google OAuth client secret"
  set_env SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID"
  set_env SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET "$GOOGLE_SECRET"
else
  ask APPLE_TEAM_ID "Apple Team ID (10 characters, top right of developer.apple.com/account)"
  ask APPLE_SERVICES_ID "Apple Services ID (for example org.eflowapp.signin)"
  ask APPLE_KEY_ID "Apple Key ID (10 characters, from the key you created)"
  ask APPLE_KEY_PATH "Full path to the AuthKey_XXXXXXXXXX.p8 file you downloaded"
  APPLE_KEY_PATH="${APPLE_KEY_PATH/#\~/$HOME}"
  [ -f "$APPLE_KEY_PATH" ] || die "no file at $APPLE_KEY_PATH"
  # Check the key works now rather than at push time.
  node scripts/apple-client-secret.mjs "$APPLE_TEAM_ID" "$APPLE_KEY_ID" "$APPLE_SERVICES_ID" "$APPLE_KEY_PATH" > /dev/null \
    || die "couldn't sign with that key file. Is it the .p8 key from Apple?"
  set_env APPLE_TEAM_ID "$APPLE_TEAM_ID"
  set_env APPLE_KEY_ID "$APPLE_KEY_ID"
  set_env APPLE_KEY_PATH "$APPLE_KEY_PATH"
  set_env SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID "$APPLE_SERVICES_ID"
  # Forces push-supabase-config.sh to make a fresh secret from the new key.
  set_env APPLE_SECRET_EXPIRES 0
fi

# Switch the provider on in config.toml.
awk -v section="[auth.external.$PROVIDER]" '
  $0 == section { inside = 1; print; next }
  /^\[/ { inside = 0 }
  inside && $1 == "enabled" { print "enabled = true"; next }
  { print }
' supabase/config.toml > supabase/config.toml.tmp && mv supabase/config.toml.tmp supabase/config.toml
grep -A1 "^\[auth.external.$PROVIDER\]" supabase/config.toml | grep -q "enabled = true" \
  || die "couldn't find [auth.external.$PROVIDER] in supabase/config.toml."

echo
echo "Saved to $ENV_FILE (this computer only). Pushing to Supabase..."
./scripts/push-supabase-config.sh
