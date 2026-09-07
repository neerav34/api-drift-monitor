import { diffResponseAgainstSchema } from "@/lib/drift/diff";
import { getResponseSchema } from "@/lib/drift/openapi";
import { decryptAuthHeader } from "@/lib/crypto/encrypt";
import { buildEndpointUrl } from "@/lib/http/build-url";
import type { RawCheckResult } from "./process-check-result";

export interface EndpointToCheck {
  path: string;
  method: string;
  is_mutating: boolean;
  baseline_schema: Record<string, unknown> | null;
}

export interface HostedCheckApi {
  base_url: string;
  spec_url: string | null;
  spec_mode: "openapi" | "mcp" | "baseline";
  auth_header_enc: string | null; // Postgres bytea, arrives as "\\x<hex>"
}

/**
 * Performs one live GET/HEAD check in hosted mode. Callers must filter out
 * mutating endpoints before calling this -- per the safe-method-default
 * guardrail, hosted mode never hits a mutating endpoint automatically, so
 * this throws rather than silently downgrading a caller bug into a skipped
 * check.
 */
export async function runHostedCheck(
  api: HostedCheckApi,
  endpoint: EndpointToCheck
): Promise<RawCheckResult> {
  if (endpoint.is_mutating) {
    throw new Error(
      `runHostedCheck must not be called for a mutating endpoint (${endpoint.method} ${endpoint.path})`
    );
  }

  const url = buildEndpointUrl(api.base_url, endpoint.path);
  const headers = api.auth_header_enc ? decodeAuthHeader(api.auth_header_enc) : {};

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(url, { method: endpoint.method, headers });
  } catch {
    return {
      path: endpoint.path,
      method: endpoint.method,
      status: "timeout",
      responseTimeMs: Date.now() - startedAt,
    };
  }
  const responseTimeMs = Date.now() - startedAt;

  const schema = await resolveSchema(api, endpoint);
  const body = schema ? await safeJson(response) : undefined;

  if (!schema || body === undefined) {
    return {
      path: endpoint.path,
      method: endpoint.method,
      status: "ok",
      responseStatusCode: response.status,
      responseTimeMs,
    };
  }

  const { drift, status } = diffResponseAgainstSchema(schema, body);
  return {
    path: endpoint.path,
    method: endpoint.method,
    status,
    responseStatusCode: response.status,
    responseTimeMs,
    drift,
  };
}

async function resolveSchema(api: HostedCheckApi, endpoint: EndpointToCheck) {
  if (endpoint.baseline_schema) return endpoint.baseline_schema;
  if (api.spec_mode !== "openapi" || !api.spec_url) return undefined;
  try {
    return await getResponseSchema(api.spec_url, endpoint.path, endpoint.method);
  } catch (err) {
    console.error("Failed to resolve OpenAPI response schema:", err);
    return undefined;
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function decodeAuthHeader(pgBytea: string): Record<string, string> {
  const hex = pgBytea.startsWith("\\x") ? pgBytea.slice(2) : pgBytea;
  const raw = decryptAuthHeader(Buffer.from(hex, "hex"));
  const sep = raw.indexOf(": ");
  if (sep === -1) return { Authorization: raw };
  return { [raw.slice(0, sep)]: raw.slice(sep + 2) };
}
