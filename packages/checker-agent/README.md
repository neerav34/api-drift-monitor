# api-drift-check

Self-hosted checker for [API Drift Monitor](https://api-drift-monitor.vercel.app) — the CLI runs in *your own* CI, using *your own* secrets, and never sends your API credentials anywhere. It computes the drift diff locally and posts only a pass/fail result (plus the diff itself, no request/response bodies) to your dashboard.

## Quick start

```bash
npx api-drift-check init \
  --base-url https://api.example.com \
  --ingest-url https://api-drift-monitor.vercel.app/api/ingest \
  --spec-mode baseline \
  --endpoints "GET:/users/1,GET:/orders"
```

This writes two files to your repo:

- `.api-drift-check.json` — non-secret config (base URL, spec mode, ingest URL). The webhook token is deliberately **never** written here.
- `.github/workflows/api-drift-check.yml` — a scheduled workflow that runs `npx api-drift-check run` on your own GitHub Actions minutes.

Commit both, then add a repo secret named `API_DRIFT_WEBHOOK_TOKEN` (the token shown in your dashboard when you add the API) under **Settings → Secrets and variables → Actions**. Push, and the checker starts running on your schedule.

## Spec modes

| Mode | `--spec-mode` | What it needs | How it diffs |
|---|---|---|---|
| No spec | `baseline` | `--endpoints "METHOD:path,..."` | Learns a schema from the first 5 live samples of each endpoint, diffs against it on later runs. State persists across runs via `actions/cache`. |
| OpenAPI | `openapi` | `--spec-url <url>` | Extracts endpoints from the spec and diffs each live response against its documented schema, fetched fresh every run. |
| MCP server | `mcp` | just `--base-url` (the MCP server's JSON-RPC endpoint) | Snapshots `tools/list` and diffs it against the previous run's snapshot — there's no external spec to compare against for MCP servers. |

## `run`

Called by the generated workflow; you generally don't need to run this yourself. Exits non-zero if anything drifted, so a real regression shows up as a failed GitHub Actions run — not just a Slack ping that's easy to miss.

## Why self-hosted

Nobody wants to hand a stranger's SaaS their production API key. This CLI never asks: it runs where you already trust your code to run, and the only thing that crosses the network to the dashboard is a diff result.

See the main project's [README](https://github.com/neerav34/api-drift-monitor) for how the dashboard, hosted mode, and the rest of the system work.
