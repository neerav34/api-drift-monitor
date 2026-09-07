import Ajv, { type AnySchemaObject, type ErrorObject } from "ajv";
import addFormats from "ajv-formats";

export interface DriftItem {
  type: "missing" | "wrongType" | "wrongFormat" | "invalid";
  field: string;
  expected?: string;
  got?: string;
}

export interface DiffResult {
  status: "ok" | "drift";
  drift: DriftItem[];
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

/**
 * Compares a live response body against a JSON Schema (from an OpenAPI spec
 * response, or a learned baseline) and returns the fields that drifted.
 * `ignoredFields` are dot-path entries from `drift_ignores` for this
 * endpoint -- they're dropped before status is computed, which is what lets
 * the noise-filter allowlist actually silence a field going forward.
 */
export function diffResponseAgainstSchema(
  schema: AnySchemaObject,
  data: unknown,
  ignoredFields: string[] = []
): DiffResult {
  const validate = ajv.compile(schema);
  const valid = validate(data);
  const rawDrift = valid ? [] : (validate.errors ?? []).map((err) => toDriftItem(err, data));
  const drift = filterDrift(rawDrift, ignoredFields);

  return { status: drift.length > 0 ? "drift" : "ok", drift };
}

/**
 * Drops drift items whose field path is in `ignoredFields`. Exported
 * separately so the ingest endpoint can re-apply the noise filter
 * server-side against whatever raw drift a checker (self-hosted or hosted)
 * reports, without re-running ajv -- the ignore list lives in the DB, which
 * a self-hosted checker running in someone else's CI has no access to.
 */
export function filterDrift(items: DriftItem[], ignoredFields: string[] = []): DriftItem[] {
  const ignored = new Set(ignoredFields);
  return items.filter((item) => !ignored.has(item.field));
}

function toDriftItem(err: ErrorObject, data: unknown): DriftItem {
  switch (err.keyword) {
    case "required": {
      const missingProperty = (err.params as { missingProperty: string })
        .missingProperty;
      return {
        type: "missing",
        field: normalizeFieldPath(err.instancePath, missingProperty),
      };
    }
    case "type": {
      const { type } = err.params as { type: string };
      return {
        type: "wrongType",
        field: normalizeFieldPath(err.instancePath),
        expected: type,
        got: typeof getAtPath(data, err.instancePath),
      };
    }
    case "format": {
      const { format } = err.params as { format: string };
      return {
        type: "wrongFormat",
        field: normalizeFieldPath(err.instancePath),
        expected: format,
      };
    }
    default:
      return {
        type: "invalid",
        field: normalizeFieldPath(err.instancePath),
        expected: err.keyword,
      };
  }
}

function normalizeFieldPath(instancePath: string, extra?: string): string {
  const parts = instancePath.split("/").filter(Boolean);
  if (extra) parts.push(extra);
  return parts.join(".");
}

function getAtPath(data: unknown, instancePath: string): unknown {
  const parts = instancePath.split("/").filter(Boolean);
  let current: unknown = data;
  for (const part of parts) {
    if (current == null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
