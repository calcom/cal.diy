import type { ConfigType } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import type { Availability } from "@calcom/prisma/client";
import type { Schedule, TimeRange, WorkingHours } from "@calcom/types/schedule";
import { nameOfDay } from "./weekday";

// sets the desired time in current date, needs to be current date for proper DST translation
export const defaultDayRange: TimeRange = {
  start: new Date(new Date().setUTCHours(9, 0, 0, 0)),
  end: new Date(new Date().setUTCHours(17, 0, 0, 0)),
};

export const DEFAULT_SCHEDULE: Schedule = [
  [],
  [defaultDayRange],
  [defaultDayRange],
  [defaultDayRange],
  [defaultDayRange],
  [defaultDayRange],
  [],
];

export function getAvailabilityFromSchedule(schedule: Schedule): Availability[] {
  return schedule.reduce((availability: Availability[], times: TimeRange[], day: number) => {
    const addNewTime = (time: TimeRange) =>
      ({
        days: [day],
        startTime: time.start,
        endTime: time.end,
      }) as Availability;

    const filteredTimes = times.filter((time) => {
      let idx: number;
      if (
        (idx = availability.findIndex(
          (schedule) =>
            schedule.startTime.toString() === time.start.toString() &&
            schedule.endTime.toString() === time.end.toString()
        )) !== -1
      ) {
        availability[idx].days.push(day);
        return false;
      }
      return true;
    });
    filteredTimes.forEach((time) => {
      availability.push(addNewTime(time));
    });
    return availability;
  }, [] as Availability[]);
}

export const MINUTES_IN_DAY = 60 * 24;
export const MINUTES_DAY_END = MINUTES_IN_DAY - 1;
export const MINUTES_DAY_START = 0;

/**
 * Allows "casting" availability (days, startTime, endTime) given in UTC to a timeZone or utcOffset
 */
export function getWorkingHours(
  relativeTimeUnit: {
    timeZone?: string;
    utcOffset?: number;
  },
  availability: { userId?: number | null; days: number[]; startTime: ConfigType; endTime: ConfigType }[]
) {
  if (!availability.length) {
    return [];
  }
  const utcOffset =
    relativeTimeUnit.utcOffset ??
    (relativeTimeUnit.timeZone ? dayjs().tz(relativeTimeUnit.timeZone).utcOffset() : 0);

  const workingHours = availability.reduce((currentWorkingHours: WorkingHours[], schedule) => {
    // Include only recurring weekly availability, not date overrides
    if (!schedule.days.length) return currentWorkingHours;
    // Get times localised to the given utcOffset/timeZone
    const startTime =
      dayjs.utc(schedule.startTime).get("hour") * 60 +
      dayjs.utc(schedule.startTime).get("minute") -
      utcOffset;
    const endTime =
      dayjs.utc(schedule.endTime).get("hour") * 60 + dayjs.utc(schedule.endTime).get("minute") - utcOffset;
    // add to working hours, keeping startTime and endTimes between bounds (0-1439)
    const sameDayStartTime = Math.max(MINUTES_DAY_START, Math.min(MINUTES_DAY_END, startTime));
    const sameDayEndTime = Math.max(MINUTES_DAY_START, Math.min(MINUTES_DAY_END, endTime));
    if (sameDayEndTime < sameDayStartTime) {
      return currentWorkingHours;
    }
    if (sameDayStartTime !== sameDayEndTime) {
      const newWorkingHours: WorkingHours = {
        days: schedule.days,
        startTime: sameDayStartTime,
        endTime: sameDayEndTime,
      };
      if (schedule.userId) newWorkingHours.userId = schedule.userId;
      currentWorkingHours.push(newWorkingHours);
    }
    // check for overflow to the previous day
    // overflowing days constraint to 0-6 day range (Sunday-Saturday)
    if (startTime < MINUTES_DAY_START || endTime < MINUTES_DAY_START) {
      const newWorkingHours: WorkingHours = {
        days: schedule.days.map((day) => (day - 1 >= 0 ? day - 1 : 6)),
        startTime: startTime + MINUTES_IN_DAY,
        endTime: Math.min(endTime + MINUTES_IN_DAY, MINUTES_DAY_END),
      };
      if (schedule.userId) newWorkingHours.userId = schedule.userId;
      currentWorkingHours.push(newWorkingHours);
    }
    // else, check for overflow in the next day
    else if (startTime > MINUTES_DAY_END || endTime > MINUTES_IN_DAY) {
      const newWorkingHours: WorkingHours = {
        days: schedule.days.map((day) => (day + 1) % 7),
        startTime: Math.max(startTime - MINUTES_IN_DAY, MINUTES_DAY_START),
        endTime: endTime - MINUTES_IN_DAY,
      };
      if (schedule.userId) newWorkingHours.userId = schedule.userId;
      currentWorkingHours.push(newWorkingHours);
    }

    return currentWorkingHours;
  }, []);

  workingHours.sort((a, b) => a.startTime - b.startTime);
  return workingHours;
}

export function availabilityAsString(
  availability: Pick<Availability, "days" | "startTime" | "endTime">,
  { locale, hour12 }: { locale?: string; hour12?: boolean }
) {
  const weekSpan = (availability: Pick<Availability, "days" | "startTime" | "endTime">) => {
    const days = availability.days.slice(1).reduce(
      (days, day) => {
        if (days[days.length - 1].length === 1 && days[days.length - 1][0] === day - 1) {
          // append if the range is not complete (but the next day needs adding)
          days[days.length - 1].push(day);
        } else if (days[days.length - 1][days[days.length - 1].length - 1] === day - 1) {
          // range complete, overwrite if the last day directly precedes the current day
          days[days.length - 1] = [days[days.length - 1][0], day];
        } else {
          // new range
          days.push([day]);
        }
        return days;
      },
      [[availability.days[0]]] as number[][]
    );
    return days
      .map((dayRange) => dayRange.map((day) => nameOfDay(locale, day, "short")).join(" - "))
      .join(", ");
  };

  const timeSpan = (availability: Pick<Availability, "days" | "startTime" | "endTime">) => {
    return `${new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "numeric", hour12 }).format(
      new Date(availability.startTime.toISOString().slice(0, -1))
    )} - ${new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "numeric", hour12 }).format(
      new Date(availability.endTime.toISOString().slice(0, -1))
    )}`;
  };

  return `${weekSpan(availability)}, ${timeSpan(availability)}`;
}
