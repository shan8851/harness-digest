// Months, the harness's unit of time since December 2026. Scans file what
// they find under the month they ran in; on the 1st, the issue covers the
// month before. Keys are "YYYY-MM", so they sort and name files cleanly.
// Everything is UTC, like the workflows' cron schedules.

/** "2026-11" for any moment in November 2026 (UTC). */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The month before the one `date` falls in: what the issue sent on the 1st covers. */
export function previousMonth(date: Date): string {
  return monthKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)));
}

/** "November 2026", for the issue's title and email subject. */
export function monthName(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
