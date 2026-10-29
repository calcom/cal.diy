/**
 * Formats event type duration in a human-readable format.
 *
 * @param minutes - Duration in minutes (always an integer for event types)
 * @returns Formatted duration string (e.g., "30m", "1h", "1h 30m")
 *
 * @example
 * formatEventTypeDuration(30)  // "30m"
 * formatEventTypeDuration(60)  // "1h"
 * formatEventTypeDuration(90)  // "1h 30m"
 */
export function formatEventTypeDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Formats event type duration for screen readers (e.g., "30 minutes", "1 hour", "1 hour 30 minutes").
 * Avoids single-letter abbreviation mispronunciation ("30m" as "30 metres", "1h" as "one age").
 */
export function formatEventTypeDurationAccessible(
  minutes: number,
  t?: (key: string, options?: { count?: number }) => string
): string {
  if (minutes === 0) return t ? t("minute", { count: 0 }) : "0 minutes";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  const hourStr =
    hours > 0 ? (t ? t("hour", { count: hours }) : `${hours} ${hours === 1 ? "hour" : "hours"}`) : "";
  const minStr =
    remainingMinutes > 0
      ? t
        ? t("minute", { count: remainingMinutes })
        : `${remainingMinutes} ${remainingMinutes === 1 ? "minute" : "minutes"}`
      : "";

  if (hourStr && minStr) return `${hourStr} ${minStr}`;
  return hourStr || minStr;
}
