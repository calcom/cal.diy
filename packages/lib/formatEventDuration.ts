import type { TFunction } from "i18next";

/** Render X mins as X hours or X hours Y mins instead of in minutes once >= 60 minutes */
export const getDurationFormatted = (mins: number | undefined, t: TFunction) => {
  if (!mins) return null;

  const hours = Math.floor(mins / 60);
  const remainingMinutes = mins % 60;
  let minStr = "";
  if (remainingMinutes > 0) {
    minStr =
      remainingMinutes === 1
        ? t("minute_one_short", { count: 1 })
        : t("multiple_duration_timeUnit_short", { count: remainingMinutes, unit: "minute" });
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

export const getDurationAccessibleLabel = (mins: number | undefined, t: TFunction) => {
  if (!mins) return null;

  const hours = Math.floor(mins / 60);
  const remainingMinutes = mins % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(hours === 1 ? t("hour_one", { count: 1 }) : t("hour_other", { count: hours }));
  }
  if (remainingMinutes > 0) {
    parts.push(
      remainingMinutes === 1 ? t("minute_one", { count: 1 }) : t("minute_other", { count: remainingMinutes })
    );
  }

  return parts.join(" ") || null;
};

/** Always show total minutes (e.g. 90m) for compact event cards. */
export const getDurationMinutesFormatted = (mins: number | undefined, t: TFunction) => {
  if (!mins) return null;

  return mins === 1
    ? t("minute_one_short", { count: 1 })
    : t("multiple_duration_timeUnit_short", { count: mins, unit: "minute" });
};

/** Screen reader label matching minutes-only display (e.g. "90 minutes"). */
export const getDurationMinutesAccessibleLabel = (mins: number | undefined, t: TFunction) => {
  if (!mins) return null;

  return mins === 1 ? t("minute_one", { count: 1 }) : t("minute_other", { count: mins });
};
