const COLORS = {
  green: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400",
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400",
  gray: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
} as const;

/** Same red/green/gray rule as the embeddable badge (lib/badge/status.ts),
 * simplified for list/detail views that don't need the streak-day count. */
export function StatusPill({ endpointStatuses }: { endpointStatuses: string[] }) {
  const color =
    endpointStatuses.length === 0
      ? "gray"
      : endpointStatuses.every((s) => s === "ok")
        ? "green"
        : "red";

  const label =
    color === "gray" ? "No data" : color === "green" ? "Stable" : "Drifting";

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLORS[color]}`}>
      {label}
    </span>
  );
}
