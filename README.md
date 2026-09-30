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

## API CRUD (`app/api/apis/`)

Session-authenticated (RLS-scoped, so a user only ever sees their own rows):

- `GET /api/apis` / `POST /api/apis` — list, and create an API. Creating one always generates a `webhook_token`; if it's hosted mode with a plaintext `auth_header` in the body, that gets encrypted before it ever touches a row. Hosted + OpenAPI + a spec URL also extracts endpoints from the spec immediately via `extractEndpointsFromSpec`, so there's something to check before any live result comes in. Self-hosted mode skips that — endpoints show up as ingest results arrive instead, since the checker (not the dashboard) is the one with spec access there.
- `GET /api/apis/[id]` / `PATCH /api/apis/[id]` / `DELETE /api/apis/[id]` — single-API read/update/delete, plus its endpoint list.
- `POST /api/apis/[id]/check` — the manual "Check Now" button, hosted mode only (self-hosted APIs have no server-side credentials to check with — their next result comes from the user's own scheduled CI run). Runs `runHostedCheck` over every non-mutating endpoint and feeds each result through `processCheckResult`.

Note: after adding a new dynamic route file, run `npx next typegen` before type-checking — the `RouteContext<'/api/apis/[id]'>` helper types are generated from the route manifest and won't recognize a brand-new route until then.

## Contract-health badge (`GET /api/badge/[id]`)

Public by design — no auth, meant to be dropped straight into a public README (`![status](https://yourapp.vercel.app/api/badge/<api-id>)`) as a passive acquisition channel. `lib/badge/status.ts` (`computeBadgeState`) is pure and unit-tested on its own: red "drifting" if any endpoint's last status isn't `ok`, otherwise green "stable Nd" counted from the most recent non-ok run (or the very first run ever, if it's never drifted), gray "no data" before the first check. `lib/badge/render.ts` hand-renders the shields.io-style flat SVG, no dependency needed.

## Self-hosted checker CLI (`packages/checker-agent`)

Published as `api-drift-check` — the core trust differentiator: it runs on the user's own GitHub Actions minutes, with their own repo secrets, and never sends their credentials anywhere. Only a diff result crosses the network.

```
npx api-drift-check init --base-url https://api.example.com --ingest-url https://yourapp.vercel.app/api/ingest \
  --spec-mode baseline --endpoints "GET:/users/1,GET:/orders"
```

writes `.api-drift-check.json` (non-secret settings only — the webhook token is deliberately never written to a file that could end up committed) and `.github/workflows/api-drift-check.yml`. The workflow reads the token from a `API_DRIFT_WEBHOOK_TOKEN` repo secret the user adds by hand, and calls `npx api-drift-check run` on a schedule.

`run` (`src/checks.ts`) supports all three spec modes: `openapi` extracts endpoints and diffs live responses against the spec fetched fresh each run; `baseline` learns a schema from the first 5 samples of each configured endpoint and diffs against it on subsequent runs; `mcp` snapshots and diffs the server's `tools/list` response. Baseline and MCP state persists across runs via `.api-drift-check-state.json`, which the generated workflow restores/saves with `actions/cache` — a stateless runner otherwise has nothing to diff against on the next run. A non-`ok` result exits the process with a non-zero code, so drift shows up as a failed Actions run, not just an alert someone might have muted.

The package's own `src/*.ts` imports the shared diffing logic directly from the root `lib/drift/` and reuses the `RawCheckResult` type from `lib/checks/process-check-result.ts` (type-only, so no runtime dependency) — one npm workspace, one source of truth for what counts as drift. `npm run build` (tsup) bundles those shared modules straight into `dist/index.js`, so the published package is fully self-contained despite importing across the monorepo at the source level; verified by building and running `dist/index.js --help` directly with no workspace context.

## Hosted-mode batch checker and dead-man's-switch (`scripts/check-all-apis.ts`, `.github/workflows/check-apis.yml`)

Runs on *our own* GitHub Actions minutes (every 15 minutes) and covers exactly two things:

1. **Hosted-mode live checks** — for each active hosted, non-MCP API whose `check_interval` has actually elapsed since `last_seen_at` (the 15-minute cron is just the outer poll; each API's own interval decides whether it's due), runs `runHostedCheck` over its non-mutating endpoints and feeds each result through `processCheckResult` — the same function `/api/ingest` and the manual check button use.
2. **Dead-man's-switch** — for *every* active API regardless of mode (a self-hosted checker can go quiet just as silently as a hosted one), fires `sendDeadMansSwitchAlert` once `last_seen_at` is more than 2× `check_interval` overdue, throttled to at most one alert per day per API via a new `apis.last_dead_mans_alert_at` column. A brand-new API has `last_seen_at` seeded to its creation time (not left `null`) specifically so this can't fire before the API has ever had a chance to report in.

`lib/checks/parse-interval.ts` parses `apis.check_interval` (e.g. `"1 hour"`, `"30 minutes"`) into milliseconds for both of the above. `createServiceRoleClient` was split out of `lib/supabase/server.ts` into its own `lib/supabase/service-role.ts` with no `next/headers` import, so this standalone script (run via plain `tsx`, not the Next.js runtime) doesn't pull in anything that assumes a request context.

Run locally with `npm run check:hosted`.

## Dashboard

Plain Tailwind, no component library — kept the scaffold's existing setup rather than adding shadcn/ui for this pass.

- `/` — landing page explaining the self-hosted-by-default trust model (per the guide's phase 4.2), `/login`, `/signup` — Supabase email/password auth (`components/auth-form.tsx`).
- `app/dashboard/layout.tsx` — server-side auth guard (redirects to `/login`) plus nav; every page under it assumes a signed-in user.
- `/dashboard` — lists the user's APIs with a green/red/gray `StatusPill` computed from each API's endpoints' `last_status`.
- `/dashboard/apis/new` — add-API form; self-hosted mode is the default per the guide's trust model, hosted-only fields (auth header) only appear once hosted mode is selected.
- `/dashboard/apis/[id]` — endpoint list with per-field drift details and an `IgnoreFieldButton` (the noise-filter allowlist button from the guide's folder structure) that POSTs to `/api/endpoints/[id]/ignore`; the self-hosted setup snippet (init command + webhook token) or a hosted-mode `CheckNowButton`, whichever mode applies; and a copyable badge markdown snippet.

All data fetching on these pages goes straight through the session-scoped Supabase server client (RLS-enforced), not through `/api/apis` — that REST surface exists for the CLI and for anyone building against the API directly, not as a proxy the dashboard has to round-trip through itself.

Verified end-to-end in a real browser (Puppeteer): landing/login/signup render with no console errors, and hitting an authenticated-only route while signed out redirects to `/login` as expected. Full authenticated-flow verification (sign up, add an API, see real check results) needs a real Supabase project, which is out of scope for this session.

## Check history chart (`lib/history/daily-status.ts`, `components/check-history-chart.tsx`)

A per-endpoint, last-30-days status strip on the API detail page (one per endpoint, directly under its drift details) — the same "uptime monitor" pattern as Better Uptime/UptimeRobot, since the data's actual job is state-over-time, not magnitude.

- `buildDailyHistory` (pure, unit-tested) buckets `check_runs` into one status per UTC day, picking the **worst** status seen that day rather than the last one — a drift that a later retry happens to clear shouldn't disappear from the strip. A day with zero runs is `"no-data"`, never assumed healthy.
- Day status maps onto a fixed, reserved status palette (`good`/`warning`/`serious`/`critical`, never reused for anything else) — colors alone never carry the meaning: a legend labeling all five states in text sits below the strip regardless of hover state, and hovering or keyboard-focusing any day updates a text detail line with its date, status, and check/drift counts. Tooltips enhance; they never gate — everything is already visible via the always-on legend.
- The detail page fetches all of an API's endpoints' `check_runs` for the window in one query (`.in("endpoint_id", [...])`), not one query per endpoint.

Verified against real production data (QRDrop's signaling server, 19+ days of real history at the time) — renders correctly, hover/focus interaction confirmed working via Puppeteer against the actual dashboard.

## Public live demo (`app/demo/page.tsx`)

Unauthenticated, read-only, `export const dynamic = "force-dynamic"` (otherwise Next.js would prerender it at build time and freeze the status/history as of the last deploy). Set `DEMO_API_ID` to a real API's id to showcase it — currently QRDrop's signaling server in production. Deliberately selects only non-secret columns (`id, name, base_url, check_mode, is_active` — never `webhook_token` or `auth_header_enc`), reuses `StatusPill` and `CheckHistoryChart` as-is, and shows a "no demo configured" message rather than crashing if the env var is unset. Linked from the landing page as "Live demo" / "See it live, no signup."

Verified against real production data via Puppeteer: renders QRDrop's actual status and history with no console errors, no redirect, and no secret fields anywhere in the HTML.

## Email alerts (`lib/alerts/email.ts`)

`sendEmailAlert(toEmail, alert)` mirrors `slack.ts`/`discord.ts` exactly — same `DriftAlert` shape, same `formatDriftLine` bullets, via [Resend](https://resend.com) (free tier, no card needed). `apis.alert_email` is **additive**, not a replacement for `alert_webhook`: `processCheckResult` dispatches to whichever channels are configured, each in its own try/catch, so a Resend outage never blocks a Slack/Discord alert or vice versa. Defaults to Resend's own `onboarding@resend.dev` sender, which works with zero domain verification; override with `RESEND_FROM_EMAIL` once a verified sending domain exists.

Verified with a real send (not just the mocked unit tests) — a live email through the actual Resend API arrived in a real inbox with the exact HTML shape `sendEmailAlert` produces.

## Hosted-mode MCP monitoring (`lib/checks/run-hosted-mcp-check.ts`)

MCP monitoring was self-hosted-CLI-only before this — hosted mode actively rejected `spec_mode: "mcp"` APIs. `runHostedMcpCheck` is the hosted-mode counterpart to the CLI's `runMcpCheck`: same JSON-RPC `tools/list` call, same snapshot diff, same per-tool result shape (`path: "tool:${name}", method: "MCP"`), so `processCheckResult` needed zero changes to support it. The only real difference is where the previous snapshot lives — a local state file for the CLI, a new `apis.mcp_snapshot jsonb` column here, since a hosted check has no local disk between runs. `fetchMcpTools` and `mcpDriftItemToDriftItem` were extracted out of the CLI's `checks.ts` into `lib/drift/mcp-diff.ts` so both consumers share one implementation instead of two. Wired into both `/api/apis/[id]/check` (manual) and `scripts/check-all-apis.ts` (scheduled hosted batch).

Building this surfaced a real, pre-existing bug in the *original* self-hosted CLI implementation too (not something this change introduced): on a brand-new API's first-ever MCP check, every tool got reported as a false `tool_added` drift item, since `diffMcpSnapshots([], current)` correctly says "everything is added" when there's nothing to compare against — but neither the CLI nor (initially) this new hosted path special-cased "this is just the initial baseline" the way baseline mode already does for its own first sample. Fixed in both places: a first-ever check now reports `ok` for every tool and just establishes the snapshot, exactly like baseline mode's first-sample-learns-not-diffs rule. A unit test written for the new hosted path caught this before it shipped anywhere.

Verified end-to-end against a real, local MCP server (not just mocked unit tests): added it as a real hosted+MCP API through the actual dashboard, ran a real "Check Now" and confirmed the fixed first-run behavior (`ok` on both tools, snapshot persisted correctly with two tools) via a fresh reload against the real Supabase row — the very first screenshot attempt was misleadingly stale from a test-harness race, worth re-verifying rather than trusting. Then restarted the test server with `search_orders`' `status` parameter changed from `enum` to `string` — the guide's own headline MCP example — and a second real check correctly flagged only that tool as drifting, with the unchanged `get_order` tool staying stable, drift detail reading exactly `wrongType on status (expected enum, got string)`.

## Insights (`app/dashboard/insights`, `lib/history/drift-frequency.ts`)

A cross-API ranked table — "which endpoints drift most often, across every API" — for the last 30 days. Deliberately a table, not a second charting subsystem: per the `dataviz` skill's own guidance, many rows of a ranked metric is a table's job, not a chart's. `buildDriftFrequencyRows` (pure, unit-tested) groups `check_runs` by endpoint, computes total checks / drift count / drift rate / most recent drift date, drops endpoints with zero checks in the window (nothing to rank yet), and sorts by drift count descending. The page fetches every visible endpoint with its parent API embedded in one query (`endpoints(...).select("id, path, method, apis(id, name)")`) and every relevant `check_run` in one more (`.in("endpoint_id", [...])`) rather than one query per endpoint. RLS-scoped like every other dashboard page — no query-level ownership filter needed.

Verified against real production data: renders QRDrop's real 112 checks per endpoint at a correct 0% drift rate (it has never drifted), no console errors.
