-- API Drift Monitor — database schema
-- Apply via the Supabase SQL editor, or `supabase db push` once the CLI is linked.

create extension if not exists pgcrypto;

create table if not exists apis (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  name               text not null,
  base_url           text not null,
  spec_url           text,                               -- nullable: baseline mode doesn't require one
  spec_mode          text not null default 'openapi',     -- openapi | mcp | baseline
  check_mode         text not null default 'self_hosted', -- self_hosted | hosted
  auth_header_enc    bytea,                                -- encrypted, hosted mode only, nullable
  webhook_token      text not null,                        -- used by self-hosted agent to authenticate results
  check_interval     text not null default '1 hour',
  alert_webhook      text,
  alert_email        text,                                 -- additive alongside alert_webhook, not a replacement
  github_repo        text,                                 -- optional, enables deploy correlation
  is_active          boolean not null default true,
  last_seen_at       timestamptz,                          -- updated on every incoming result, powers dead-man's-switch
  last_dead_mans_alert_at timestamptz,                      -- throttles the dead-man's-switch alert to once/day
  mcp_snapshot       jsonb,                                 -- hosted-mode MCP: last tools/list response, API-level (not per-endpoint)
  created_at         timestamptz not null default now()
);

create table if not exists endpoints (
  id                  uuid primary key default gen_random_uuid(),
  api_id              uuid not null references apis(id) on delete cascade,
  path                text not null,
  method              text not null,
  operation_id        text,
  is_mutating         boolean not null default false,    -- POST/PUT/PATCH/DELETE, excluded from hosted checks by default
  last_status         text not null default 'unknown',   -- unknown | ok | drift | error | timeout
  last_checked_at     timestamptz,
  last_drift_details  jsonb,
  baseline_schema     jsonb,                              -- learned schema, used when spec_mode = 'baseline'
  created_at          timestamptz not null default now()
);

create table if not exists check_runs (
  id                 uuid primary key default gen_random_uuid(),
  endpoint_id        uuid not null references endpoints(id) on delete cascade,
  status             text not null,
  response_status_code int,
  response_time_ms   int,
  drift_details      jsonb,
  llm_summary        text,                               -- plain-English summary, generated post-ingestion
  correlated_commit  text,                                -- sha of nearest preceding deploy, if github_repo is set
  checked_at         timestamptz not null default now()
);

create table if not exists drift_ignores (
  id              uuid primary key default gen_random_uuid(),
  endpoint_id     uuid not null references endpoints(id) on delete cascade,
  field_path      text not null,           -- e.g. "data.user.middleName"
  ignore_reason   text,                    -- optional user note
  created_at      timestamptz not null default now(),
  unique (endpoint_id, field_path)
);

-- Team support: a collaborator gets the same day-to-day access as the owner
-- (view, pause/resume, manual check, noise-filter) but can never delete the
-- api or manage who else has access -- that stays owner-only, enforced both
-- here (insert/delete policies) and at the application layer.
create table if not exists api_collaborators (
  id          uuid primary key default gen_random_uuid(),
  api_id      uuid not null references apis(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text not null,          -- denormalized at insert time, so the
                                       -- UI can list collaborators without a
                                       -- per-view admin API lookup
  added_by    uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (api_id, user_id)
);

-- Schema evolution for deployments that already exist (the CREATE TABLE
-- above only helps a fresh install -- IF NOT EXISTS makes it a no-op once
-- the table is already live with real data).
alter table apis add column if not exists alert_email text;
alter table apis add column if not exists mcp_snapshot jsonb;

create index if not exists idx_endpoints_api_id on endpoints(api_id);
create index if not exists idx_check_runs_endpoint_id on check_runs(endpoint_id);
create index if not exists idx_check_runs_checked_at on check_runs(checked_at desc);
create index if not exists idx_apis_user_id on apis(user_id);
create index if not exists idx_drift_ignores_endpoint_id on drift_ignores(endpoint_id);
create index if not exists idx_api_collaborators_api_id on api_collaborators(api_id);
create index if not exists idx_api_collaborators_user_id on api_collaborators(user_id);

-- Ingest upserts on (api_id, path, method) -- self-hosted checkers and the
-- hosted batch checker both discover endpoints as results come in rather
-- than requiring them to be pre-registered from a spec, so this constraint
-- is what makes that upsert race-safe instead of just best-effort.
create unique index if not exists idx_endpoints_api_path_method on endpoints(api_id, path, method);

-- Row Level Security: users can see/manage an API if they own it OR are a
-- listed collaborator on it, and everything that hangs off it. The
-- service-role key (used by the ingest endpoint and hosted-mode checker)
-- bypasses RLS entirely, which is why webhook_token auth happens at the
-- application layer for the self-hosted ingest path.

alter table apis enable row level security;
alter table endpoints enable row level security;
alter table check_runs enable row level security;
alter table drift_ignores enable row level security;
alter table api_collaborators enable row level security;

-- Single source of truth for "can the current user use this API at all" --
-- used by endpoints/check_runs/drift_ignores policies below instead of
-- repeating the owner-or-collaborator check inline. NOT used by apis' own
-- policies or api_collaborators' own SELECT policy -- see the note on those
-- below for why.
--
-- MUST be SECURITY DEFINER with search_path locked to '' and every table
-- reference schema-qualified (standard hardening, so it can't be tricked
-- into resolving a table from a user-writable schema). Originally this also
-- ran as SECURITY DEFINER to dodge an RLS recursion between this function
-- and apis' SELECT policy (apis' policy called this function, which queried
-- apis, which re-triggered apis' policy) -- that recursion no longer exists
-- now that apis' own policies don't call this function, but SECURITY DEFINER
-- stays since endpoints/check_runs/drift_ignores still rely on it being able
-- to read apis regardless of the caller's own RLS visibility into apis.
create or replace function has_api_access(target_api_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.apis
    where public.apis.id = target_api_id
      and (
        public.apis.user_id = auth.uid()
        or exists (
          select 1 from public.api_collaborators
          where public.api_collaborators.api_id = public.apis.id
            and public.api_collaborators.user_id = auth.uid()
        )
      )
  );
$$;

-- Narrower than has_api_access: checks ONLY api_collaborators, never apis.
-- apis' own SELECT/UPDATE policies need a collaborator check, but can't do it
-- via a plain subquery into api_collaborators -- api_collaborators' own
-- SELECT policy needs to check apis ownership right back, and two tables
-- whose policies plainly subquery each other is a structural cycle Postgres
-- rejects outright ("infinite recursion detected in policy for relation
-- apis"), independent of any actual runtime short-circuiting. Wrapping one
-- direction in a SECURITY DEFINER function makes it opaque to that cycle
-- detection (the planner treats it as a black-box boolean, not as "this also
-- touches api_collaborators' RLS") while also, as a bonus, meaning the
-- lookup is never subject to api_collaborators' own policy at all. Querying
-- ONLY api_collaborators (never apis) also means this is safe to call from
-- apis' own INSERT/UPDATE ... RETURNING -- it never self-references the
-- table whose RETURNING row visibility is in question (see has_api_access's
-- comment above for why that specific case breaks even under SECURITY
-- DEFINER).
create or replace function is_api_collaborator(target_api_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.api_collaborators
    where public.api_collaborators.api_id = target_api_id
      and public.api_collaborators.user_id = auth.uid()
  );
$$;

create policy "Owners can insert their own apis"
  on apis for insert
  with check (auth.uid() = user_id);

create policy "Owners and collaborators can view an api"
  on apis for select
  using (auth.uid() = user_id or is_api_collaborator(id));

create policy "Owners and collaborators can update an api"
  on apis for update
  using (auth.uid() = user_id or is_api_collaborator(id))
  with check (auth.uid() = user_id or is_api_collaborator(id));

-- Deliberately owner-only, not has_api_access -- deleting the API (and
-- everything cascading from it) is a decision only the owner makes.
create policy "Only owners can delete an api"
  on apis for delete
  using (auth.uid() = user_id);

create policy "Owners and collaborators can manage endpoints"
  on endpoints for all
  using (has_api_access(api_id))
  with check (has_api_access(api_id));

create policy "Owners and collaborators can read check_runs"
  on check_runs for select
  using (exists (
    select 1 from endpoints
    where endpoints.id = check_runs.endpoint_id and has_api_access(endpoints.api_id)
  ));

create policy "Owners and collaborators can manage drift_ignores"
  on drift_ignores for all
  using (exists (
    select 1 from endpoints
    where endpoints.id = drift_ignores.endpoint_id and has_api_access(endpoints.api_id)
  ))
  with check (exists (
    select 1 from endpoints
    where endpoints.id = drift_ignores.endpoint_id and has_api_access(endpoints.api_id)
  ));

-- api_collaborators itself: owners and collaborators can see who has access;
-- only the owner can grant or revoke it (mirrored at the application layer
-- in /api/apis/[id]/collaborators, but enforced here too as the real
-- boundary, not just a UI nicety). Safe to subquery apis directly here (apis
-- is a different, already-committed table from api_collaborators'
-- perspective -- no same-statement visibility concern), and safe re:
-- recursion too: this subquery triggers apis' SELECT policy, which only
-- calls the opaque is_api_collaborator() function above rather than
-- subquerying api_collaborators directly, so the cycle terminates instead of
-- the structural "infinite recursion detected in policy" the planner throws
-- when two tables' policies plainly subquery each other.
create policy "Owners and collaborators can see who has access"
  on api_collaborators for select
  using (
    user_id = auth.uid()
    or exists (select 1 from apis where apis.id = api_collaborators.api_id and apis.user_id = auth.uid())
  );

create policy "Only owners can add collaborators"
  on api_collaborators for insert
  with check (exists (select 1 from apis where apis.id = api_id and apis.user_id = auth.uid()));

create policy "Only owners can remove collaborators"
  on api_collaborators for delete
  using (exists (select 1 from apis where apis.id = api_id and apis.user_id = auth.uid()));
