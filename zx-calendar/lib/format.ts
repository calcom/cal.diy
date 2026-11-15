/** Z is in Pacific time; XOE and the team are in the Philippines. */
export const DEFAULT_TIME_ZONES = ["America/Los_Angeles", "Asia/Manila"] as const;

// Intl only knows "GMT+8" for Manila, which reads oddly next to "PDT".
const ZONE_ABBREVIATIONS: Record<string, string> = { "Asia/Manila": "PHT" };

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Parses a comma-separated list like "America/Los_Angeles,Asia/Manila", dropping invalid zones. */
export function parseTimeZones(value: string | undefined): string[] {
  const zones = (value ?? "")
    .split(",")
    .map((z) => z.trim())
    .filter((z) => z && isValidTimeZone(z));
  return zones.length ? [...new Set(zones)] : [...DEFAULT_TIME_ZONES];
}

function zoneLabel(date: Date, timeZone: string): string {
  if (ZONE_ABBREVIATIONS[timeZone]) return ZONE_ABBREVIATIONS[timeZone];
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

/** Formats an instant in a specific IANA time zone (server-side emails can't use the viewer's zone). */
export function formatInTimeZone(date: Date, timeZone: string, style: "long" | "time"): string {
  const options: Intl.DateTimeFormatOptions =
    style === "long"
      ? { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
      : { timeZone, hour: "numeric", minute: "2-digit" };
  return new Intl.DateTimeFormat("en-US", options).format(date);
}

/** "Mon, Sep 28, 5:00 PM – 5:30 PM PDT" — one line per zone. */
export function formatRangeInZones(start: Date, end: Date, zones: string[]): string[] {
  return zones.map(
    (zone) =>
      `${formatInTimeZone(start, zone, "long")} – ${formatInTimeZone(end, zone, "time")} ${zoneLabel(start, zone)}`
  );
}
