import type { TFunction } from "i18next";

/** Render X mins as X hours or X hours Y mins instead of in minutes once >= 60 minutes */
export const getDurationFormatted = (mins: number | undefined, t: TFunction) => {
  if (!mins) return null;

  const hours = Math.floor(mins / 60);
  mins %= 60;
  let minStr = "";
  if (mins > 0) {
    minStr =
      mins === 1
        ? t("minute_one_short", { count: 1 })
        : t("multiple_duration_timeUnit_short", { count: mins, unit: "minute" });
  }
  let hourStr = "";
  if (hours > 0) {
    hourStr =
      hours === 1
        ? t("hour_one_short", { count: 1 })
        : t("multiple_duration_timeUnit_short", { count: hours, unit: "hour" });
  }

  if (hourStr && minStr) return `${hourStr} ${minStr}`;
  return hourStr || minStr;
};

/** Full spoken form matching getDurationFormatted (e.g. "1 hour 30 minutes"). */
export const getDurationAccessibleLabel = (mins: number | undefined, t: TFunction) => {
  if (!mins) return null;

  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(t("hour", { count: hours }));
  }
  if (remainingMins > 0) {
    parts.push(t("minute", { count: remainingMins }));
  }

  return parts.join(" ") || null;
};

/** Minutes-only short display used on event-type cards (e.g. "90m"). */
export const getDurationMinutesFormatted = (mins: number | undefined, t: TFunction) => {
  if (!mins) return null;
  return mins === 1
    ? t("minute_one_short", { count: 1 })
    : t("multiple_duration_timeUnit_short", { count: mins, unit: "minute" });
};

/** Minutes-only accessible label for event-type cards (e.g. "90 minutes"). */
export const getDurationMinutesAccessibleLabel = (mins: number | undefined, t: TFunction) => {
  if (!mins) return null;
  return t("minute", { count: mins });
};
