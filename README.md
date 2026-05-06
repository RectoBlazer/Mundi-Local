# Mundi — Multi-Agent SaaS Dashboard for Small Business Automation

Mundi is a clean, "agentic" dashboard that puts three specialised AI agents to work for a small business owner:

- **Finn** — Finance & cash flow analyst (CSV in, insights + action plan out)
- **Mira** — Marketing & social media generator (product photo + name → captions + scheduled posts)
- **Cara** — Customer support agent (multi-channel inbox, AI replies, order approval flow)

Built on **Lovable Cloud** (managed Supabase backend), **Lovable AI Gateway** (Gemini / GPT-5 models, no user API key needed) and **TanStack Start + React 19 + Tailwind v4**.

---

## 1. Product requirements

### 1.1 Users & roles
- **Small Business Owner (Admin)** — single-tenant per account. All data is row-level scoped to the authenticated `user_id`.

### 1.2 Core entities (database)
| Table | Purpose |
|---|---|
| `profiles` | Display name + business name, auto-created on signup |
| `business_data` | Uploaded CSVs (expenses, earnings, inventory) + parsed JSON + Finn's summary |
| `product_catalog` | Products with image, description, price, stock |
| `agent_logs` | Real-time history of every action by Finn, Mira and Cara |
| `customer_tickets` | Inbound messages from WhatsApp / Shopee / Telegram |
| `pending_orders` | Orders Cara has drafted, waiting on owner approval |
| `social_posts` | Captions + scheduled posts produced by Mira |

Storage buckets: `product-images` (public).
RLS: enabled on every table — users only see their own rows.

### 1.3 Agent behaviour

**Finn — Finance**
1. Owner uploads a CSV (expenses / earnings / inventory).
2. `finn-analyze` edge function parses the CSV and asks Lovable AI for cash-flow analysis, waste detection and a prioritised action plan.
3. Result is stored in `business_data.parsed_json` + `summary` and surfaced on the Finance page.

**Mira — Marketing**
1. Owner picks a product from the catalog.
2. `mira-generate` sends the product image + name to Lovable AI (vision model) → returns captions per platform (IG / TikTok / X).
3. Caption + image are written to `social_posts`. External n8n / Make workflows pull scheduled posts via the public webhook.

**Cara — Customer support**
1. Inbound messages arrive via the Telegram connector (and stub webhooks for WhatsApp / Shopee) → inserted into `customer_tickets`.
2. `cara-reply` drafts an AI reply. If buy-intent is detected it creates a `pending_orders` row.
3. Owner approves → stock is decremented in `product_catalog` and Cara confirms with the customer.

### 1.4 UI / UX
- Dark-first, Linear / Vercel-inspired. Single neon accent + agent-coloured dots (Finn green, Mira magenta, Cara amber).
- Sidebar navigation: **Dashboard · Finance · Marketing · Support**.
- Real-time **Activity Feed** powered by Supabase Realtime on `agent_logs`.

---

## 2. Tech stack

- **Frontend:** TanStack Start v1 (file-based routing in `src/routes/`), React 19, Vite 7, Tailwind v4, shadcn/ui
- **Backend:** Lovable Cloud (Supabase Postgres + Auth + Storage + Edge Functions)
- **AI:** Lovable AI Gateway (`google/gemini-3-flash-preview` default, vision model for Mira) — no API key needed, billed via Lovable workspace
- **Integrations:** Telegram (Lovable connector) · n8n / Make webhooks for Mira

---

## 3. Project structure

```
src/
  routes/
    __root.tsx              # html shell + providers
    auth.tsx                # email/password sign-in & sign-up
    _app.tsx                # protected layout (sidebar)
    _app.index.tsx          # Dashboard
    _app.finance.tsx        # Finn
    _app.marketing.tsx      # Mira
    _app.support.tsx        # Cara
    api/public/             # public webhooks (Telegram, Mira)
  features/{finance,marketing,support}/    # page-level components
  components/AppShell.tsx
  components/ActivityFeed.tsx
  lib/auth.tsx              # Supabase auth context
  integrations/supabase/    # auto-generated — DO NOT EDIT
supabase/
  migrations/               # schema + RLS
  functions/                # finn-analyze, mira-generate, cara-reply
```

---

## 4. MVP setup — make it fully functional

Everything except the optional external workflows is automatic on Lovable.

### Step 1 — Open the project
Lovable Cloud is already enabled, the database schema, RLS, storage bucket and `LOVABLE_API_KEY` are already provisioned.

### Step 2 — Create your account
1. Visit the preview URL → you'll be redirected to `/auth`.
2. Sign up with email + password. A `profiles` row is created automatically (`handle_new_user` trigger).
3. You're dropped on the Dashboard.

> Email confirmation is on by default. For instant testing, ask Lovable to disable "Confirm email" in Cloud → Auth.

### Step 3 — Try Finn (Finance)
1. Go to **Finance**.
2. Upload a CSV. Suggested column shapes:
   - Expenses: `date,category,amount,note`
   - Earnings: `date,source,amount`
   - Inventory: `sku,name,stock,cost`
3. Click **Analyze** → `finn-analyze` runs and the insights panel populates.

### Step 4 — Try Mira (Marketing)
1. Go to **Marketing**.
2. **Add product**, upload an image (saved to the `product-images` bucket), set name / price / stock.
3. Select the product → **Generate post**. Pick a caption → **Schedule**.
4. **(Optional)** Hook up n8n / Make:
   - `GET  /api/public/mira-posts` — your workflow polls this for scheduled posts.
   - `POST /api/public/webhooks/mira-comments` — push IG / TikTok comments back into Mundi.

### Step 5 — Try Cara (Support)
1. Telegram is already connected via the Lovable connector. Message your bot.
2. The message lands in **Support → Inbox** as a `customer_tickets` row, Cara drafts a reply.
3. If Cara detects buy-intent it creates a row in **Pending Approvals**.
4. **Approve** → stock decrements in `product_catalog`, Cara confirms back to the customer on Telegram.

---

## 5. Configuration & secrets

Pre-configured by Lovable Cloud — you do **not** set these manually:

| Secret | Source |
|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Lovable Cloud |
| `LOVABLE_API_KEY` | Lovable AI Gateway (auto-managed) |
| `TELEGRAM_API_KEY` | Telegram connector |

To add **WhatsApp** or **Shopee** later, add their API keys via *Lovable → Cloud → Secrets* and wire them into the `cara-reply` edge function.

---

## 6. Public webhook reference

Stable URLs (immutable even if the project is renamed):

- Production: `https://project--41653037-dd4b-4a6a-bc92-a25689f1f20e.lovable.app`
- Preview:    `https://project--41653037-dd4b-4a6a-bc92-a25689f1f20e-dev.lovable.app`

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/public/webhooks/telegram` | POST | Telegram → `customer_tickets` |
| `/api/public/webhooks/mira-comments` | POST | n8n / Make → push IG comments |
| `/api/public/mira-posts` | GET | n8n / Make → pull scheduled posts |

All public endpoints validate signatures / shared secrets in the route handler.

---

## 7. Local development (optional)

```bash
bun install
bun run dev
```

`.env` and `src/integrations/supabase/{client,types}.ts` are auto-generated by Lovable — do not edit them.

---

## 8. Publishing

Click **Publish** in the top-right of the Lovable editor. Frontend changes need a Publish/Update click; edge functions and database migrations deploy immediately.

---

## 9. Roadmap (post-MVP)

- Real WhatsApp Cloud API + Shopee Open API for Cara
- Direct Instagram Graph API publishing for Mira (currently via n8n / Make)
- Multi-user / team roles
- Forecasting & anomaly alerts in Finn

---

Built with ❤ on [Lovable](https://lovable.dev).
