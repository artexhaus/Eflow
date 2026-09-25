# Putting Eflow live on eflowapp.org

The code is ready for Vercel (`vercel.json` handles page routing and security headers). These are the steps only you can do, in order. Each takes a few minutes.

## 1. Vercel: deploy the site

1. Sign up at vercel.com with your GitHub account.
2. **Add New → Project → Import** the `artexhaus/Eflow` repository.
3. Under **Environment Variables**, add the two values from your local `.env` file:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**. You get a temporary `something.vercel.app` address; open it to check the sign-in page loads.

From now on, every `git push` to `main` redeploys automatically.

## 2. Vercel + Namecheap: connect eflowapp.org

1. In Vercel: **Project → Settings → Domains → Add** `eflowapp.org`, then also add `www.eflowapp.org` (let Vercel redirect www to the main domain).
2. Vercel shows the DNS records it needs. In Namecheap: **Domain List → Manage (eflowapp.org) → Advanced DNS**:
   - Delete the default "parking page" records (URL Redirect / CNAME `parkingpage.namecheap.com`).
   - Add the records Vercel shows. They are normally:
     - `A` record, Host `@`, Value `76.76.21.21`
     - `CNAME` record, Host `www`, Value `cname.vercel-dns.com`
   - Use the exact values Vercel displays if they differ.
3. Wait for Vercel to show both domains as **Valid** (usually minutes, up to a few hours). Vercel sets up HTTPS automatically.

## 3. Supabase: allow the new address

In the Supabase dashboard: **Authentication → URL Configuration**:

- **Site URL:** `https://eflowapp.org`
- **Redirect URLs:** add `https://eflowapp.org/**`, `https://www.eflowapp.org/**` and `http://localhost:5173/**` (so local testing keeps working)

Then tell checkout where to send people back after paying (run in the project folder):

```sh
supabase secrets set APP_URL=https://eflowapp.org
```

## 4. Email sending (needed before real users)

Supabase's built-in email sender only delivers to your own Supabase team's addresses and a handful per hour, so **password-reset and sign-up emails won't reach real users** until you add an email service:

1. Create a free account at **resend.com** (3,000 emails/month free).
2. **Domains → Add** `eflowapp.org`; add the DNS records Resend shows in Namecheap **Advanced DNS**; wait until verified.
3. Create an API key in Resend.
4. Supabase: **Authentication → Emails → SMTP Settings → Enable custom SMTP**:
   - Host `smtp.resend.com`, Port `465`, Username `resend`, Password = your Resend API key
   - Sender email `no-reply@eflowapp.org`, Sender name `Eflow`
5. Then turn on **Authentication → Sign In / Providers → Email → Confirm email**, so new accounts must verify their address.

## 5. A support inbox without personal details

The legal pages list `support@eflowapp.org`. In Namecheap: **Domain List → Manage → Redirect Email → Add catch-all / forwarder** `support` → the inbox you want those emails in. Nothing personal is shown publicly; only the forwarding address.

## 6. Before announcing

- Fill in the governing-law state in `src/lib/legal.ts` (`governingLaw`), usually where Artexhaus is registered.
- Have a lawyer review the Privacy Policy, Terms and Refund Policy (`/privacy`, `/terms`, `/refunds`).
- Stripe live mode: see `STRIPE_SETUP.md` → "Go live" (run `scripts/setup-stripe.sh` with your live key and `APP_URL` set).
