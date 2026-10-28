// Convert an ISO instant to the value a <input type="datetime-local"> expects:
// LOCAL wall-clock time with no zone suffix. Slicing the ISO string instead
// would show UTC, and saving it back would shift the deadline by the UTC
// offset (2 hours in South Africa) on every edit.
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// YYYY-MM-DD in local time, for <input type="date"> and date-range filters.
export function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Inclusive local-day range check for report filters ("" = open-ended).
export function inDateRange(iso: string, from: string, to: string): boolean {
  const t = new Date(iso).getTime();
  if (from && t < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && t > new Date(`${to}T23:59:59.999`).getTime()) return false;
  return true;
}
