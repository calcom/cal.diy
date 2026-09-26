import type { TFunction } from "i18next";

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

/** Spoken form for screen readers; keeps short display abbreviations from being read as metres/age. */
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

export const getDurationMinutesFormatted = (mins: number | undefined, t: TFunction) => {
  if (!mins) return null;
  return mins === 1
    ? t("minute_one_short", { count: 1 })
    : t("multiple_duration_timeUnit_short", { count: mins, unit: "minute" });
};

export const getDurationMinutesAccessibleLabel = (mins: number | undefined, t: TFunction) => {
  if (!mins) return null;
  return t("minute", { count: mins });
};
