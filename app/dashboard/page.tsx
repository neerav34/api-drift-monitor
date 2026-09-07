import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/status-pill";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: apis } = await supabase
    .from("apis")
    .select("id, name, base_url, check_mode, is_active, endpoints(last_status)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your APIs</h1>
        <Link
          href="/dashboard/apis/new"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
        >
          Add API
        </Link>
      </div>

      {!apis || apis.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No APIs yet. Add one to start monitoring.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {apis.map((api) => (
            <li key={api.id}>
              <Link
                href={`/dashboard/apis/${api.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <div>
                  <p className="text-sm font-medium">{api.name}</p>
                  <p className="text-xs text-neutral-500">{api.base_url}</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-neutral-500">
                    {api.check_mode === "hosted" ? "Hosted" : "Self-hosted"}
                  </span>
                  <StatusPill
                    endpointStatuses={(api.endpoints ?? []).map(
                      (e: { last_status: string }) => e.last_status
                    )}
                  />
                  {!api.is_active && (
                    <span className="text-neutral-400">Paused</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
