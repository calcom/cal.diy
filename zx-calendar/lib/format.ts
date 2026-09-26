/** Formats an instant in a specific IANA time zone (server-side emails can't use the viewer's zone). */
export function formatInTimeZone(date: Date, timeZone: string, style: "long" | "time"): string {
  const options: Intl.DateTimeFormatOptions =
    style === "long"
      ? { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
      : { timeZone, hour: "numeric", minute: "2-digit" };
  try {
    return new Intl.DateTimeFormat("en-US", options).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(date);
  }
}
