const UNIT_MS: Record<string, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
};

/** Parses `apis.check_interval` (e.g. "1 hour", "30 minutes") into milliseconds. */
export function parseIntervalMs(interval: string): number {
  const match = interval.trim().match(/^(\d+)\s*(minute|hour|day)s?$/i);
  if (!match) return UNIT_MS.hour;
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit.toLowerCase()];
}
