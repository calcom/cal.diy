import type { TFunction } from "i18next";

/**
 * Returns a short formatted string for duration (e.g. "30m", "1h", "1h 30m").
 */
export const getDurationFormatted = (mins: number | undefined | null, t?: TFunction): string | null => {
  if (!mins && mins !== 0) return null;

  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;

  let minStr = "";
  if (remainingMins > 0) {
    if (t) {
      minStr =
        remainingMins === 1
          ? t("minute_one_short", { count: 1 })
          : t("multiple_duration_timeUnit_short", { count: remainingMins, unit: "minute" });
    } else {
      minStr = `${remainingMins}m`;
    }
  }

  let hourStr = "";
  if (hours > 0) {
    if (t) {
      hourStr =
        hours === 1
          ? t("hour_one_short", { count: 1 })
          : t("multiple_duration_timeUnit_short", { count: hours, unit: "hour" });
    } else {
      hourStr = `${hours}h`;
    }
  }

  if (hourStr && minStr) return `${hourStr} ${minStr}`;
  return hourStr || minStr || (mins === 0 ? (t ? t("minute_one_short", { count: 0 }) : "0m") : null);
};

/**
 * Spells out the duration in full for screen readers (e.g. "30 minutes", "1 hour", "1 hour 30 minutes").
 * Prevents screen readers like VoiceOver from misreading abbreviations ("30m" as "30 metres", "1h" as "one age").
 */
export const getDurationAccessibleLabel = (
  mins: number | undefined | null,
  t?: TFunction
): string | undefined => {
  if (mins === undefined || mins === null) return undefined;
  if (mins === 0) return t ? t("minute", { count: 0 }) : "0 minutes";

  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;

  let minStr = "";
  if (remainingMins > 0) {
    minStr = t
      ? t("minute", { count: remainingMins })
      : `${remainingMins} ${remainingMins === 1 ? "minute" : "minutes"}`;
  }

  let hourStr = "";
  if (hours > 0) {
    hourStr = t
      ? t("hour", { count: hours })
      : `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  if (hourStr && minStr) return `${hourStr} ${minStr}`;
  return hourStr || minStr;
};
