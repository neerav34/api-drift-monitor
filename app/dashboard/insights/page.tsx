import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buildDriftFrequencyRows, type EndpointForFrequency } from "@/lib/history/drift-frequency";

const WINDOW_DAYS = 30;

interface EndpointRow {
  id: string;
  path: string;
  method: string;
  apis: { id: string; name: string } | { id: string; name: string }[] | null;
}

export default async function InsightsPage() {
  const supabase = await createClient();

  const { data: endpointRows } = await supabase
    .from("endpoints")
    .select("id, path, method, apis(id, name)")
    .returns<EndpointRow[]>();

  const endpoints: EndpointForFrequency[] = (endpointRows ?? []).flatMap((row) => {
    const api = Array.isArray(row.apis) ? row.apis[0] : row.apis;
    if (!api) return [];
    return [{ id: row.id, path: row.path, method: row.method, apiId: api.id, apiName: api.name }];
  });

  let rows: ReturnType<typeof buildDriftFrequencyRows> = [];
  if (endpoints.length > 0) {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - (WINDOW_DAYS - 1));
    const { data: checkRuns } = await supabase
      .from("check_runs")
      .select("endpoint_id, status, checked_at")
      .in(
        "endpoint_id",
        endpoints.map((e) => e.id)
      )
      .gte("checked_at", since.toISOString());

    rows = buildDriftFrequencyRows(endpoints, checkRuns ?? []);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Insights</h1>
        <p className="text-sm text-neutral-500">
          Which endpoints drift most often, across every API — last {WINDOW_DAYS} days.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No checks recorded yet in the last {WINDOW_DAYS} days.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs text-neutral-500 dark:border-neutral-800">
                <th className="px-4 py-2 font-medium">API</th>
                <th className="px-4 py-2 font-medium">Endpoint</th>
                <th className="px-4 py-2 font-medium">Checks</th>
                <th className="px-4 py-2 font-medium">Drifted</th>
                <th className="px-4 py-2 font-medium">Drift rate</th>
                <th className="px-4 py-2 font-medium">Last drift</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.endpointId}
                  className="border-b border-neutral-200 last:border-0 dark:border-neutral-800"
                >
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/apis/${row.apiId}`} className="underline">
                      {row.apiName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {row.method} {row.path}
                  </td>
                  <td className="px-4 py-2">{row.totalChecks}</td>
                  <td className="px-4 py-2">{row.driftChecks}</td>
                  <td className="px-4 py-2">{Math.round(row.driftRate * 100)}%</td>
                  <td className="px-4 py-2 text-neutral-500">
                    {row.lastDriftAt ? new Date(row.lastDriftAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
