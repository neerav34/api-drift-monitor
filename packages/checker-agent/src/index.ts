#!/usr/bin/env node
import { Command } from "commander";
import { runInit } from "./init";
import { runChecks } from "./checks";
import { readConfig, resolveConfigPath } from "./config";
import { reportResults } from "./report";
import { DEFAULT_STATE_PATH } from "./state";

const program = new Command();

program
  .name("api-drift-check")
  .description(
    "Self-hosted checker for API Drift Monitor -- runs in your own CI, never sends your credentials anywhere."
  )
  .version("0.1.0");

program
  .command("init")
  .description("Scaffold a GitHub Actions workflow and local config for scheduled checks")
  .requiredOption("--base-url <url>", "Base URL of the API to monitor")
  .option("--spec-url <url>", "OpenAPI spec URL (required with --spec-mode openapi)")
  .option("--spec-mode <mode>", "openapi | mcp | baseline", "baseline")
  .requiredOption("--ingest-url <url>", "Your dashboard's /api/ingest URL")
  .option(
    "--endpoints <list>",
    "Comma-separated METHOD:path pairs, e.g. GET:/users/1,GET:/orders (baseline mode only)"
  )
  .option("--cron <expr>", "Cron schedule for the workflow", "0 * * * *")
  .option("--config <path>", "Where to write the local config file")
  .option("--workflow <path>", "Where to write the GitHub Actions workflow file")
  .action(async (opts) => {
    const specMode = parseSpecMode(opts.specMode);
    if (specMode === "openapi" && !opts.specUrl) {
      console.error("--spec-url is required when --spec-mode is openapi");
      process.exitCode = 1;
      return;
    }

    const { configPath, workflowPath } = await runInit({
      baseUrl: opts.baseUrl,
      specUrl: opts.specUrl,
      specMode,
      ingestUrl: opts.ingestUrl,
      endpoints: opts.endpoints,
      cron: opts.cron,
      configPath: opts.config,
      workflowPath: opts.workflow,
    });

    console.log(`Wrote ${configPath}`);
    console.log(`Wrote ${workflowPath}`);
    console.log("");
    console.log("Next steps:");
    console.log("  1. Commit both files to your repo.");
    console.log(
      "  2. In your repo's Settings -> Secrets and variables -> Actions, add a secret"
    );
    console.log("     named API_DRIFT_WEBHOOK_TOKEN with the token shown in your dashboard.");
    console.log("  3. Push -- the workflow runs on your own GitHub Actions minutes, on your schedule.");
  });

program
  .command("run")
  .description("Run one check and report the result -- called by the GitHub Actions workflow")
  .option("--config <path>", "Path to the local config file")
  .option("--state <path>", "Path to the local state file (baseline/MCP snapshot)")
  .action(async (opts) => {
    const token = process.env.API_DRIFT_WEBHOOK_TOKEN;
    if (!token) {
      console.error("API_DRIFT_WEBHOOK_TOKEN is not set -- add it as a GitHub Actions secret");
      process.exitCode = 1;
      return;
    }

    try {
      const config = await readConfig(resolveConfigPath(opts.config));
      const statePath = opts.state ?? DEFAULT_STATE_PATH;

      const results = await runChecks(config, statePath);

      console.log(`Checked ${results.length} endpoint(s):`);
      for (const r of results) {
        console.log(`  ${r.status === "ok" ? "✓" : "✗"} ${r.method} ${r.path} -- ${r.status}`);
      }

      await reportResults(config.ingestUrl, token, results);
      console.log("Reported results to the dashboard.");

      if (results.some((r) => r.status !== "ok")) {
        // Surfaces drift as a failed GitHub Actions run, not just a Slack
        // ping someone might have muted -- the run itself goes red.
        process.exitCode = 1;
      }
    } catch (err) {
      console.error(`api-drift-check run failed: ${err instanceof Error ? err.message : err}`);
      process.exitCode = 1;
    }
  });

function parseSpecMode(value: string): "openapi" | "mcp" | "baseline" {
  if (value === "openapi" || value === "mcp" || value === "baseline") return value;
  throw new Error(`--spec-mode must be one of openapi, mcp, baseline (got "${value}")`);
}

program.parseAsync(process.argv);
