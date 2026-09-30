export interface EndpointForFrequency {
  id: string;
  path: string;
  method: string;
  apiId: string;
  apiName: string;
}

export interface CheckRunForFrequency {
  endpoint_id: string;
  status: string;
  checked_at: string;
}

export interface DriftFrequencyRow {
  apiId: string;
  apiName: string;
  endpointId: string;
  path: string;
  method: string;
  totalChecks: number;
  driftChecks: number;
  /** 0-1 */
  driftRate: number;
  lastDriftAt: string | null;
}

/**
 * Ranks endpoints by how often they've actually drifted in the window,
 * across every API the caller can see -- "which endpoints drift most
 * often" is a many-rows ranked-metric question, which the dataviz skill's
 * own guidance treats as a table's job, not a chart's. Endpoints with zero
 * checks in the window are dropped rather than shown as a 0% row -- there's
 * nothing to rank yet.
 */
export function buildDriftFrequencyRows(
  endpoints: EndpointForFrequency[],
  checkRuns: CheckRunForFrequency[]
): DriftFrequencyRow[] {
  const byEndpoint = new Map<string, CheckRunForFrequency[]>();
  for (const run of checkRuns) {
    const existing = byEndpoint.get(run.endpoint_id);
    if (existing) existing.push(run);
    else byEndpoint.set(run.endpoint_id, [run]);
  }

  return endpoints
    .map((endpoint) => {
      const runs = byEndpoint.get(endpoint.id) ?? [];
      const driftRuns = runs.filter((r) => r.status === "drift");
      const lastDriftAt = driftRuns.reduce<string | null>(
        (latest, r) => (!latest || r.checked_at > latest ? r.checked_at : latest),
        null
      );

      return {
        apiId: endpoint.apiId,
        apiName: endpoint.apiName,
        endpointId: endpoint.id,
        path: endpoint.path,
        method: endpoint.method,
        totalChecks: runs.length,
        driftChecks: driftRuns.length,
        driftRate: runs.length > 0 ? driftRuns.length / runs.length : 0,
        lastDriftAt,
      };
    })
    .filter((row) => row.totalChecks > 0)
    .sort((a, b) => b.driftChecks - a.driftChecks || b.driftRate - a.driftRate);
}
