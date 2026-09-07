import * as SwaggerParserModule from "@apidevtools/swagger-parser";
import type { AnySchemaObject } from "ajv";

const HTTP_METHODS = ["get", "head", "post", "put", "patch", "delete", "options"] as const;

export interface ExtractedEndpoint {
  path: string;
  method: string;
  operationId?: string;
  isMutating: boolean;
}

interface OpenApiOperation {
  operationId?: string;
  responses?: Record<
    string,
    { content?: Record<string, { schema?: AnySchemaObject }> }
  >;
}

interface DereferencedSpec {
  paths?: Record<string, Record<string, OpenApiOperation>>;
}

// @apidevtools/swagger-parser's `declare class` + `declare namespace` merge
// doesn't resolve under this project's `moduleResolution: bundler` --
// `dereference` type-checks as missing even though it exists at runtime (and
// under other resolution modes). Narrowed to the one static method we use,
// typed against our own DereferencedSpec, rather than fighting the upstream
// declaration file.
const SwaggerParser = SwaggerParserModule as unknown as {
  dereference(specUrl: string): Promise<DereferencedSpec>;
};

/** Walks every path/method in the spec so endpoints don't need to be manually entered. */
export async function extractEndpointsFromSpec(
  specUrl: string
): Promise<ExtractedEndpoint[]> {
  const api = await SwaggerParser.dereference(specUrl);
  const endpoints: ExtractedEndpoint[] = [];

  for (const [path, operations] of Object.entries(api.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = operations[method];
      if (!operation) continue;
      endpoints.push({
        path,
        method: method.toUpperCase(),
        operationId: operation.operationId,
        isMutating: !["get", "head"].includes(method),
      });
    }
  }

  return endpoints;
}

/** Response schema for one operation, used to diff a live response in hosted mode. */
export async function getResponseSchema(
  specUrl: string,
  path: string,
  method: string
): Promise<AnySchemaObject | undefined> {
  const api = await SwaggerParser.dereference(specUrl);
  const operation = api.paths?.[path]?.[method.toLowerCase()];
  const response = operation?.responses?.["200"] ?? operation?.responses?.default;
  return response?.content?.["application/json"]?.schema;
}
