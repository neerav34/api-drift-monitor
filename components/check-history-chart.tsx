"use client";

import { useId, useState } from "react";
import type { DayBucket, DayStatus } from "@/lib/history/daily-status";

/**
 * Fixed status palette -- these hexes clear 3:1 contrast on both light and
 * dark chart surfaces by design, so no dark-mode swap is needed. Never reuse
 * these for anything but status; never used as the sole carrier of meaning
 * (the legend below labels every one in text).
 */
const STATUS_META: Record<Exclude<DayStatus, "no-data">, { label: string; color: string }> = {
  good: { label: "Stable", color: "#0ca30c" },
  warning: { label: "Slow / timeout", color: "#fab219" },
  serious: { label: "Drift", color: "#ec835a" },
  critical: { label: "Error", color: "#d03b3b" },
};

const NO_DATA_LABEL = "No data";

function labelFor(status: DayStatus): string {
  return status === "no-data" ? NO_DATA_LABEL : STATUS_META[status].label;
}

function swatchClassName(status: DayStatus): string {
  return status === "no-data" ? "bg-neutral-200 dark:bg-neutral-800" : "";
}

function swatchStyle(status: DayStatus): React.CSSProperties | undefined {
  return status === "no-data" ? undefined : { backgroundColor: STATUS_META[status].color };
}

export function CheckHistoryChart({ buckets }: { buckets: DayBucket[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const detailId = useId();
  const active = activeIndex !== null ? buckets[activeIndex] : null;

  return (
    <div className="space-y-1.5">
      <div role="group" aria-label="Check history, last 30 days" className="flex gap-[2px]">
        {buckets.map((bucket, i) => {
          const countText =
            bucket.totalChecks > 0
              ? ` (${bucket.totalChecks} check${bucket.totalChecks === 1 ? "" : "s"}${
                  bucket.driftChecks > 0 ? `, ${bucket.driftChecks} drifted` : ""
                })`
              : "";
          const label = `${bucket.date}: ${labelFor(bucket.status)}${countText}`;

          return (
            <button
              key={bucket.date}
              type="button"
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex((cur) => (cur === i ? null : cur))}
              onFocus={() => setActiveIndex(i)}
              onBlur={() => setActiveIndex((cur) => (cur === i ? null : cur))}
              aria-describedby={detailId}
              aria-label={label}
              title={label}
              className={`h-6 w-3.5 shrink-0 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${swatchClassName(bucket.status)}`}
              style={swatchStyle(bucket.status)}
            />
          );
        })}
      </div>

      <p id={detailId} className="min-h-[1.25rem] text-xs text-neutral-500">
        {active ? (
          <>
            {active.date} — {labelFor(active.status)}
            {active.totalChecks > 0 &&
              ` · ${active.totalChecks} check${active.totalChecks === 1 ? "" : "s"}${
                active.driftChecks > 0 ? `, ${active.driftChecks} drifted` : ""
              }`}
          </>
        ) : (
          "Hover or focus a day for details."
        )}
      </p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
        {(["good", "warning", "serious", "critical", "no-data"] as DayStatus[]).map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <span
              className={`h-2.5 w-2.5 rounded-[2px] ${swatchClassName(status)}`}
              style={swatchStyle(status)}
            />
            {labelFor(status)}
          </span>
        ))}
      </div>
    </div>
  );
}
