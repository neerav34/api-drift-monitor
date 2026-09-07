# API Drift Monitor

A free-to-build, self-hostable-first monitoring layer that alerts you the moment your live API (or MCP server) drifts from its spec — without ever asking you to hand over your production credentials.

## Why

Your API spec (OpenAPI, or an MCP server's tool schema) says one thing. Your live service does another. A checker — running either on your own infra (default) or ours (opt-in) — compares live behavior against the spec on a schedule, and alerts you the moment they diverge.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in a Supabase project's URL/keys (see [Database](#database) below).
3. `npm run dev`

## Database

Schema lives in [`supabase/schema.sql`](supabase/schema.sql). Apply it to a Supabase project via the SQL editor or `supabase db push` once the CLI is linked. Tables: `apis`, `endpoints`, `check_runs`, `drift_ignores`.
