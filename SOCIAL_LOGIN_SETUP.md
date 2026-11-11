# Continue with Google / Apple: setup

The app side is built. The buttons appear on the sign-in screen by themselves
once a provider is switched on in Supabase. Until then nothing changes for
users. Email and password sign-in stays available either way.

Signing in with Google or Apple only creates the **Eflow account**. Connecting
the mailbox still uses an app password, the same as today.

You'll need this address in both consoles (it's where Google and Apple send
people back to after they approve):

```
https://xqskistgkihlewsxanib.supabase.co/auth/v1/callback
```

Never paste client secrets or the Apple key into chat. The setup script asks
for them with hidden input and keeps them on your computer in `supabase/.env`,
which is never committed.

---

## Google (free, about 20 minutes)

Use the Artexhaus Google account, not a personal one.

1. Go to **console.cloud.google.com** and create a project named **Eflow**.
2. Open **Google Auth Platform** (it may be labelled "OAuth consent screen") and click **Get started**:
   - **App name:** Eflow
   - **User support email:** the Artexhaus Google account's address. Google only allows an address you sign in with here; support@eflowapp.org can go in the developer contact field.
   - **Audience:** External
3. Open **Branding** and fill in:
   - **Application home page:** `https://www.eflowapp.org`
   - **Privacy policy:** `https://www.eflowapp.org/privacy`
   - **Terms of service:** `https://www.eflowapp.org/terms`
   - **Authorized domains:** add `eflowapp.org` and `xqskistgkihlewsxanib.supabase.co`
   - Skip the logo for now. Adding one requires Google's review.
4. Open **Data access** and add only these three basic scopes, which need no review: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
5. Open **Audience** and click **Publish app**. Until you do, only listed test users can sign in.
6. Open **Clients**, then **Create client**:
   - **Application type:** Web application. **Name:** Eflow web.
   - **Authorized JavaScript origins:** `https://www.eflowapp.org`, `https://eflowapp.org`, `http://localhost:5173`
   - **Authorized redirect URIs:** the callback address above.
   - Click **Create**. Copy the **Client ID**, then download or copy the **Client secret**. Google may only show the secret once.
7. In Terminal, from the Eflowapp folder:
   ```
   ./scripts/setup-social-login.sh google
   ```
   Enter the Client ID, then the secret (hidden). The script shows the change it will make to Supabase and asks before applying it.

**Optional: brand verification.** Until Google verifies the brand, its sign-in page may name the `supabase.co` address instead of "Eflow". To show "Eflow", verify `eflowapp.org` in Google Search Console (a DNS TXT record at Namecheap), then submit **Branding → Verify branding**. This usually takes a few business days.

## Apple ($99 a year, about 30 minutes)

Apple sign-in requires an **Apple Developer Program** membership. If you enroll as an **individual**, your legal name is on the developer account. To keep everything under the company, enroll as an **organization**, which needs a registered company (the LLC) and a free D-U-N-S number. That's why Apple can wait until the LLC exists. Google doesn't have this requirement.

At **developer.apple.com/account → Certificates, IDs & Profiles**:

1. **Identifiers → + → App IDs → App:**
   - Description: Eflow
   - Bundle ID (explicit): `org.eflowapp.app`
   - Tick **Sign in with Apple**, then click Register.
2. **Identifiers → + → Services IDs:**
   - Description: **Eflow**. This is the name people see.
   - Identifier: `org.eflowapp.signin`. This is your **Services ID**.
   - Register it, open it, tick **Sign in with Apple** and click **Configure**:
     - Primary App ID: `org.eflowapp.app`
     - Domains: `xqskistgkihlewsxanib.supabase.co`, `eflowapp.org`, `www.eflowapp.org`
     - Return URLs: the callback address above
   - Save.
3. **Keys → +:**
   - Name: Eflow sign-in
   - Tick **Sign in with Apple**, click **Configure**, choose `org.eflowapp.app`, then Register.
   - **Download the `AuthKey_XXXXXXXXXX.p8` file. Apple lets you download it only once.** Keep it outside the Eflowapp folder (for example in Documents) and back it up. Note the **Key ID**.
4. Your **Team ID** is at the top right of the developer site.
5. In Terminal, from the Eflowapp folder:
   ```
   ./scripts/setup-social-login.sh apple
   ```
   Enter the Team ID, Services ID, Key ID and the path to the `.p8` file.

**Every ~6 months:** Apple's sign-in secret expires after at most six months; the script makes one valid for 180 days. Run `./scripts/push-supabase-config.sh` before the date it prints. It renews the secret when there are fewer than 30 days left.

**"Hide My Email" users:** Apple may give Eflow a private relay address (`…@privaterelay.appleid.com`). Mail only reaches those addresses from senders you register. Under **Services → Sign in with Apple for Email Communication**, register the domain Eflow's emails come from (the From address set in Supabase's SMTP settings). Stripe receipts come from Stripe's own domain and can't be registered here, unless you later set up a custom email domain in Stripe.

## After setup

- Commit the `supabase/config.toml` change (`enabled = true`) so the setting is kept.
- From now on, push Supabase config **only** with `./scripts/push-supabase-config.sh`, never a bare `supabase config push`. Without the saved values, Supabase gets placeholder text and these sign-in buttons stop working. The script refuses to run in that case.
- Test it: open the site in a private window, tap **Continue with Google** (or Apple), approve, and you should land in Eflow. If you use the same email as an existing Eflow account, Supabase links the two, so it's the same account.
