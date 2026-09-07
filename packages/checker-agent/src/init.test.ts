import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "./init";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "api-drift-check-init-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("runInit", () => {
  it("writes a config file with the given options and a matching workflow", async () => {
    const configPath = path.join(dir, ".api-drift-check.json");
    const workflowPath = path.join(dir, ".github/workflows/api-drift-check.yml");

    await runInit({
      baseUrl: "https://api.example.com",
      specMode: "baseline",
      ingestUrl: "https://dashboard.example.com/api/ingest",
      endpoints: "GET:/users/1, get:/orders",
      configPath,
      workflowPath,
    });

    const config = JSON.parse(await readFile(configPath, "utf8"));
    expect(config).toEqual({
      baseUrl: "https://api.example.com",
      specMode: "baseline",
      ingestUrl: "https://dashboard.example.com/api/ingest",
      endpoints: [
        { method: "GET", path: "/users/1" },
        { method: "GET", path: "/orders" },
      ],
    });

    const workflow = await readFile(workflowPath, "utf8");
    expect(workflow).toContain('cron: "0 * * * *"');
    expect(workflow).toContain("npx api-drift-check run");
    expect(workflow).toContain("actions/cache@v4"); // baseline mode needs persisted state
  });

  it("skips the state-cache step for openapi mode, which has nothing to persist", async () => {
    const workflowPath = path.join(dir, "workflow.yml");
    await runInit({
      baseUrl: "https://api.example.com",
      specUrl: "https://api.example.com/openapi.json",
      specMode: "openapi",
      ingestUrl: "https://dashboard.example.com/api/ingest",
      configPath: path.join(dir, "config.json"),
      workflowPath,
    });

    const workflow = await readFile(workflowPath, "utf8");
    expect(workflow).not.toContain("actions/cache@v4");
  });

  it("never writes a webhook token to disk", async () => {
    const configPath = path.join(dir, "config.json");
    await runInit({
      baseUrl: "https://api.example.com",
      specMode: "baseline",
      ingestUrl: "https://dashboard.example.com/api/ingest",
      endpoints: "GET:/x",
      configPath,
      workflowPath: path.join(dir, "workflow.yml"),
    });

    const raw = await readFile(configPath, "utf8");
    expect(raw.toLowerCase()).not.toContain("token");
  });
});
