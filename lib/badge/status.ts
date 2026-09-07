export interface BadgeInputs {
  endpointStatuses: string[];
  /** checked_at of the most recent non-ok run across the API's endpoints, if any. */
  lastBadRunAt: string | null;
  /** checked_at of the earliest run ever, used as the "stable since" baseline
   * when there's never been a bad run. */
  firstRunAt: string | null;
}

export interface BadgeState {
  color: "green" | "red" | "gray";
  message: string;
}

export function computeBadgeState(
  { endpointStatuses, lastBadRunAt, firstRunAt }: BadgeInputs,
  now: Date = new Date()
): BadgeState {
  if (endpointStatuses.length === 0) {
    return { color: "gray", message: "no data" };
  }

  const isHealthy = endpointStatuses.every((s) => s === "ok");
  if (!isHealthy) {
    return { color: "red", message: "drifting" };
  }

  const since = lastBadRunAt ?? firstRunAt;
  if (!since) return { color: "green", message: "stable" };

  const days = Math.max(
    0,
    Math.floor((now.getTime() - new Date(since).getTime()) / 86_400_000)
  );
  return { color: "green", message: `stable ${days}d` };
}
