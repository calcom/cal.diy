import { formatWeekday, getWeekdayNames } from "./dateTimeFormatter";

type WeekdayFormat = "short" | "long";

export function weekdayNames(locale: string | string[], weekStart = 0, format: WeekdayFormat = "long") {
  const normalizedLocale = Array.isArray(locale) ? locale[0] : locale || "en";
  return getWeekdayNames(normalizedLocale, weekStart, format);
}

export function nameOfDay(
  locale: string | string[] | undefined,
  day: number,
  format: WeekdayFormat = "long"
) {
  const normalizedLocale = Array.isArray(locale) ? locale[0] : locale || "en";
  return formatWeekday(normalizedLocale, day, format);
}
