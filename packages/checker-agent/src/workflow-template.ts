export interface WorkflowTemplateOptions {
  cron: string;
  usesCache: boolean; // baseline/mcp modes need state to persist across runs
}

/**
 * The whole trust pitch in one file: this runs on the user's own GitHub
 * Actions minutes, with their own repo secrets, and never sends the
 * webhook token or any response body anywhere but their own runner and our
 * ingest endpoint (which only ever receives a diff result).
 */
export function renderWorkflowYaml({ cron, usesCache }: WorkflowTemplateOptions): string {
  const cacheSteps = usesCache
    ? `
      - name: Restore checker state (baseline / MCP snapshot)
        uses: actions/cache@v4
        with:
          path: .api-drift-check-state.json
          key: api-drift-check-state-\${{ github.repository }}
          restore-keys: api-drift-check-state-`
    : "";

  return `name: API Drift Check

on:
  schedule:
    - cron: "${cron}"
  workflow_dispatch: {}

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
${cacheSteps}
      - name: Run api-drift-check
        env:
          API_DRIFT_WEBHOOK_TOKEN: \${{ secrets.API_DRIFT_WEBHOOK_TOKEN }}
        run: npx api-drift-check run
`;
}
