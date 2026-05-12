@AGENTS.md

# LVRG Lead Magnet Tool — lm-tool

Next.js 16 frontend + API layer for the LVRG AI-powered B2B outreach platform. Prospects are discovered via Scout, AI-generated preview sites are built by the Python engine, and cold emails are pushed to Instantly.ai campaigns.

## Dev Setup

```bash
npm install
npm run dev          # starts on http://localhost:3000
npm run build        # production build
npm run lint         # eslint check
```

Local dev skips Google OAuth via `DEV_BYPASS_AUTH=true` in `.env.local`. The engine must also be running locally (see lvrg-engine repo) — set `ENGINE_URL=http://127.0.0.1:8766` in `.env.local`.

## Project Structure

```
app/
  (auth)/               # login + oauth callback pages
  dashboard/
    page.tsx            # welcome hub (stats are currently mocked)
    scout/              # ScoutClient.tsx — AI prospecting chat
    engine/             # EnginePage — build queue + site preview
    leads/              # LeadsClient.tsx — pipeline table
    lead-magnets/       # LeadMagnetsClient.tsx — built sites + bulk send
    campaigns/          # Instantly API stats + sync
    insights/           # Claude Haiku narrative
    settings/           # SettingsClient.tsx — brand CRUD
    layout.tsx          # dashboard shell (auth check + sidebar)
  api/                  # all API routes (server-only)
components/
  layout/Sidebar.tsx    # only shared component
lib/
  supabase/
    client.ts           # browser client (anon key, use in client components)
    server.ts           # server client (cookie session, use in server components)
    service.ts          # service role client (bypasses RLS, use in API routes only)
  supabase-rest.ts      # direct REST helper using service key
  leads.ts              # Lead type + basic Supabase queries
  dev-auth-bypass.ts    # fake user when DEV_BYPASS_AUTH=true
engine/                 # mirrored Python engine files (reference only)
mcp/server.js           # MCP server for Claude.ai desktop tool use
```

## Supabase Client Usage

| Context | Client to use |
|---------|-------------|
| Client component (browser) | `lib/supabase/client.ts` |
| Server component / layout | `lib/supabase/server.ts` |
| API route (write / admin) | `lib/supabase/service.ts` (bypasses RLS) |
| Direct REST calls | `lib/supabase-rest.ts` |

Never use the service role key in client components — it bypasses all Row Level Security.

## Auth

Middleware in `middleware.ts` runs on every request:
- Dev: `DEV_BYPASS_AUTH=true` skips OAuth entirely (fake user `dev@localhost`)
- Prod: Supabase SSR checks cookies, redirects unauthenticated to `/auth/login`
- API routes: skip redirect, handle their own auth checks

There is no per-route permission model — all authenticated users see all data. Brand isolation is done by filtering on `brand_id`, but this is not enforced by RLS.

## API Routes

### Engine & Build
- `POST /api/engine` — Proxies to Python engine with SSE stream. 5-min timeout, 8s heartbeat. Input: `{ domain, notes?, offer?, cta?, engine_v2? }`. SSE events: `log`, `intel`, `grade`, `result`, `done`, `error`.
- `GET|POST|PATCH|DELETE /api/engine-queue` — CRUD for `engine_queue` table. POST accepts `{ prospects: [] }` or `{ domains: [] }`.

### Scout (AI Prospecting)
- `POST /api/scout` — Claude Sonnet agentic loop. Tools: `search_prospects` (Firecrawl), `scrape_and_grade` (Claude Haiku), `save_to_queue`. SSE stream.
- `GET|PATCH /api/scout/sessions` — Session list (last 20) + update messages.
- `GET /api/scout/sessions/[id]` — Single session with full prospects + history.

### Outreach & Sync
- `POST /api/send-outreach` — Push lead to Instantly v2 + mark lead + queue as `sent`.
- `GET /api/campaigns` — Aggregate Instantly campaign stats (hardcoded last 50 leads).
- `POST|GET /api/sync` — Pull Instantly engagement → update Supabase leads + log events. Status never moves backward.

### Data
- `POST /api/insights` — Compute lead stats → Claude Haiku prose narrative (no caching).
- `GET /api/brands` — All brands for current user.
- `PATCH|DELETE /api/brands/[id]` — Update/delete brand.
- `PATCH /api/leads/update` — Update single lead.
- `DELETE /api/leads/delete` — Delete lead by id.

## SSE Streaming Pattern

Both Scout and Engine use SSE (Server-Sent Events) for long-running jobs. Pattern:

```typescript
const stream = new ReadableStream({
  async start(controller) {
    const send = (data: object) =>
      controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
    // ... do work, call send() for each event
    controller.close();
  },
});
return new Response(stream, {
  headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
});
```

On the client, events are parsed with `EventSource` or manual `fetch` + `ReadableStream` reader.

## Key Supabase Tables

| Table | Purpose |
|-------|---------|
| `leads` | Full prospect pipeline. Status: `queued → built → sent → opened → clicked → replied → booked`. Upsert on domain. |
| `engine_queue` | Scout-populated queue. Holds `preview_url` + `email_json` (JSONB) after engine runs. Status: `queued/paused/building/built/sent`. |
| `scout_sessions` | Conversation history + discovered prospects. |
| `brands` | Sender config: name, email, booking URL, tone, ICP, offer, CTA. |
| `lead_events` | Event log with JSONB metadata. Events: `site_built`, `sent`. |

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=          # server-only, bypasses RLS

# AI + Search
ANTHROPIC_API_KEY=
FIRECRAWL_API_KEY=

# Outreach
INSTANTLY_API_KEY=
INSTANTLY_CAMPAIGN_ID=         # default campaign for send-outreach

# App config
DEFAULT_BRAND_ID=
ENGINE_URL=                    # URL of lvrg-engine (prod or local)
ENGINE_URL_V2=                 # V2 engine URL

# Dev only
DEV_BYPASS_AUTH=true           # skips Google OAuth
```

## Known Issues & Gotchas

- **Dashboard stats are mocked** — the welcome page shows hardcoded numbers, not real data.
- **No input validation** — API routes have no Zod schemas. Don't assume request shapes are safe.
- **historyRef in Scout** — conversation history is a ref, not state. Don't add logic that depends on it being reactive.
- **`buildingId` locks all queue buttons** — during an engine build, the entire queue is locked. A per-row lock would be better but isn't implemented.
- **LeadMagnets joins two tables** — `leads` + `engine_queue` are merged server-side with complex logic. There's no single source of truth for a built prospect.
- **Hardcoded campaign IDs** — `INSTANTLY_CAMPAIGN_ID` env var is the default, but LeadMagnets also has a hardcoded fallback ID. When working on outreach flows, check both.
- **8s iframe delay** — Engine page waits 8s after deploy before showing the iframe (GitHub Pages CDN propagation). This is intentional.
- **Insights re-render cost** — Every load of `/dashboard/insights` burns a Haiku API call. No caching.
- **No rate limiting** — Any authenticated user can trigger unlimited Claude Opus builds via `/api/engine`.
- **CORS note** — The Python engine has CORS wide open. All auth on the engine side relies on the Next.js proxy being the gatekeeper.

## Claude Models in Use

| Route | Model | Purpose |
|-------|-------|---------|
| `/api/scout` | `claude-sonnet-4-6` | Agentic prospecting loop with tools |
| `/api/scout` (grading tool) | `claude-haiku-4-5` | Site grading 0–10 |
| `/api/insights` | `claude-haiku-4-5` | Analytics narrative |
| `/api/engine` → Python | `claude-opus-4-5` | Site + email generation |
| Engine chat widget | `claude-haiku-4-5` | Live chat replies on deployed sites |

## Deployment

Deployed to Railway. Env vars set in Railway dashboard — never commit secrets.

```bash
# Railway picks up next.config.ts automatically
# Health: GET / → 200 (Next.js default)
```

Engine URL on prod: `https://lvrg-engine-production.up.railway.app`
