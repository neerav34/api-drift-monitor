/**
 * Joins a base URL with an OpenAPI-style path, filling `{param}` segments
 * with a placeholder since checks hit a representative resource, not a
 * specific one. Shared between the hosted checker and the self-hosted CLI
 * so the two can't drift apart on how a URL gets built.
 */
export function buildEndpointUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const filled = path.replace(/\{[^}]+\}/g, "1");
  return `${base}${filled.startsWith("/") ? "" : "/"}${filled}`;
}
