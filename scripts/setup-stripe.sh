#!/usr/bin/env bash
# One-command Stripe setup for Eflow Pro.
#
#   ./scripts/setup-stripe.sh
#
# Asks for your Stripe secret key (input hidden), then:
#   1. Creates (or reuses) the "Eflow Pro" product with two prices,
#      $6.99/month and $49.99/year, found later by their lookup keys.
#   2. Creates the webhook that tells Eflow when someone subscribes/cancels.
#   3. Creates the Customer Portal settings (update card, switch plan, cancel).
#   4. Clears saved subscriptions that belong to a different Stripe account or
#      mode (after switching accounts, or from test to live), so nobody is
#      left showing a Pro plan this Stripe account doesn't know about.
#   5. Stores the secrets in your Supabase project.
#   6. Applies database migrations and deploys every edge function.
#
# Safe to run again: everything is looked up before it is created. Re-running
# replaces the webhook endpoint (its signing secret is only shown at creation).
# Use a TEST key (sk_test_...) first; run again with a live key to go live.
#
# Needs: supabase CLI (logged in and linked), curl, jq.

set -euo pipefail

cd "$(dirname "$0")/.."

die() { echo "Error: $*" >&2; exit 1; }
step() { printf '\n\033[1m%s\033[0m\n' "$*"; }

command -v supabase >/dev/null || die "the supabase CLI is not installed."
command -v jq >/dev/null || die "jq is not installed (brew install jq)."
command -v curl >/dev/null || die "curl is not installed."

PROJECT_REF="$(cat supabase/.temp/project-ref 2>/dev/null || true)"
[ -n "$PROJECT_REF" ] || die "this folder isn't linked to a Supabase project. Run: supabase link"
WEBHOOK_URL="https://${PROJECT_REF}.supabase.co/functions/v1/stripe-webhook"

# ---- Stripe key ---------------------------------------------------------------
if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
  printf 'Stripe secret key (Dashboard > Developers > API keys), input hidden: '
  read -rs STRIPE_SECRET_KEY
  echo
fi
case "$STRIPE_SECRET_KEY" in
  sk_test_*|rk_test_*) MODE="test" ;;
  sk_live_*|rk_live_*) MODE="live" ;;
  *) die "that doesn't look like a Stripe secret key (sk_test_... or sk_live_...)." ;;
esac
if [ "$MODE" = "live" ]; then
  read -rp "This is a LIVE key - real cards will be charged. Continue? [y/N] " ok
  [ "$ok" = "y" ] || [ "$ok" = "Y" ] || exit 1
fi

while :; do
  read -rp "Your site's address for production, e.g. https://www.eflowapp.org (press Enter to skip for local testing): " APP_URL
  APP_URL="$(printf '%s' "$APP_URL" | tr -d '[:space:]')"
  APP_URL="${APP_URL%/}"
  [ -z "$APP_URL" ] && break
  case "$APP_URL" in http://*|https://*) ;; *) APP_URL="https://$APP_URL" ;; esac
  if [[ "$APP_URL" =~ ^https?://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(:[0-9]+)?$ ]]; then break; fi
  echo "That doesn't look like a site address. Type it like https://www.eflowapp.org"
done

# stripe METHOD PATH [curl -d args...]: calls the Stripe API, fails loudly.
stripe() {
  local method="$1" path="$2"; shift 2
  local out
  # -g: don't treat the [] in Stripe parameter names as curl URL patterns.
  out="$(curl -sS -g -X "$method" "https://api.stripe.com/v1${path}" -u "${STRIPE_SECRET_KEY}:" "$@")"
  if [ "$(jq -r '.error.message // empty' <<<"$out")" != "" ]; then
    die "Stripe: $(jq -r '.error.message' <<<"$out")"
  fi
  printf '%s' "$out"
}

step "Checking the Stripe key ($MODE mode)..."
stripe GET /balance >/dev/null
echo "OK"

# ---- Product and prices -------------------------------------------------------
step "Setting up the Eflow Pro product and prices..."
existing="$(stripe GET '/prices?active=true&lookup_keys[]=eflow_pro_monthly&lookup_keys[]=eflow_pro_annual&limit=10')"
PRICE_MONTHLY="$(jq -r '.data[] | select(.lookup_key=="eflow_pro_monthly") | .id' <<<"$existing")"
PRICE_ANNUAL="$(jq -r '.data[] | select(.lookup_key=="eflow_pro_annual") | .id' <<<"$existing")"
PRODUCT="$(jq -r '.data[0].product // empty' <<<"$existing")"

if [ -z "$PRODUCT" ]; then
  PRODUCT="$(stripe GET '/products?active=true&limit=100' | jq -r '[.data[] | select(.metadata.eflow=="pro")][0].id // empty')"
fi
if [ -z "$PRODUCT" ]; then
  PRODUCT="$(stripe POST /products \
    -d name="Eflow Pro" \
    -d description="Unlimited inbox cleaning" \
    -d "metadata[eflow]=pro" | jq -r .id)"
  echo "Created product $PRODUCT"
else
  echo "Using product $PRODUCT"
fi

if [ -z "$PRICE_MONTHLY" ]; then
  PRICE_MONTHLY="$(stripe POST /prices \
    -d product="$PRODUCT" -d currency=usd -d unit_amount=699 \
    -d "recurring[interval]=month" -d lookup_key=eflow_pro_monthly -d nickname="Pro monthly" | jq -r .id)"
  echo "Created \$6.99/month price $PRICE_MONTHLY"
else
  echo "Using monthly price $PRICE_MONTHLY"
fi

if [ -z "$PRICE_ANNUAL" ]; then
  PRICE_ANNUAL="$(stripe POST /prices \
    -d product="$PRODUCT" -d currency=usd -d unit_amount=4999 \
    -d "recurring[interval]=year" -d lookup_key=eflow_pro_annual -d nickname="Pro yearly" | jq -r .id)"
  echo "Created \$49.99/year price $PRICE_ANNUAL"
else
  echo "Using yearly price $PRICE_ANNUAL"
fi

# ---- Webhook ------------------------------------------------------------------
step "Setting up the webhook ($WEBHOOK_URL)..."
old_ids="$(stripe GET '/webhook_endpoints?limit=100' | jq -r --arg url "$WEBHOOK_URL" '.data[] | select(.url==$url) | .id')"
for id in $old_ids; do
  stripe DELETE "/webhook_endpoints/$id" >/dev/null
  echo "Replaced old endpoint $id"
done
webhook="$(stripe POST /webhook_endpoints \
  -d url="$WEBHOOK_URL" \
  -d description="Eflow subscriptions" \
  -d "enabled_events[]=checkout.session.completed" \
  -d "enabled_events[]=customer.subscription.created" \
  -d "enabled_events[]=customer.subscription.updated" \
  -d "enabled_events[]=customer.subscription.deleted")"
WEBHOOK_SECRET="$(jq -r .secret <<<"$webhook")"
echo "Created endpoint $(jq -r .id <<<"$webhook")"

# ---- Customer Portal ----------------------------------------------------------
step "Setting up the Customer Portal (Manage Subscription)..."
PORTAL_ARGS=(
  -d "business_profile[headline]=Manage your Eflow Pro plan"
  -d "features[invoice_history][enabled]=true"
  -d "features[payment_method_update][enabled]=true"
  -d "features[subscription_cancel][enabled]=true"
  -d "features[subscription_cancel][mode]=at_period_end"
  -d "features[subscription_update][enabled]=true"
  -d "features[subscription_update][default_allowed_updates][]=price"
  -d "features[subscription_update][proration_behavior]=create_prorations"
  -d "features[subscription_update][products][0][product]=$PRODUCT"
  -d "features[subscription_update][products][0][prices][]=$PRICE_MONTHLY"
  -d "features[subscription_update][products][0][prices][]=$PRICE_ANNUAL"
  -d "metadata[eflow]=portal"
)
PORTAL="$(stripe GET '/billing_portal/configurations?active=true&limit=100' | jq -r '[.data[] | select(.metadata.eflow=="portal")][0].id // empty')"
if [ -n "$PORTAL" ]; then
  stripe POST "/billing_portal/configurations/$PORTAL" "${PORTAL_ARGS[@]}" >/dev/null
  echo "Updated portal settings $PORTAL"
else
  PORTAL="$(stripe POST /billing_portal/configurations "${PORTAL_ARGS[@]}" | jq -r .id)"
  echo "Created portal settings $PORTAL"
fi

# ---- Subscriptions from another Stripe account ----------------------------------
# Each saved subscription points at a Stripe customer. A customer this key
# can't find was made by another account or in the other mode (test/live).
# Those rows are deleted: those people go back to Free, and their next upgrade
# starts fresh in this account. Rows this account knows are left alone.
step "Checking saved subscriptions against this Stripe account..."
SERVICE_KEY="$(supabase projects api-keys --project-ref "$PROJECT_REF" -o json 2>/dev/null \
  | jq -r '.[] | select(.name=="service_role") | .api_key' | head -1)"
[ -n "$SERVICE_KEY" ] || die "couldn't get the Supabase service key (is the supabase CLI logged in?)."
REST="https://${PROJECT_REF}.supabase.co/rest/v1"
rows="$(curl -sS -g "$REST/subscriptions?select=user_id,stripe_customer_id&stripe_customer_id=not.is.null" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY")"
jq -e 'type=="array"' >/dev/null <<<"$rows" || die "couldn't read the subscriptions table: $rows"
cleared=0
kept=0
while IFS=$'\t' read -r user_id customer_id; do
  [ -n "$customer_id" ] || continue
  code="$(curl -sS -o /dev/null -w '%{http_code}' "https://api.stripe.com/v1/customers/$customer_id" -u "${STRIPE_SECRET_KEY}:")"
  if [ "$code" = "404" ]; then
    curl -sS -f -o /dev/null -X DELETE "$REST/subscriptions?user_id=eq.$user_id" \
      -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" || die "couldn't clear an old subscription record."
    cleared=$((cleared + 1))
  elif [ "$code" = "200" ]; then
    kept=$((kept + 1))
  else
    die "Stripe answered $code while checking a customer; nothing more was changed. Try again."
  fi
done < <(jq -r '.[] | [.user_id, .stripe_customer_id] | @tsv' <<<"$rows")
echo "Kept $kept, cleared $cleared from another Stripe account or mode"

# ---- Supabase -----------------------------------------------------------------
step "Saving secrets to Supabase..."
secrets_file="$(mktemp)"
chmod 600 "$secrets_file"
trap 'rm -f "$secrets_file"' EXIT
{
  echo "STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY"
  echo "STRIPE_WEBHOOK_SECRET=$WEBHOOK_SECRET"
  echo "STRIPE_PORTAL_CONFIGURATION=$PORTAL"
  if [ -n "$APP_URL" ]; then echo "APP_URL=$APP_URL"; fi
} >"$secrets_file"
supabase secrets set --env-file "$secrets_file" >/dev/null
echo "Saved STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PORTAL_CONFIGURATION${APP_URL:+, APP_URL}"

step "Applying database migrations..."
supabase db push

step "Deploying edge functions..."
supabase functions deploy \
  imap-connect imap-fetch imap-apply-actions unsubscribe \
  create-checkout-session create-portal-session stripe-webhook delete-account

step "All set! Stripe is connected in $MODE mode."
cat <<EOF

Try it:
  1. npm run dev, sign in, click Upgrade and pick a plan.
EOF
if [ "$MODE" = "test" ]; then
  cat <<EOF
  2. Pay with the test card 4242 4242 4242 4242, any future date, any CVC.
EOF
fi
cat <<EOF
  3. You come back to Eflow with "Welcome to Pro!" and the badge says Pro.
  4. Account > Manage Subscription opens Stripe to change or cancel the plan.
EOF
