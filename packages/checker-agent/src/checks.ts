import type { AnySchemaObject } from "ajv";
import { diffResponseAgainstSchema, type DriftItem } from "../../../lib/drift/diff";
import { extractEndpointsFromSpec, getResponseSchema } from "../../../lib/drift/openapi";
import { learnBaselineSchema } from "../../../lib/drift/baseline";
import { diffMcpSnapshots, type McpToolSnapshot, type McpDriftItem } from "../../../lib/drift/mcp-diff";
import { buildEndpointUrl } from "../../../lib/http/build-url";
import type { RawCheckResult } from "../../../lib/checks/process-check-result";
import type { CheckerConfig } from "./config";
import { readState, writeState, type CheckerState } from "./state";

const BASELINE_SAMPLE_COUNT = 5;

/**
 * Runs whichever check the config's spec_mode calls for and persists any
 * state (learned baselines, the last MCP snapshot) needed for the next run.
 * This -- not the ingest endpoint -- is where the actual diffing happens
 * for self-hosted checks: only the result crosses the network to the
 * dashboard.
 */
export async function runChecks(
  config: CheckerConfig,
  statePath: string
): Promise<RawCheckResult[]> {
  const state = await readState(statePath);

  const results =
    config.specMode === "openapi"
      ? await runOpenApiChecks(config)
      : config.specMode === "baseline"
        ? await runBaselineChecks(config, state)
        : await runMcpCheck(config, state);

  await writeState(statePath, state);
  return results;
}

async function runOpenApiChecks(config: CheckerConfig): Promise<RawCheckResult[]> {
  if (!config.specUrl) {
    throw new Error('spec_mode "openapi" requires "specUrl" in the config');
  }
  const specUrl = config.specUrl;
  const endpoints = (await extractEndpointsFromSpec(specUrl)).filter((e) => !e.isMutating);

  const results: RawCheckResult[] = [];
  for (const endpoint of endpoints) {
    results.push(
      await checkOneEndpoint(config, endpoint.path, endpoint.method, async (body) => {
        try {
          const schema = await getResponseSchema(specUrl, endpoint.path, endpoint.method);
          return schema ? diffResponseAgainstSchema(schema, body).drift : [];
        } catch {
          return [];
        }
      })
    );
  }
  return results;
}

async function runBaselineChecks(
  config: CheckerConfig,
  state: CheckerState
): Promise<RawCheckResult[]> {
  const endpoints = config.endpoints ?? [];
  if (endpoints.length === 0) {
    throw new Error(
      'spec_mode "baseline" requires "endpoints" in the config -- there\'s no spec to discover them from'
    );
  }
  state.baselines ??= {};

  const results: RawCheckResult[] = [];
  for (const endpoint of endpoints) {
    const key = `${endpoint.method} ${endpoint.path}`;
    const existingBaseline = state.baselines[key];

    if (!existingBaseline) {
      const samples = await collectSamples(config.baseUrl, endpoint.path, endpoint.method);
      if (samples.length > 0) {
        state.baselines[key] = learnBaselineSchema(samples);
      }
      // First run for this endpoint: nothing to diff against yet.
      results.push({ path: endpoint.path, method: endpoint.method, status: "ok" });
      continue;
    }

    results.push(
      await checkOneEndpoint(config, endpoint.path, endpoint.method, async (body) =>
        diffResponseAgainstSchema(existingBaseline as AnySchemaObject, body).drift
      )
    );
  }
  return results;
}

async function collectSamples(
  baseUrl: string,
  path: string,
  method: string
): Promise<unknown[]> {
  const samples: unknown[] = [];
  for (let i = 0; i < BASELINE_SAMPLE_COUNT; i++) {
    try {
      const res = await fetch(buildEndpointUrl(baseUrl, path), { method });
      samples.push(await res.json());
    } catch {
      // Skip a failed sample -- learn from whatever came back.
    }
  }
  return samples;
}

async function runMcpCheck(
  config: CheckerConfig,
  state: CheckerState
): Promise<RawCheckResult[]> {
  const current = await fetchMcpTools(config.baseUrl);
  const previous = state.mcpSnapshot ?? [];
  const drift = diffMcpSnapshots(previous, current);
  state.mcpSnapshot = current;

  const toolNames = new Set([...previous.map((t) => t.name), ...current.map((t) => t.name)]);

  return [...toolNames].map((name) => {
    const toolDrift = drift.filter((d) => d.tool === name).map(toDriftItem);
    return {
      path: `tool:${name}`,
      method: "MCP",
      status: toolDrift.length > 0 ? "drift" : "ok",
      drift: toolDrift,
    };
  });
}

async function fetchMcpTools(baseUrl: string): Promise<McpToolSnapshot[]> {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  if (!res.ok) throw new Error(`MCP tools/list request failed: ${res.status}`);
  const body = (await res.json()) as { result?: { tools?: McpToolSnapshot[] } };
  return body.result?.tools ?? [];
}

function toDriftItem(item: McpDriftItem): DriftItem {
  const field = item.field ?? item.tool;
  switch (item.type) {
    case "tool_removed":
    case "param_removed":
      return { type: "missing", field };
    case "param_type_changed":
      return { type: "wrongType", field, expected: item.expected, got: item.got };
    default:
      return { type: "invalid", field, expected: item.type };
  }
}

async function checkOneEndpoint(
  config: CheckerConfig,
  endpointPath: string,
  method: string,
  computeDrift: (body: unknown) => Promise<DriftItem[]>
): Promise<RawCheckResult> {
  const url = buildEndpointUrl(config.baseUrl, endpointPath);
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(url, { method });
  } catch {
    return {
      path: endpointPath,
      method,
      status: "timeout",
      responseTimeMs: Date.now() - startedAt,
    };
  }
  const responseTimeMs = Date.now() - startedAt;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      path: endpointPath,
      method,
      status: "ok",
      responseStatusCode: response.status,
      responseTimeMs,
    };
  }

  const drift = await computeDrift(body);
  return {
    path: endpointPath,
    method,
    status: drift.length > 0 ? "drift" : "ok",
    responseStatusCode: response.status,
    responseTimeMs,
    drift,
  };
}
