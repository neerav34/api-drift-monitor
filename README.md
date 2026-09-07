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

## Alerts and LLM summaries

`lib/alerts/slack.ts` and `lib/alerts/discord.ts` both take a `DriftAlert` (`lib/alerts/types.ts`) and post to a user-supplied webhook — Slack gets Block Kit, Discord gets an embed, both share the same `formatDriftLine` bullet formatting. `lib/llm-summary/summarize.ts` turns the raw diff into one plain-English sentence via whichever free-tier provider has a key set (`GROQ_API_KEY` preferred, `GEMINI_API_KEY` as fallback); it swallows provider failures and returns `undefined` rather than throwing, since a missing summary should never block an alert from firing — the caller just falls back to the raw diff in that case.

## Deploy correlation (`lib/deploy-correlation/github.ts`)

When an API has `github_repo` set, `findNearestCommit(repo, before, token?)` queries `GET /repos/{owner}/{repo}/commits?until=...` and returns the most recent commit before the drift timestamp, so an alert can say "likely caused by commit `a1b2c3d: refactor user serializer`" instead of just reporting the symptom. `GITHUB_APP_TOKEN` lifts GitHub's rate limit from 60/hr to 5,000/hr — comfortable at any early-stage volume.

## Ingest (`app/api/ingest/route.ts`)

The one endpoint self-hosted checkers talk to. Auth is a per-API `webhook_token` sent as `Authorization: Bearer <token>` — not a Supabase session, since the checker running in someone else's CI never logs in. The route looks up the API by token, then hands each result in the POST body to `lib/checks/process-check-result.ts`, which:

1. Upserts the `endpoints` row for `(api_id, path, method)` — endpoints don't need to be pre-registered from a spec; they're discovered as results come in. A unique index (`idx_endpoints_api_path_method`) makes this upsert race-safe.
2. Re-applies `drift_ignores` server-side via `filterDrift` and recomputes the final status — this runs centrally here (not in the checker) so toggling "ignore this field" in the dashboard takes effect immediately, regardless of where the check ran.
3. On drift: looks up deploy correlation and an LLM summary, writes the `check_runs` row, updates the endpoint's last-known status, and fires a Slack/Discord alert (picked by webhook URL) if one drifted.
4. Bumps `apis.last_seen_at`, which is what powers the dead-man's-switch.

This same `processCheckResult` function is meant to be reused by the hosted-mode batch checker and the manual "Check Now" button, so the behavior can't diverge between the three call sites.

## Hosted-mode checking (`lib/checks/run-hosted-check.ts`, `lib/drift/openapi.ts`)

`runHostedCheck(api, endpoint)` performs one live GET/HEAD request server-side and diffs the response against, in order: the endpoint's learned `baseline_schema`, or — for `spec_mode: "openapi"` — the response schema pulled live from the spec via `getResponseSchema`. It refuses (throws) if handed a mutating endpoint, since the safe-method-default guardrail means callers must filter those out first rather than this function silently downgrading a caller bug into a skipped check. `extractEndpointsFromSpec` walks an OpenAPI document to populate `endpoints` when an API is added in hosted mode with a spec URL, so they don't need to be entered by hand.

Note: hosted-mode MCP checking (`spec_mode: "mcp"`) isn't wired up yet — MCP monitoring currently only works through the self-hosted `api-drift-check` CLI, which is where it naturally lives anyway (most MCP servers run locally in dev, not behind a public URL a hosted checker could reach).

We depend on `@apidevtools/swagger-parser` directly rather than the `swagger-parser` npm shim — the shim's re-exported types don't resolve under this project's `moduleResolution: bundler`, and it wraps the same package anyway.
