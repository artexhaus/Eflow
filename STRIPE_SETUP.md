# Stripe setup for Eflow Pro

Eflow has three plans:

| Plan | Price | What it unlocks |
|---|---|---|
| Free | $0 | 500 emails cleaned (archived or deleted) per calendar month, UTC |
| Pro monthly | $6.99 / month | Unlimited cleaning |
| Pro yearly | $49.99 / year | Unlimited cleaning |

The 500 limit is enforced in `imap-apply-actions` and changed in two places: `FREE_MONTHLY_LIMIT` in `supabase/functions/_shared/billing.ts` (enforced) and `src/lib/billing.ts` (display only). Displayed prices live in `PRICES` in `src/lib/billing.ts`; the amount actually charged comes from the Stripe prices below.

Do everything in **test mode** first.

## 1. Create the product and prices

Stripe Dashboard → Product catalog → **Add product**: "Eflow Pro", with two recurring prices:

- $6.99 USD, billed monthly
- $49.99 USD, billed yearly

Copy both price IDs (`price_...`).

## 2. Set the function secrets

```sh
supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_PRICE_MONTHLY=price_... \
  STRIPE_PRICE_ANNUAL=price_... \
  APP_URL=http://localhost:5173
```

`APP_URL` is where Stripe sends people back after checkout and the portal. Set it to your real site URL in production.

## 3. Deploy

```sh
supabase db push
supabase functions deploy create-checkout-session create-portal-session stripe-webhook imap-apply-actions
```

`stripe-webhook` is deployed with `verify_jwt = false` (see `supabase/config.toml`) because Stripe can't send a Supabase login token; it checks the Stripe signature instead.

## 4. Add the webhook endpoint

Stripe Dashboard → Developers → Webhooks → **Add endpoint**:

- URL: `https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook`
- Events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

Copy the signing secret and set it:

```sh
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

## 5. Turn on the Customer Portal

Stripe Dashboard → Settings → Billing → **Customer portal**. Enable:

- Update payment methods
- Cancel subscriptions (at end of billing period is kindest)
- Switch plans, with both Pro prices added as options
- Invoice history

Without this, **Manage Subscription** returns an error from Stripe.

## 6. Test

1. Sign in, open the plan badge in the top bar → **See Pro plans**, pick a plan.
2. Pay with card `4242 4242 4242 4242`, any future date, any CVC.
3. You land back on Eflow with "Welcome to Pro!" and the badge shows **Pro**.
4. **Manage Subscription** opens the portal; cancel there and the account page shows "Pro ends on …".

To test the limit without cleaning 500 emails, lower `FREE_MONTHLY_LIMIT` in `_shared/billing.ts` temporarily and redeploy `imap-apply-actions`.

To replay webhooks locally: `stripe listen --forward-to https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook`.

## Going live

Repeat steps 1, 2, 4 and 5 in live mode (live keys, live price IDs, a live webhook endpoint with its own signing secret) and set `APP_URL` to the production URL.
