# Going online: R2, Resend, hosting, verification

Do these in order. Each takes about 10 minutes.

## A. Cloudflare R2 (where photos and videos live)
1. Sign up at cloudflare.com, then **R2 Object Storage** (it asks for a card; the free tier is 10 GB).
2. **Create bucket**, name it `tt-memory`.
3. **R2 > Manage API tokens > Create API token**, permission **Object Read & Write**, limited to that bucket.
4. Copy the **Access Key ID** and **Secret Access Key** (shown once) and your **Account ID** (top right of the R2 page).
5. Put them in `.env` (or the host's environment settings):
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=tt-memory`
6. Restart the server. Backups now go to R2. Old files in `data/files` do not move; the app re-uploads when a photo changes.

Keep the bucket private. No CORS setup is needed, because the phone app uploads natively.

## B. Resend (emails: verification and password reset)
1. Sign up at resend.com, **API Keys > Create**, set `RESEND_API_KEY`.
2. Until you verify a domain, `onboarding@resend.dev` only delivers to your own Resend login email. That is fine for testing with one address.
3. For real users: **Domains > Add domain** (e.g. `ttmemory.app`), add the DNS records they show, then set
   `MAIL_FROM=TT Memory <hello@ttmemory.app>`.
Without a key the server prints each email's code in its console, which also works for testing.

## C. Host the server (Render)
1. Put the `tt-server` folder in a GitHub repository (do not commit `.env`).
2. Render > **New > Blueprint** > pick the repo. `render.yaml` sets up the Docker service, a 1 GB disk at `/data`, and the health check.
3. Fill in the environment values when asked (same values as your `.env`; leave `PERIOD_MINUTES` out).
4. When it is live you get `https://tt-memory-server.onrender.com` (or similar). Open `/health` to check; it shows `{"ok":true}`.
5. Paystack > Settings > API Keys & Webhooks: set the webhook URL to `https://YOUR-URL/api/webhooks/paystack`.
6. In the app, set `EXPO_PUBLIC_API_URL=https://YOUR-URL` in `tt-mobile/.env` and change the fallback in `src/payments/config.js`, then restart Expo with `npx expo start -c`.

The disk keeps users, subscriptions and (without R2) files. Do not use a free instance: it sleeps and loses data without a disk.
Other hosts (Railway, Fly.io) work too: run the Dockerfile, mount a volume at `/data`, set the same variables.

## D. Email verification
- New accounts get a 6-digit code (15 minutes, 5 tries, 1 resend per minute).
- Until verified, people can browse and add memories on the phone, but cloud backup and buying a plan return "Please verify your email first."
- Resetting a password by emailed code also verifies the email.
- Accounts made before this update must verify once: Profile > Verify your email.
- Set `REQUIRE_EMAIL_VERIFICATION=off` to turn the gate off while testing.
