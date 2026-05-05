## Mundi — Multi-Agent SaaS Dashboard (v1)

### Stack

- TanStack Start + Tailwind v4 + shadcn
- Lovable Cloud (auth, Postgres, storage, edge functions)
- Lovable AI Gateway (Gemini 3 Flash for parsing/analysis, Gemini 3 Flash Image for vision-based captions)
- Telegram connector (Cara) + public webhook stubs for n8n/Make (Mira)

### Design system (Linear/Vercel-inspired, dark-first)

- Background: deep near-black (`oklch(0.14 0.01 270)`), elevated surfaces slightly lighter
- Single neon accent: electric cyan-violet (`oklch(0.78 0.18 250)`) with glow shadow tokens
- Typography: Geist Sans body, Geist Mono for agent IDs / activity feed timestamps
- Shared tokens: `--gradient-glow`, `--shadow-elegant`, `--shadow-glow`, `--surface-1/2/3`
- Animated activity feed with subtle pulse, agent status dots, smooth route transitions

### Database schema

- `profiles` (user → display name) + trigger
- `business_data` (user_id, type: expense|earning|inventory, raw_csv, parsed_json, summary)
- `product_catalog` (user_id, name, description, price, stock, image_url)
- `agent_logs` (user_id, agent: finn|mira|cara, action, status, payload, created_at)
- `customer_tickets` (user_id, channel: whatsapp|shopee|telegram, customer_id, message, status, ai_reply)
- `pending_orders` (user_id, ticket_id, product_id, qty, status: pending|approved|rejected)
- `social_posts` (user_id, product_id, platform, caption, image_url, scheduled_at, status)
- Storage bucket: `product-images` (public), `csv-uploads` (private)
- RLS on all tables (user owns their data)

### Routes

```
/auth                  — sign-in / sign-up (email + password)
/                      — dashboard overview (KPIs + activity feed across all 3 agents)
/finance               — Finn: CSV upload, parsed insights, action plan
/marketing             — Mira: product picker → AI caption + post preview, schedule list
/marketing/webhook     — public webhook reference page (n8n/Make endpoints)
/support               — Cara: unified inbox, pending order approvals, Telegram setup
```

### Edge functions

- `finn-analyze` — parse CSV, call Gemini 3 Flash with system prompt → cash flow / waste / action plan JSON
- `mira-generate` — take product (image + name), call Gemini 3 Flash Image (vision) → captions per platform
- `cara-reply` — given a ticket, generate suggested reply; detect "buy intent" → create pending_order
- Public routes (`/api/public/*`):
  - `webhooks/telegram` — receive Telegram messages → customer_tickets
  - `webhooks/mira-comments` — n8n/Make pushes IG comments
  - `mira-posts` — n8n/Make pulls scheduled posts

### Out of scope (v1)

- Real WhatsApp integration (UI + DB ready, webhook stubs only)
- Actual posting to IG (handled by user's n8n/Make workflows)
- Team/multi-user roles (single admin per account)

### Build order

1. Enable Cloud + create schema + RLS + storage buckets
2. Auth (email/password) + protected layout with sidebar
3. Design system in styles.css
4. Dashboard + activity feed component
5. Finn page + `finn-analyze` edge function + CSV upload
6. Mira page + `mira-generate` edge function + product CRUD
7. Cara page + Telegram connector + `cara-reply` + order approval flow
8. Public webhook routes + setup docs page