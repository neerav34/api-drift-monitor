import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface CheckerEndpoint {
  path: string;
  method: string;
}

export interface CheckerConfig {
  baseUrl: string;
  specUrl?: string;
  specMode: "openapi" | "mcp" | "baseline";
  ingestUrl: string;
  /** Only used in baseline mode -- there's no spec to auto-discover endpoints
   * from, so the user names the ones they want watched. */
  endpoints?: CheckerEndpoint[];
}

export const DEFAULT_CONFIG_PATH = ".api-drift-check.json";

/** The webhook token is deliberately never written here -- it belongs in a
 * GitHub Actions secret, not a file that could end up committed. */
export async function readConfig(configPath: string): Promise<CheckerConfig> {
  const raw = await readFile(configPath, "utf8");
  return JSON.parse(raw) as CheckerConfig;
}

export async function writeConfig(
  configPath: string,
  config: CheckerConfig
): Promise<void> {
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function resolveConfigPath(configPath?: string): string {
  return path.resolve(process.cwd(), configPath ?? DEFAULT_CONFIG_PATH);
}
