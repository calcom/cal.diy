/**
 * Helpers of the `date` booking field: values are stored as `yyyy-MM-dd`, bounds accept an ISO
 * date or a date relative to today (`today`, `today+7d`, `today-30d`).
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RELATIVE_DATE = /^today(?:([+-])(\d+)d)?$/;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Parses a stored `yyyy-MM-dd` value (or any date string) to a local day, or null. */
export function parseDateFieldValue(value: string | null | undefined): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const iso = ISO_DATE.exec(trimmed);
  if (iso) {
    const [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    const date = new Date(year, month - 1, day);
    // Rejects overflowing dates such as 2026-02-31
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

/** Parses a bound (`today`, `today+7d`, `today-30d` or an ISO date) to a local day, or null. */
export function parseDateFieldBound(bound: string | null | undefined, now: Date = new Date()): Date | null {
  const trimmed = bound?.trim();
  if (!trimmed) return null;
  const relative = RELATIVE_DATE.exec(trimmed);
  if (relative) {
    const today = startOfDay(now);
    if (!relative[1]) return today;
    const days = Number(relative[2]) * (relative[1] === "+" ? 1 : -1);
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  }
  return parseDateFieldValue(trimmed);
}

/** Formats a local day as the stored `yyyy-MM-dd` value. */
export function formatDateFieldValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
