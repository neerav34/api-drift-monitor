import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  writeConfig,
  DEFAULT_CONFIG_PATH,
  type CheckerConfig,
  type CheckerEndpoint,
} from "./config";
import { renderWorkflowYaml } from "./workflow-template";

export interface InitOptions {
  baseUrl: string;
  specUrl?: string;
  specMode: "openapi" | "mcp" | "baseline";
  ingestUrl: string;
  /** Comma-separated "METHOD:path" pairs, e.g. "GET:/users/1,GET:/orders" -- baseline mode only. */
  endpoints?: string;
  cron?: string;
  configPath?: string;
  workflowPath?: string;
}

export interface InitResult {
  configPath: string;
  workflowPath: string;
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const configPath = options.configPath ?? DEFAULT_CONFIG_PATH;
  const workflowPath = options.workflowPath ?? ".github/workflows/api-drift-check.yml";

  const config: CheckerConfig = {
    baseUrl: options.baseUrl,
    specUrl: options.specUrl,
    specMode: options.specMode,
    ingestUrl: options.ingestUrl,
    endpoints: options.endpoints ? parseEndpoints(options.endpoints) : undefined,
  };
  await writeConfig(configPath, config);

  const yaml = renderWorkflowYaml({
    cron: options.cron ?? "0 * * * *",
    usesCache: config.specMode !== "openapi",
  });
  await mkdir(path.dirname(workflowPath), { recursive: true });
  await writeFile(workflowPath, yaml, "utf8");

  return { configPath, workflowPath };
}

function parseEndpoints(raw: string): CheckerEndpoint[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [method, ...rest] = entry.split(":");
      return { method: method.toUpperCase(), path: rest.join(":") };
    });
}
