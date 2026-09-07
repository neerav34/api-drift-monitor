# API Drift Monitor

A free-to-build, self-hostable-first monitoring layer that alerts you the moment your live API (or MCP server) drifts from its spec — without ever asking you to hand over your production credentials.

## Why

Your API spec (OpenAPI, or an MCP server's tool schema) says one thing. Your live service does another. A checker — running either on your own infra (default) or ours (opt-in) — compares live behavior against the spec on a schedule, and alerts you the moment they diverge.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in a Supabase project's URL/keys (see [Database](#database) below).
3. `npm run dev`

## Database

Schema lives in [`supabase/schema.sql`](supabase/schema.sql). Apply it to a Supabase project via the SQL editor or `supabase db push` once the CLI is linked. Tables: `apis`, `endpoints`, `check_runs`, `drift_ignores`, all with row-level security scoped to `auth.uid()`.

## Auth

`lib/supabase/client.ts` is for Client Components, `lib/supabase/server.ts` for Server Components/Route Handlers (session-aware, respects RLS) and a separate `createServiceRoleClient()` for trusted server paths that must bypass RLS (the self-hosted ingest endpoint, the hosted-mode batch checker). `proxy.ts` (Next.js 16's renamed `middleware.ts`) refreshes the session cookie on every request except `/api/ingest` and `/api/badge`, which are unauthenticated by design.

## Drift detection (`lib/drift/`)

The diffing logic is shared between the dashboard's hosted-mode checker and the published `checker-agent` CLI — neither forks it.

- `diff.ts` — `diffResponseAgainstSchema(schema, data, ignoredFields?)` runs an ajv validation and turns errors into `DriftItem[]` (`missing` / `wrongType` / `wrongFormat` / `invalid`), dropping anything whose dot-path is in `ignoredFields` (backed by the `drift_ignores` table).
- `baseline.ts` — `learnBaselineSchema(samples)` infers a permissive schema from N sample responses for endpoints with no OpenAPI spec. A field is only `required` if every sample had it; unknown fields are always allowed.
- `mcp-diff.ts` — `diffMcpSnapshots(previous, current)` diffs two `tools/list` snapshots from an MCP server: added/removed tools, added/removed/retyped params, and required-ness flips.

Run `npm test` to exercise the unit tests covering all three.

## Encryption at rest (`lib/crypto/encrypt.ts`)

Hosted-mode `auth_header` values are encrypted before hitting `apis.auth_header_enc` (AES-256-GCM, random IV per call, stored as `iv || authTag || ciphertext`). The key comes from `AUTH_HEADER_ENCRYPTION_KEY` — generate one with `openssl rand -hex 32` and never commit it. Self-hosted mode never touches this path at all: those credentials stay in the user's own GitHub Actions secrets.
