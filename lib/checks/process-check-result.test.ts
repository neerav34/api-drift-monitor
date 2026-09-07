import { afterEach, describe, expect, it, vi } from "vitest";
import { processCheckResult, type ApiForProcessing } from "./process-check-result";

/**
 * Minimal fake of the supabase-js query builder covering exactly the calls
 * process-check-result.ts makes: .select().eq()...maybeSingle(), an insert
 * chained into .select().single(), and bare awaited select/insert/update
 * (supabase-js query builders are themselves thenable).
 */
function createFakeSupabase(seed: Record<string, Record<string, unknown>[]> = {}) {
  const store: Record<string, Record<string, unknown>[]> = {
    endpoints: [],
    drift_ignores: [],
    check_runs: [],
    ...seed,
  };
  let idCounter = 1;

  function from(table: string) {
    let filters: Array<[string, unknown]> = [];
    let mode: "select" | "insert" | "update" = "select";
    let payload: Record<string, unknown> | undefined;

    function matches(row: Record<string, unknown>) {
      return filters.every(([col, val]) => row[col] === val);
    }

    function run(): { data: unknown; error: null } {
      if (mode === "insert") {
        const row = { id: `id-${idCounter++}`, ...payload };
        store[table].push(row);
        return { data: row, error: null };
      }
      if (mode === "update") {
        store[table] = store[table].map((row) =>
          matches(row) ? { ...row, ...payload } : row
        );
        return { data: null, error: null };
      }
      return { data: store[table].filter(matches), error: null };
    }

    const builder = {
      select() {
        return builder;
      },
      insert(data: Record<string, unknown>) {
        mode = "insert";
        payload = data;
        return builder;
      },
      update(data: Record<string, unknown>) {
        mode = "update";
        payload = data;
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return builder;
      },
      maybeSingle: async () => {
        const { data } = run() as { data: Record<string, unknown>[] };
        return { data: (data as Record<string, unknown>[])[0] ?? null, error: null };
      },
      single: async () => run(),
      then(resolve: (v: { data: unknown; error: null }) => void) {
        resolve(run());
      },
    };
    return builder;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from, _store: store } as any;
}

const api: ApiForProcessing = {
  id: "api-1",
  name: "Orders API",
  github_repo: null,
  alert_webhook: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("processCheckResult", () => {
  it("creates an endpoint and records an ok check run when there's no drift", async () => {
    const supabase = createFakeSupabase();
    const result = await processCheckResult(supabase, api, {
      path: "/users/{id}",
      method: "GET",
      status: "ok",
    });

    expect(result.status).toBe("ok");
    expect(supabase._store.endpoints).toHaveLength(1);
    expect(supabase._store.check_runs[0]).toMatchObject({ status: "ok" });
  });

  it("reuses the existing endpoint on a second check instead of creating a duplicate", async () => {
    const supabase = createFakeSupabase();
    await processCheckResult(supabase, api, { path: "/users/{id}", method: "GET", status: "ok" });
    await processCheckResult(supabase, api, { path: "/users/{id}", method: "GET", status: "ok" });
    expect(supabase._store.endpoints).toHaveLength(1);
    expect(supabase._store.check_runs).toHaveLength(2);
  });

  it("downgrades status to ok when every drifted field is on the ignore list", async () => {
    const endpointId = "endpoint-1";
    const supabase = createFakeSupabase({
      endpoints: [{ id: endpointId, api_id: api.id, path: "/users/{id}", method: "GET" }],
      drift_ignores: [{ endpoint_id: endpointId, field_path: "email" }],
    });

    const result = await processCheckResult(supabase, api, {
      path: "/users/{id}",
      method: "GET",
      status: "drift",
      drift: [{ type: "missing", field: "email" }],
    });

    expect(result.status).toBe("ok");
    expect(supabase._store.check_runs[0].drift_details).toBeNull();
  });

  it("fires a Slack alert when unignored drift survives filtering", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const apiWithWebhook: ApiForProcessing = {
      ...api,
      alert_webhook: "https://hooks.slack.test/xyz",
    };
    const supabase = createFakeSupabase();

    const result = await processCheckResult(supabase, apiWithWebhook, {
      path: "/users/{id}",
      method: "GET",
      status: "drift",
      drift: [{ type: "missing", field: "email" }],
    });

    expect(result.status).toBe("drift");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.slack.test/xyz",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("does not alert when the webhook fails, but still records the check run", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const apiWithWebhook: ApiForProcessing = {
      ...api,
      alert_webhook: "https://hooks.slack.test/broken",
    };
    const supabase = createFakeSupabase();

    const result = await processCheckResult(supabase, apiWithWebhook, {
      path: "/users/{id}",
      method: "GET",
      status: "drift",
      drift: [{ type: "missing", field: "email" }],
    });

    expect(result.status).toBe("drift");
    expect(supabase._store.check_runs).toHaveLength(1);
  });
});
