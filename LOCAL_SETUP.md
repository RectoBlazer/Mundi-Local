## Local development (no Lovable)

This repo is set up to run fully locally with:

- Supabase CLI (Docker) for Postgres, Auth, Storage and Edge Functions
- Google Gemini API (direct) for AI text + vision
- Telegram Bot API (direct) for ticket ingestion

### Prerequisites

- Docker Desktop
- Supabase CLI
- bun

### 1) Start Supabase

```bash
supabase start
supabase db reset
```

Get local URLs/keys:

```bash
supabase status
```

### 2) Edge Functions environment

Create `supabase/functions/.env`.

> Note: the local Edge Functions runtime skips env vars starting with `SUPABASE_`, so we use `SB_*`.

```env
SB_URL=http://127.0.0.1:54321
SB_ANON_KEY=sb_publishable_...
SB_SERVICE_ROLE_KEY=sb_secret_...

GEMINI_API_KEY=...

TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=... # random string
```

Run Edge Functions:

```bash
supabase functions serve --env-file supabase/functions/.env
```

### 3) Frontend

Create `.env.local` in the repo root:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Start dev server:

```bash
bun install
bun run dev
```

### 4) Telegram webhook (local)

Telegram requires an HTTPS public URL. Use ngrok or Cloudflare Tunnel to expose your local edge function:

- Local endpoint: `http://127.0.0.1:54321/functions/v1/telegram-webhook`

Set the Telegram webhook with a secret token (recommended):

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://<your-tunnel-host>/functions/v1/telegram-webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

Tenant routing: for now, the webhook requires `X-Mundi-User-Id` to decide which `user_id` to insert into `customer_tickets`.
For a production setup, create a mapping table from telegram chat IDs to `user_id`.
