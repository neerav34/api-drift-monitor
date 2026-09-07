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
  github_repo        text,                                 -- optional, enables deploy correlation
  is_active          boolean not null default true,
  last_seen_at       timestamptz,                          -- updated on every incoming result, powers dead-man's-switch
  last_dead_mans_alert_at timestamptz,                      -- throttles the dead-man's-switch alert to once/day
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

create index if not exists idx_endpoints_api_id on endpoints(api_id);
create index if not exists idx_check_runs_endpoint_id on check_runs(endpoint_id);
create index if not exists idx_check_runs_checked_at on check_runs(checked_at desc);
create index if not exists idx_apis_user_id on apis(user_id);
create index if not exists idx_drift_ignores_endpoint_id on drift_ignores(endpoint_id);

-- Ingest upserts on (api_id, path, method) -- self-hosted checkers and the
-- hosted batch checker both discover endpoints as results come in rather
-- than requiring them to be pre-registered from a spec, so this constraint
-- is what makes that upsert race-safe instead of just best-effort.
create unique index if not exists idx_endpoints_api_path_method on endpoints(api_id, path, method);

-- Row Level Security: users can only see/manage their own APIs and everything
-- that hangs off them. The service-role key (used by the ingest endpoint and
-- hosted-mode checker) bypasses RLS entirely, which is why webhook_token auth
-- happens at the application layer for the self-hosted ingest path.

alter table apis enable row level security;
alter table endpoints enable row level security;
alter table check_runs enable row level security;
alter table drift_ignores enable row level security;

create policy "Users manage their own apis"
  on apis for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users read/manage endpoints of their own apis"
  on endpoints for all
  using (exists (select 1 from apis where apis.id = endpoints.api_id and apis.user_id = auth.uid()))
  with check (exists (select 1 from apis where apis.id = endpoints.api_id and apis.user_id = auth.uid()));

create policy "Users read check_runs of their own endpoints"
  on check_runs for select
  using (exists (
    select 1 from endpoints
    join apis on apis.id = endpoints.api_id
    where endpoints.id = check_runs.endpoint_id and apis.user_id = auth.uid()
  ));

create policy "Users manage drift_ignores of their own endpoints"
  on drift_ignores for all
  using (exists (
    select 1 from endpoints
    join apis on apis.id = endpoints.api_id
    where endpoints.id = drift_ignores.endpoint_id and apis.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from endpoints
    join apis on apis.id = endpoints.api_id
    where endpoints.id = drift_ignores.endpoint_id and apis.user_id = auth.uid()
  ));
