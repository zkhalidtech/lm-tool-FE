-- =============================================================================
-- LVRG Lead Magnet Tool — Complete Database Schema
-- Project: fwcdiqfsjtwtlmekjqir
-- Dashboard: https://supabase.com/dashboard/project/fwcdiqfsjtwtlmekjqir/sql
--
-- HOW TO USE:
--   New database  → run this entire file once in the SQL Editor.
--   Existing database → run the MIGRATIONS section at the bottom.
--   Safe to re-run — all statements use IF NOT EXISTS / IF NOT EXISTS guards.
-- =============================================================================


-- =============================================================================
-- TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- brands — multi-brand sender config
-- -----------------------------------------------------------------------------
create table if not exists brands (
  id               uuid primary key default gen_random_uuid(),

  -- Identity
  name             text not null,

  -- Sender details
  sender_name      text,
  sender_email     text,
  sending_domain   text,

  -- Outreach config
  booking_url      text,
  offer_description text,                        -- "We build AI-powered preview sites…"
  icp              text,                         -- "San Diego restaurants with weak websites"
  differentiator   text,                         -- "Free preview, no commitment"
  tone             text default 'direct and conversational',

  -- Defaults for engine builds
  default_offer    text default 'Website Rebuild',
  -- 'Website Rebuild' | 'Website Grade' | 'Smart Site' | 'AI Chat'
  default_cta      text default 'Book a Call',
  -- 'Book a Call' | 'Claim Your Site' | 'Get Your Grade' | 'Watch Demo'
  cta_urls         jsonb default '{}',           -- { "Book a Call": "https://..." }

  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- leads — full prospect pipeline
-- -----------------------------------------------------------------------------
create table if not exists leads (
  id               uuid primary key default gen_random_uuid(),

  -- Prospect identity
  domain           text not null,
  company_name     text,
  email            text,
  first_name       text,
  phone            text,
  owner_name       text,
  neighborhood     text,
  business_type    text,

  -- Outreach context
  offer            text not null default 'Website Rebuild',
  cta              text not null default 'Book a Call',
  pain_point       text,
  hook             text,                         -- 'new_site' | 'live_chat'

  -- Assets
  preview_url      text,                         -- GitHub Pages link
  website_score    integer,                      -- 1–10 grade from intel

  -- Pipeline status
  status           text not null default 'queued',
  -- 'queued' | 'building' | 'built' | 'sent' | 'opened' | 'clicked' | 'replied' | 'booked' | 'bounced'

  -- Instantly sync
  instantly_lead_id     text,
  instantly_campaign_id text,

  -- Relations
  brand_id         uuid references brands(id),
  created_by       uuid references auth.users(id),

  -- Timestamps
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  sent_at          timestamptz,
  opened_at        timestamptz,
  clicked_at       timestamptz,
  replied_at       timestamptz,
  booked_at        timestamptz
);

-- -----------------------------------------------------------------------------
-- engine_queue — Scout-discovered prospects waiting for an engine build
-- -----------------------------------------------------------------------------
create table if not exists engine_queue (
  id               uuid primary key default gen_random_uuid(),

  -- Prospect info (pre-populated by Scout before engine runs)
  brand_id         uuid references brands(id),
  domain           text not null unique,         -- unique: upsert on domain
  business_name    text,
  email            text,
  phone            text,
  pain_point       text,
  primary_color    text default '#1a1a2e',
  website_score    integer,
  angle            text,                         -- 'new_site' | 'live_chat'

  -- Queue status
  status           text not null default 'queued',
  -- 'queued' | 'paused' | 'building' | 'built' | 'sent'

  -- Results (written back by engine after build)
  preview_url      text,
  email_json       jsonb,                        -- { subject_a, subject_b, subject_c, body, ... }

  -- Relations
  session_id       uuid references scout_sessions(id) on delete set null,

  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- scout_sessions — Scout conversation history + discovered prospects
-- -----------------------------------------------------------------------------
create table if not exists scout_sessions (
  id               uuid primary key default gen_random_uuid(),
  brand_id         uuid references brands(id),
  session_name     text,
  messages         jsonb default '[]',           -- [{ role, content, ... }]
  prospects        jsonb default '[]',           -- [{ domain, score, ... }]
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- lead_events — immutable activity log per lead
-- -----------------------------------------------------------------------------
create table if not exists lead_events (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid references leads(id) on delete cascade,
  event            text not null,
  -- 'queued' | 'site_built' | 'email_drafted' | 'sent' | 'opened'
  -- | 'clicked' | 'replied' | 'booked' | 'bounced'
  metadata         jsonb default '{}',
  created_at       timestamptz default now()
);


-- =============================================================================
-- MIGRATIONS — run on an existing database to add columns/tables added after
-- the initial deploy. Safe to re-run (ADD COLUMN IF NOT EXISTS).
-- =============================================================================

-- brands: columns added after initial deploy
alter table brands add column if not exists offer_description text;
alter table brands add column if not exists icp               text;
alter table brands add column if not exists differentiator    text;
alter table brands add column if not exists default_offer     text default 'Website Rebuild';
alter table brands add column if not exists default_cta       text default 'Book a Call';
alter table brands add column if not exists cta_urls          jsonb default '{}';

-- leads: columns added after initial deploy
alter table leads add column if not exists owner_name     text;
alter table leads add column if not exists neighborhood   text;
alter table leads add column if not exists business_type  text;
alter table leads add column if not exists pain_point     text;
alter table leads add column if not exists hook           text;
alter table leads add column if not exists clicked_at     timestamptz;


-- =============================================================================
-- INDEXES
-- =============================================================================

create index if not exists leads_domain_idx         on leads(domain);
create index if not exists leads_status_idx         on leads(status);
create index if not exists leads_brand_idx          on leads(brand_id);
create index if not exists leads_offer_idx          on leads(offer);

create index if not exists engine_queue_brand_idx   on engine_queue(brand_id);
create index if not exists engine_queue_status_idx  on engine_queue(status);
create index if not exists engine_queue_session_idx on engine_queue(session_id);

create index if not exists scout_sessions_brand_idx on scout_sessions(brand_id);

create index if not exists lead_events_lead_idx     on lead_events(lead_id);
create index if not exists lead_events_event_idx    on lead_events(event);


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table brands         enable row level security;
alter table leads          enable row level security;
alter table engine_queue   enable row level security;
alter table scout_sessions enable row level security;
alter table lead_events    enable row level security;

-- Team tool — all authenticated users have full access to all rows.
-- Tighten these to per-user/per-brand policies when the product goes multi-tenant.

create policy if not exists "auth_brands"
  on brands for all to authenticated using (true) with check (true);

create policy if not exists "auth_leads"
  on leads for all to authenticated using (true) with check (true);

create policy if not exists "auth_engine_queue"
  on engine_queue for all to authenticated using (true) with check (true);

create policy if not exists "auth_scout_sessions"
  on scout_sessions for all to authenticated using (true) with check (true);

create policy if not exists "auth_lead_events"
  on lead_events for all to authenticated using (true) with check (true);


-- =============================================================================
-- TRIGGERS — auto-update updated_at
-- =============================================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Drop and recreate so this file is fully idempotent
drop trigger if exists brands_updated_at         on brands;
drop trigger if exists leads_updated_at          on leads;
drop trigger if exists engine_queue_updated_at   on engine_queue;
drop trigger if exists scout_sessions_updated_at on scout_sessions;

create trigger brands_updated_at
  before update on brands
  for each row execute function update_updated_at();

create trigger leads_updated_at
  before update on leads
  for each row execute function update_updated_at();

create trigger engine_queue_updated_at
  before update on engine_queue
  for each row execute function update_updated_at();

create trigger scout_sessions_updated_at
  before update on scout_sessions
  for each row execute function update_updated_at();


-- =============================================================================
-- SEED — default LVRG brand (idempotent: skipped if a brand already exists)
-- =============================================================================

insert into brands (
  name, booking_url, sender_name, sender_email,
  tone, default_offer, default_cta
)
select
  'LVRG',
  'https://theresandiego.com/advertise/',
  'Josh',
  'josh@lvrg.com',
  'direct and conversational',
  'Smart Site',
  'Book a Call'
where not exists (select 1 from brands limit 1);
