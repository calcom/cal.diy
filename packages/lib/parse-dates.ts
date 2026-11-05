import { RRule } from "rrule";

import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import { detectBrowserTimeFormat, TimeFormat } from "@calcom/lib/timeFormat";
import type { RecurringEvent } from "@calcom/types/Calendar";

import { parseZone } from "./parse-zone";

type ExtraOptions = { withDefaultTimeFormat?: boolean; selectedTimeFormat?: TimeFormat };

const processDate = (
  date: string | null | Dayjs,
  language: string,
  timeZone: string,
  options?: ExtraOptions
) => {
  const parsedZone = parseZone(date);
  if (!parsedZone?.isValid()) return "Invalid date";
  const formattedTime = parsedZone?.format(
    options?.withDefaultTimeFormat
      ? TimeFormat.TWELVE_HOUR
      : options?.selectedTimeFormat || detectBrowserTimeFormat
  );
  return `${formattedTime}, ${dayjs(date)
    .toDate()
    .toLocaleString(language, { dateStyle: "full", timeZone })}`;
};

export const parseDate = (
  date: string | null | Dayjs,
  language: string,
  timeZone: string,
  options?: ExtraOptions
) => {
  if (!date) return ["No date"];
  return processDate(date, language, timeZone, options);
};

const BASE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour12: true,
  hourCycle: "h12",
  hour: "numeric",
  minute: "numeric",
};

const BASE_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
};

export const parseDateTimeWithTimeZone = (
  date: Date,
  language: string,
  timezone: string,
  options?: ExtraOptions
): string => {
  // Clone per-call to avoid mutating the shared module-level defaults across
  // subsequent invocations (fixes: https://github.com/calcom/cal.diy/issues/30510).
  const timeOptions: Intl.DateTimeFormatOptions = { ...BASE_TIME_OPTIONS, timeZone: timezone };
  const dateOptions: Intl.DateTimeFormatOptions = { ...BASE_DATE_OPTIONS, timeZone: timezone };

  if (options?.withDefaultTimeFormat) {
    timeOptions.hourCycle = "h12";
    timeOptions.hour12 = true;
  } else if (options?.selectedTimeFormat) {
    if (options.selectedTimeFormat === TimeFormat.TWELVE_HOUR) {
      timeOptions.hourCycle = "h12";
      timeOptions.hour12 = true;
    } else {
      timeOptions.hourCycle = "h24";
      delete timeOptions.hour12;
    }
  }

  const formattedDate = new Date(date).toLocaleDateString(language, dateOptions);
  const formattedTime = new Date(date)
    .toLocaleTimeString(language, timeOptions)
    .replace(" ", "")
    .toLowerCase();
  return `${formattedTime}, ${formattedDate}`;
};

export const parseRecurringDates = (
  {
    startDate,
    timeZone,
    recurringEvent,
    recurringCount,
    selectedTimeFormat,
    withDefaultTimeFormat,
  }: {
    startDate: string | null | Dayjs;
    timeZone: string;
    recurringEvent: RecurringEvent | null;
    recurringCount: number;
    selectedTimeFormat?: TimeFormat;
    withDefaultTimeFormat?: boolean;
  },
  language: string
): [string[], Date[]] => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { count, ...restRecurringEvent } = recurringEvent || {};
  const rule = new RRule({
    ...restRecurringEvent,
    count: recurringCount,
    dtstart: new Date(dayjs(startDate).valueOf()),
  });

  const startUtcOffset = dayjs(startDate).utcOffset();
  // UTC still need to have DST applied, rrule does not do this.
  const times = rule.all().map((t) => {
    // applying the DST offset.
    return dayjs.utc(t).add(startUtcOffset - dayjs(t).utcOffset(), "minute");
  });
  const dateStrings = times.map((t) => {
    // finally; show in local timeZone again
    return processDate(t.tz(timeZone), language, timeZone, { selectedTimeFormat, withDefaultTimeFormat });
  });

  return [dateStrings, times.map((t) => t.toDate())];
};
