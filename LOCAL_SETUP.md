### 3) Frontend

Create `.env.local` in the repo root:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

> Note: the frontend no longer uses Lovable Cloud env names (`SUPABASE_*`).

Start dev server:

```bash
bun install
bun run dev
```
