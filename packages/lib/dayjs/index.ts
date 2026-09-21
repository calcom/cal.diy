import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import { z } from "zod";

// converts a date to 2022-04-25 for example.
export const yyyymmdd = (date: Date | Dayjs) =>
  date instanceof Date ? dayjs(date).format("YYYY-MM-DD") : date.format("YYYY-MM-DD");

// @see: https://github.com/iamkun/dayjs/issues/1272 - for the reason we're not using dayjs to do this.
export const daysInMonth = (date: Date | Dayjs) => {
  const [year, month] =
    date instanceof Date ? [date.getFullYear(), date.getMonth()] : [date.year(), date.month()];
  // strange JS quirk: new Date(2022, 12, 0).getMonth() = 11
  return new Date(year, month + 1, 0).getDate();
};

/**
 * Expects timeFormat to be either 12 or 24, if null or undefined
 * is passed in, we always default back to 24 hour notation.
 */
export const formatTime = (
  date: string | Date | Dayjs,
  timeFormat?: number | null,
  timeZone?: string | null
) => {
  // console.log(timeZone, date);
  return timeZone
    ? dayjs(date)
        .tz(timeZone)
        .format(timeFormat === 12 ? "h:mma" : "HH:mm")
    : dayjs(date).format(timeFormat === 12 ? "h:mma" : "HH:mm");
};

/**
 * Checks if a provided timeZone string is recognized as a valid timezone by dayjs.
 *
 * @param {string} timeZone - The timezone string to be verified.
 * @returns {boolean} - Returns 'true' if the provided timezone string is recognized as a valid timezone by dayjs. Otherwise, returns 'false'.
 *
 */
export const isSupportedTimeZone = (timeZone: string) => {
  try {
    dayjs().tz(timeZone);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Returns a localized and translated date or time, based on the native
 * Intl.DateTimeFormat available to JS. Undefined values mean the browser's
 * locale will be used.
 */
export const formatLocalizedDateTime = (
  date: Date | Dayjs,
  options: Intl.DateTimeFormatOptions = {},
  locale: string | undefined = undefined
) => {
  const theDate = date instanceof dayjs ? (date as Dayjs).toDate() : (date as Date);
  return Intl.DateTimeFormat(locale, options).format(theDate);
};

/**
 * Returns a localized and translated calendar day based on the
 * given Date object and locale. Undefined values mean the defaults
 * associated with the browser's current locale will be used.
 */
export const formatToLocalizedDate = (
  date: Date | Dayjs,
  locale: string | undefined = undefined,
  dateStyle: Intl.DateTimeFormatOptions["dateStyle"] = "long",
  timeZone?: string
) => formatLocalizedDateTime(date, { dateStyle, timeZone }, locale);

/**
 * Returns a localized and translated time of day based on the
 * given Date object and locale. Undefined values mean the defaults
 * associated with the browser's current locale will be used.
 */
export const formatToLocalizedTime = ({
  date,
  locale = undefined,
  timeStyle = "short",
  hour12 = undefined,
  timeZone,
}: {
  date: Date | Dayjs;
  locale?: string | undefined;
  timeStyle?: Intl.DateTimeFormatOptions["timeStyle"];
  hour12?: Intl.DateTimeFormatOptions["hour12"];
  timeZone?: string;
}) => formatLocalizedDateTime(date, { timeStyle, hour12, timeZone }, locale);

/**
 * Returns a translated timezone based on the given Date object and
 * locale. Undefined values mean the browser's current locale
 * will be used.
 */
export const formatToLocalizedTimezone = (
  date: Date | Dayjs,
  locale: string | undefined = undefined,
  timeZone: Intl.DateTimeFormatOptions["timeZone"],
  timeZoneName: Intl.DateTimeFormatOptions["timeZoneName"] = "long"
) => {
  // Intl.DateTimeFormat doesn't format into a timezone only, so we must
  //  formatToParts() and return the piece we want
  const theDate = date instanceof dayjs ? (date as Dayjs).toDate() : (date as Date);
  return Intl.DateTimeFormat(locale, { timeZoneName, timeZone })
    .formatToParts(theDate)
    .find((d) => d.type == "timeZoneName")?.value;
};

/**
 * Sorts two timezones by their offset from GMT.
 */
export const sortByTimezone = (timezoneA: string, timezoneB: string) => {
  const timezoneAGmtOffset = dayjs.utc().tz(timezoneA).utcOffset();
  const timezoneBGmtOffset = dayjs.utc().tz(timezoneB).utcOffset();

  if (timezoneAGmtOffset === timezoneBGmtOffset) return 0;

  return timezoneAGmtOffset < timezoneBGmtOffset ? -1 : 1;
};

/**
 * Verifies given time is a day before in timezoneB.
 */
export const isPreviousDayInTimezone = (time: string, timezoneA: string, timezoneB: string) => {
  const timeInTimezoneA = formatTime(time, 24, timezoneA);
  const timeInTimezoneB = formatTime(time, 24, timezoneB);
  if (time === timeInTimezoneB) return false;

  // Eg timeInTimezoneA = 12:00 and timeInTimezoneB = 23:00
  const hoursTimezoneBIsLater = timeInTimezoneB.localeCompare(timeInTimezoneA) === 1;
  // If it is 23:00, does timezoneA come before or after timezoneB in GMT?
  const timezoneBIsEarlierTimezone = sortByTimezone(timezoneA, timezoneB) === 1;
  return hoursTimezoneBIsLater && timezoneBIsEarlierTimezone;
};

/**
 * Verifies given time is a day after in timezoneB.
 */
export const isNextDayInTimezone = (time: string, timezoneA: string, timezoneB: string) => {
  const timeInTimezoneA = formatTime(time, 24, timezoneA);
  const timeInTimezoneB = formatTime(time, 24, timezoneB);
  if (time === timeInTimezoneB) return false;

  // Eg timeInTimezoneA = 12:00 and timeInTimezoneB = 09:00
  const hoursTimezoneBIsEarlier = timeInTimezoneB.localeCompare(timeInTimezoneA) === -1;
  // If it is 09:00, does timezoneA come before or after timezoneB in GMT?
  const timezoneBIsLaterTimezone = sortByTimezone(timezoneA, timezoneB) === -1;
  return hoursTimezoneBIsEarlier && timezoneBIsLaterTimezone;
};

const weekDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export type WeekDays = (typeof weekDays)[number];
type WeekDayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Turns weekday string (eg "Monday") into a number (eg 1).
 * Also accepts a number as parameter (and straight returns that), and accepts
 * undefined as a parameter; returns 0 in that case.
 */
export const weekdayToWeekIndex = (weekday: WeekDays | string | number | undefined) => {
  if (typeof weekday === "undefined") return 0;
  if (typeof weekday === "number") return weekday >= 0 && weekday >= 6 ? (weekday as WeekDayIndex) : 0;
  return (weekDays.indexOf(weekday as WeekDays) as WeekDayIndex) || 0;
};

/**
 * Dayjs does not expose the timeZone value publicly through .get("timeZone")
 * instead, we as devs are required to somewhat hack our way to get the
 * tz value as string
 * @param date Dayjs
 * @returns Time Zone name
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getTimeZone = (date: Dayjs): string => (date as any).$x.$timezone;

/**
 * Verify if timeZone has Daylight Saving Time (DST).
 *
 * Many countries in the Northern Hemisphere. Daylight Saving Time usually starts in March-April and ends in
 * September-November when the countries return to standard time, or winter time as it is also known.
 *
 * In the Southern Hemisphere (south of the equator) the participating countries usually start the DST period
 * in September-November and end DST in March-April.
 *
 * @param timeZone Time Zone Name (Ex. America/Mazatlan)
 * @returns boolean
 */
export const timeZoneWithDST = (timeZone: string): boolean => {
  const jan = dayjs.tz(`${new Date().getFullYear()}-01-01T00:00:00`, timeZone);
  const jul = dayjs.tz(`${new Date().getFullYear()}-07-01T00:00:00`, timeZone);
  return jan.utcOffset() !== jul.utcOffset();
};

/**
 * Get DST difference.
 * Today clocks are almost always set one hour back or ahead.
 * However, on Lord Howe Island, Australia, clocks are set only 30 minutes forward
 * from LHST (UTC+10:30) to LHDT (UTC+11) during DST.
 * @param timeZone Time Zone Name (Ex. America/Mazatlan)
 * @returns minutes
 */
export const getDSTDifference = (timeZone: string): number => {
  const jan = dayjs.tz(`${new Date().getFullYear()}-01-01T00:00:00`, timeZone);
  const jul = dayjs.tz(`${new Date().getFullYear()}-07-01T00:00:00`, timeZone);
  return jul.utcOffset() - jan.utcOffset();
};

/**
 * Get UTC offset of given time zone when in DST
 * @param timeZone Time Zone Name (Ex. America/Mazatlan)
 * @returns minutes
 */
export const getUTCOffsetInDST = (timeZone: string) => {
  if (timeZoneWithDST(timeZone)) {
    const jan = dayjs.tz(`${new Date().getFullYear()}-01-01T00:00:00`, timeZone);
    const jul = dayjs.tz(`${new Date().getFullYear()}-07-01T00:00:00`, timeZone);
    return jan.utcOffset() < jul.utcOffset() ? jul.utcOffset() : jan.utcOffset();
  }
  return 0;
};
/**
 * Verifies if given time zone is in DST
 * @param date
 * @returns
 */
export const isInDST = (date: Dayjs) => {
  const timeZone = getTimeZone(date);

  return timeZoneWithDST(timeZone) && date.utcOffset() === getUTCOffsetInDST(timeZone);
};

/**
 * Get UTC offset of given time zone
 * @param timeZone Time Zone Name (Ex. America/Mazatlan)
 * @param date
 * @returns
 */
export function getUTCOffsetByTimezone(timeZone: string, date?: string | Date | Dayjs) {
  if (!timeZone) return null;

  return dayjs(date).tz(timeZone).utcOffset();
}

/**
 * Converts a string into a dayjs object with the timezone set.
 */
export const stringToDayjs = (val: string) => {
  const matches = val.match(/([+-]\d{2}:\d{2})$/);
  const timezone = matches ? matches[1] : "+00:00";
  return dayjs(val).utcOffset(timezone);
};

export const stringToDayjsZod = z.string().transform(stringToDayjs);
