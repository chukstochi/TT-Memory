# TT Memory payments server

Small Node server (no dependencies, Node 20+) that sits between the app and Paystack.
The app never sees your secret key and can never choose its own price.

## 1. Paystack test account
1. Sign up at https://paystack.com and open the dashboard (it starts in **Test mode**).
2. Settings > API Keys & Webhooks: copy the **Test Secret Key** (`sk_test_...`).
3. Products > Plans > New plan. Create three, **Monthly**, currency NGN:
   - Personal: 1000, Family: 3000, Family Plus: 5000
   Copy each plan code (`PLN_...`).
4. Settings > API Keys & Webhooks > Test Webhook URL: `https://YOUR-SERVER/api/webhooks/paystack`

## 2. Run locally
```
cp .env.example .env     # fill in the values, then load them:
set -a; . ./.env; set +a
node server.js
node --test              # run the tests
```
For webhooks locally, expose the port with a tunnel (e.g. `ngrok http 8787`) and paste that URL in Paystack.
Your phone reaches the server at `http://<PC-LAN-IP>:8787`.

## 3. Deploy
Render / Railway / Fly: deploy this folder (Dockerfile included), set the env vars from `.env.example`,
and attach a **persistent disk/volume mounted at `/data`** (`DATA_DIR=/data`). Without it, payments are lost on restart.
Health check: `GET /health`. The JSON file store is fine for a start; swap `db.js` for a real database when you grow.

## 4. Test payments
Use Paystack test cards (https://paystack.com/docs/payments/test-payments), e.g. `4084 0840 8408 4081`, any future expiry, CVV `408`.

## Going live
Swap in `sk_live_` key and live plan codes, set the live webhook URL. Note: Google Play and Apple generally require their
own in-app purchase for digital subscriptions sold inside an app, and both stores need Terms and Privacy URLs.

## Accounts
People sign up with an email and password. Passwords are stored only as salted scrypt hashes, sessions are random tokens
(only their hash is stored) that last 60 days, 5 wrong passwords lock an account for 15 minutes, and reset codes are
6 digits, single use, valid for 15 minutes. Without `RESEND_API_KEY` the reset code is printed in the server window.
Every payment and subscription call is tied to the logged-in account, so the app can no longer pay for or read
someone else's plan.

## API
- `POST /api/auth/register` `{name, email, password}`, `POST /api/auth/login` `{email, password}` -> `{token, user}`
- `POST /api/auth/forgot` `{email}`, `POST /api/auth/reset` `{email, code, password}`
- `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/password` `{current, password}`, `POST /api/auth/delete` `{password}` (Bearer session)
- `POST /api/payments/initialize` `{planId, callbackUrl}` (Bearer session) -> `{reference, authorizationUrl}`
- `GET /api/payments/verify/:reference`
- `GET /api/subscription` (Bearer session)
- `POST /api/subscription/cancel` (Bearer session)
- `POST /api/webhooks/paystack` (signed by Paystack)

## Cloud backup (photos and videos)
The phone uploads each photo or video straight to storage through a short-lived link, then tells the server its details.
The server counts the real file size against the person's plan, refuses videos on Free, keeps each person's files in their
own folder, and erases everything when an account is deleted. The Vault is never uploaded.

- **Testing on your PC:** leave the `R2_*` settings empty. Files are saved under `DATA_DIR/files`.
- **Real users:** use Cloudflare R2.
  1. Sign up at cloudflare.com, open **R2 Object Storage**, and create a bucket (for example `tt-memory`). Keep it private.
  2. R2 > **Manage R2 API Tokens** > Create API token > permission **Object Read & Write**, limited to that bucket.
  3. Copy the **Access Key ID**, **Secret Access Key**, and your **Account ID** (shown on the R2 page).
  4. Put them in `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID` and `R2_BUCKET`, then restart.
  5. In the bucket's Settings, add a **CORS policy** only if you also use a web app. The mobile app does not need one.
- Money: R2 charges for storage (a small amount per GB per month) and has no download fees. Check Cloudflare's current prices.
- Not yet handled: a file that was uploaded but never saved (the app closed half-way) stays in storage. A cleanup job can remove these later.

### API
- `GET /api/memories` -> `{memories, usedBytes, limitBytes}` (each has a fresh download `url`)
- `POST /api/memories/upload-url` `{id, type, size, ext}` -> `{fileKey, uploadUrl}`; then `PUT` the bytes to `uploadUrl`
- `PUT /api/memories/:id` `{type, title, ..., fileKey?}` saves the details; `DELETE /api/memories/:id`
