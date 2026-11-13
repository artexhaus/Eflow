#!/usr/bin/env bash
# Saves a Resend API key as the RESEND_API_KEY secret on the Supabase project,
# so Eflow's backend can send emails (the automatic cleanup summary).
#
#   ./scripts/set-resend-key.sh
#
# The key is typed hidden, checked with Resend, and sent straight to Supabase.
# It is never shown, never written to the project, and never committed.
#
# Needs: the supabase CLI (logged in) and curl.

set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT_REF=xqskistgkihlewsxanib
DOMAIN=eflowapp.org

die() { echo "Error: $*" >&2; exit 1; }

command -v supabase >/dev/null || die "the supabase CLI isn't installed."
command -v curl >/dev/null || die "curl isn't installed."

echo "Paste your Resend API key (it starts with re_). It won't show as you type."
read -rs KEY
echo
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"
case "$KEY" in
  re_*) ;;
  *) die "that doesn't look like a Resend key (they start with re_)." ;;
esac

echo "Checking the key with Resend..."
# The key goes in a header file (not the command line), so other programs on
# this computer can't see it in the process list.
HDR="$(mktemp)"
ENVF="$(mktemp)"
trap 'rm -f "$HDR" "$ENVF"' EXIT
chmod 600 "$HDR" "$ENVF"
printf 'Authorization: Bearer %s\n' "$KEY" > "$HDR"

BODY="$(curl -s -w '\n%{http_code}' -H @"$HDR" https://api.resend.com/domains)"
CODE="$(printf '%s' "$BODY" | tail -n1)"
JSON="$(printf '%s' "$BODY" | sed '$d')"

if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  if printf '%s' "$JSON" | grep -qi "restricted"; then
    echo "  The key works (it's a sending-only key, which is the safest kind)."
  else
    die "Resend didn't accept that key. Create a new one and try again."
  fi
elif [ "$CODE" = "200" ]; then
  if printf '%s' "$JSON" | grep -q "\"name\":\"$DOMAIN\""; then
    if printf '%s' "$JSON" | grep -q "\"name\":\"$DOMAIN\"[^}]*\"status\":\"verified\""; then
      echo "  The key works and $DOMAIN is verified in Resend."
    else
      echo "  The key works, but $DOMAIN isn't verified in Resend yet."
      echo "  Emails won't send until it is: Resend > Domains > $DOMAIN."
    fi
  else
    echo "  The key works, but $DOMAIN isn't added in this Resend account."
    echo "  Add it under Resend > Domains so emails can be sent from it."
  fi
else
  die "couldn't reach Resend (HTTP $CODE). Check your internet connection and try again."
fi

printf 'RESEND_API_KEY=%s\n' "$KEY" > "$ENVF"
unset KEY
supabase secrets set --project-ref "$PROJECT_REF" --env-file "$ENVF" >/dev/null
echo "Saved. RESEND_API_KEY is now set on Supabase."
