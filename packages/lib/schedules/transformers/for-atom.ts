import dayjs from "@calcom/dayjs";
import { getWorkingHours } from "@calcom/lib/availability";
import type { Availability } from "@calcom/prisma/client";
import type { Schedule, TimeRange } from "@calcom/types/schedule";

type ScheduleAvailability = Pick<Availability, "days" | "startTime" | "endTime">[];
type ScheduleOverride = Pick<Availability, "date" | "startTime" | "endTime">[];

export function transformWorkingHoursForAtom(schedule: {
  timeZone: string | null;
  availability: ScheduleAvailability;
}) {
  return getWorkingHours(
    { timeZone: schedule.timeZone || undefined, utcOffset: 0 },
    schedule.availability || []
  );
}

export function transformAvailabilityForAtom(schedule: { availability: ScheduleAvailability }) {
  return transformScheduleToAvailabilityForAtom(schedule).map((a) =>
    a.map((startAndEnd) => ({
      ...startAndEnd,
      end: new Date(startAndEnd.end.toISOString().replace("23:59:00.000Z", "23:59:59.999Z")),
    }))
  );
}

export function transformDateOverridesForAtom(
  schedule: { availability: ScheduleOverride },
  timeZone: string
) {
  const acc = schedule.availability.reduce(
    (acc, override) => {
      if (!override.date) {
        return acc;
      }
      const overrideDate = dayjs.utc(override.date).format("YYYY-MM-DD");
      const todayInTimeZone = dayjs().tz(timeZone).format("YYYY-MM-DD");
      if (overrideDate < todayInTimeZone) {
        return acc;
      }

      const newValue = {
        start: dayjs
          .utc(override.date)
          .hour(override.startTime.getUTCHours())
          .minute(override.startTime.getUTCMinutes())
          .toDate(),
        end: dayjs
          .utc(override.date)
          .hour(override.endTime.getUTCHours())
          .minute(override.endTime.getUTCMinutes())
          .toDate(),
      };
      const dayRangeIndex = acc.findIndex(
        (item) => dayjs.utc(item.ranges[0].start).format("YYYY-MM-DD") === overrideDate
      );
      if (dayRangeIndex === -1) {
        acc.push({ ranges: [newValue] });
        return acc;
      }
      acc[dayRangeIndex].ranges.push(newValue);
      return acc;
    },
    [] as { ranges: TimeRange[] }[]
  );

  acc.sort((a, b) => {
    const aTime = a.ranges?.[0]?.start?.getTime?.() ?? 0;
    const bTime = b.ranges?.[0]?.start?.getTime?.() ?? 0;
    return aTime - bTime;
  });
  return acc;
}

export const transformScheduleToAvailabilityForAtom = (schedule: { availability: ScheduleAvailability }) => {
  const result = schedule.availability.reduce(
    (schedule: Schedule, availability) => {
      availability.days.forEach((day) => {
        schedule[day].push({
          start: new Date(
            Date.UTC(
              new Date().getUTCFullYear(),
              new Date().getUTCMonth(),
              new Date().getUTCDate(),
              availability.startTime.getUTCHours(),
              availability.startTime.getUTCMinutes()
            )
          ),
          end: new Date(
            Date.UTC(
              new Date().getUTCFullYear(),
              new Date().getUTCMonth(),
              new Date().getUTCDate(),
              availability.endTime.getUTCHours(),
              availability.endTime.getUTCMinutes()
            )
          ),
        });
      });
      return schedule;
    },
    Array.from([...Array(7)]).map(() => [])
  );

  result.forEach((daySlots) => {
    daySlots.sort((a, b) => {
      const aTime = a?.start?.getTime?.() ?? 0;
      const bTime = b?.start?.getTime?.() ?? 0;
      return aTime - bTime;
    });
  });

  return result;
};
