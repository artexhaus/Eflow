# Stripe setup for Eflow Pro

| Plan | Price | What it unlocks |
|---|---|---|
| Free | $0 | 500 emails cleaned (archived or deleted) per calendar month, UTC |
| Pro monthly | $6.99 / month | Unlimited cleaning |
| Pro yearly | $49.99 / year | Unlimited cleaning |

## Set it up (one command)

You need the Supabase CLI logged in and linked to the project (`supabase link`), plus `jq`.

```sh
./scripts/setup-stripe.sh
```

It asks for your Stripe secret key (Stripe Dashboard → Developers → API keys; use the **test** key `sk_test_...` first) and, optionally, your production site address. Then it:

1. Creates the **Eflow Pro** product with a $6.99/month and a $49.99/year price. The app finds them by their lookup keys (`eflow_pro_monthly`, `eflow_pro_annual`), so there are no price IDs to copy.
2. Creates the **webhook** to `https://<project-ref>.supabase.co/functions/v1/stripe-webhook` for `checkout.session.completed` and `customer.subscription.created/updated/deleted`.
3. Creates the **Customer Portal** settings behind **Manage Subscription**: update card, switch monthly ⇄ yearly, invoice history, cancel at the end of the billing period.
4. Saves `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PORTAL_CONFIGURATION` (and `APP_URL` if given) as Supabase function secrets.
5. Runs `supabase db push` and deploys every edge function.

It is safe to run again; it reuses what already exists. Each run replaces the webhook endpoint, because Stripe only reveals its signing secret when it is created.

## Test it

1. `npm run dev`, sign in, click **Upgrade**, pick a plan.
2. Pay with `4242 4242 4242 4242`, any future date, any CVC.
3. You land back in Eflow with "Welcome to Pro!" and the badge shows **Pro**.
4. Account → **Manage Subscription** opens Stripe's portal; cancel there and the account page shows "Pro ends on …".

To test the free limit without cleaning 500 emails, lower `FREE_MONTHLY_LIMIT` in `supabase/functions/_shared/billing.ts` and redeploy `imap-apply-actions`.

## Go live

Run the script again with your **live** key (`sk_live_...`) and your real site address. Live mode has its own products, webhook and portal settings, so the script sets them up there too.

## Where things live

- Limit enforced: `FREE_MONTHLY_LIMIT` in `supabase/functions/_shared/billing.ts` (the app's copy in `src/lib/billing.ts` is display only).
- Prices shown in the app: `PRICES` in `src/lib/billing.ts`. The amount charged comes from the Stripe prices.
- Return address after checkout: the `APP_URL` secret if set, otherwise the site the user came from.
- Optional overrides: `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL` secrets pin specific price IDs instead of the lookup keys.
