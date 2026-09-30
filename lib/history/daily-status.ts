export type DayStatus = "good" | "warning" | "serious" | "critical" | "no-data";

export interface DayBucket {
  /** UTC date, "YYYY-MM-DD". */
  date: string;
  status: DayStatus;
  totalChecks: number;
  driftChecks: number;
}

export interface CheckRunForHistory {
  status: string;
  checked_at: string;
}

const SEVERITY_RANK: Record<string, number> = {
  error: 4,
  drift: 3,
  timeout: 2,
  ok: 1,
};

const DAY_STATUS_FOR_CHECK_STATUS: Record<string, DayStatus> = {
  error: "critical",
  drift: "serious",
  timeout: "warning",
  ok: "good",
};

/**
 * Buckets check_runs into one status per UTC day for the last `days` days
 * (oldest first, so the strip reads left-to-right as past-to-present).
 * A day with runs picks the *worst* status seen that day, not the last one
 * -- a single drift shouldn't get hidden behind a later "ok" retry. A day
 * with no runs at all is "no-data", never assumed healthy.
 */
export function buildDailyHistory(
  checkRuns: CheckRunForHistory[],
  days: number,
  now: Date = new Date()
): DayBucket[] {
  const byDay = new Map<string, CheckRunForHistory[]>();
  for (const run of checkRuns) {
    const day = run.checked_at.slice(0, 10);
    const existing = byDay.get(day);
    if (existing) existing.push(run);
    else byDay.set(day, [run]);
  }

  const buckets: DayBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    const runs = byDay.get(date) ?? [];

    if (runs.length === 0) {
      buckets.push({ date, status: "no-data", totalChecks: 0, driftChecks: 0 });
      continue;
    }

    let worst = runs[0].status;
    for (const run of runs) {
      if ((SEVERITY_RANK[run.status] ?? 0) > (SEVERITY_RANK[worst] ?? 0)) {
        worst = run.status;
      }
    }

    buckets.push({
      date,
      status: DAY_STATUS_FOR_CHECK_STATUS[worst] ?? "good",
      totalChecks: runs.length,
      driftChecks: runs.filter((r) => r.status === "drift").length,
    });
  }

  return buckets;
}
