import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import type { IOutOfOfficeData } from "@calcom/features/availability/lib/getUserAvailability";
import type { Availability } from "@calcom/prisma/client";

export type DateRange = {
  start: Dayjs;
  end: Dayjs;
};

export type DateOverride = Pick<Availability, "date" | "startTime" | "endTime">;
export type WorkingHours = Pick<Availability, "days" | "startTime" | "endTime">;

type TravelSchedule = { startDate: Dayjs; endDate?: Dayjs; timeZone: string };

function getAdjustedTimezone(date: Dayjs, timeZone: string, travelSchedules: TravelSchedule[]) {
  let adjustedTimezone = timeZone;

  for (const travelSchedule of travelSchedules) {
    if (
      !date.isBefore(travelSchedule.startDate) &&
      (!travelSchedule.endDate || !date.isAfter(travelSchedule.endDate))
    ) {
      adjustedTimezone = travelSchedule.timeZone;
      break;
    }
  }
  return adjustedTimezone;
}

// reducer
export function processWorkingHours(
  results: Record<number, DateRange>,
  {
    item,
    timeZone,
    dateFrom,
    dateTo,
    travelSchedules,
  }: {
    item: WorkingHours;
    timeZone: string;
    dateFrom: Dayjs;
    dateTo: Dayjs;
    travelSchedules: TravelSchedule[];
  }
) {
  const utcDateTo = dateTo.utc();
  let endTimeToKeyMap: Map<number, number[]> | undefined;

  for (let date = dateFrom.startOf("day"); utcDateTo.isAfter(date); date = date.add(1, "day")) {
    const fromOffset = dateFrom.startOf("day").utcOffset();

    const adjustedTimezone = getAdjustedTimezone(date, timeZone, travelSchedules);

    const offset = date.tz(adjustedTimezone).utcOffset();

    // it always has to be start of the day (midnight) even when DST changes
    const dateInTz = date.add(fromOffset - offset, "minutes").tz(adjustedTimezone);
    if (!item.days.includes(dateInTz.day())) {
      continue;
    }

    let start = dateInTz
      .add(item.startTime.getUTCHours(), "hours")
      .add(item.startTime.getUTCMinutes(), "minutes");

    let end = dateInTz.add(item.endTime.getUTCHours(), "hours").add(item.endTime.getUTCMinutes(), "minutes");

    const offsetBeginningOfDay = dayjs(start.format("YYYY-MM-DD HH:mm")).tz(adjustedTimezone).utcOffset();
    const offsetDiff = start.utcOffset() - offsetBeginningOfDay; // there will be 60 min offset on the day day of DST change

    start = start.add(offsetDiff, "minute");
    end = end.add(offsetDiff, "minute");

    const startResult = dayjs.max(start, dateFrom);
    let endResult = dayjs.min(end, dateTo.tz(adjustedTimezone));

    // INFO: We only allow users to set availability up to 11:59PM which ends up not making them available
    // up to midnight.
    if (endResult.hour() === 23 && endResult.minute() === 59) {
      endResult = endResult.add(1, "minute");
    }

    if (endResult.isBefore(startResult)) {
      // if an event ends before start, it's not a result.
      continue;
    }

    const endTimeKey = endResult.valueOf();

    // Create a map of end times to range keys for O(1) lookup
    if (!endTimeToKeyMap) {
      endTimeToKeyMap = new Map<number, number[]>();
      for (const [key, range] of Object.entries(results)) {
        const endTime = range.end.valueOf();
        if (!endTimeToKeyMap.has(endTime)) {
          endTimeToKeyMap.set(endTime, []);
        }
        endTimeToKeyMap.get(endTime)!.push(Number(key));
      }
    }

    // Check for overlapping ranges with the same end time using O(1) lookup
    const keysWithSameEndTime = endTimeToKeyMap.get(endTimeKey) || [];
    let foundOverlapping = false;

    for (const key of keysWithSameEndTime) {
      const existingRange = results[key];
      if (
        startResult.valueOf() <= existingRange.end.valueOf() &&
        endResult.valueOf() >= existingRange.start.valueOf()
      ) {
        // Merge by taking the earliest start time and keeping the same end time
        results[key] = {
          start: dayjs.min(existingRange.start, startResult),
          end: endResult,
        };
        foundOverlapping = true;
        break;
      }
    }

    if (foundOverlapping) {
      continue;
    }

    if (results[startResult.valueOf()]) {
      // if a result already exists, we merge the end time
      const oldKey = startResult.valueOf();
      const newKey = endResult.valueOf();

      results[newKey] = {
        start: results[oldKey].start,
        end: dayjs.max(results[oldKey].end, endResult),
      };

      if (endTimeToKeyMap) {
        const oldEndTime = results[oldKey].end.valueOf();
        const oldKeys = endTimeToKeyMap.get(oldEndTime) || [];
        const filteredKeys = oldKeys.filter((k) => k !== oldKey);
        if (filteredKeys.length === 0) {
          endTimeToKeyMap.delete(oldEndTime);
        } else {
          endTimeToKeyMap.set(oldEndTime, filteredKeys);
        }

        if (!endTimeToKeyMap.has(endTimeKey)) {
          endTimeToKeyMap.set(endTimeKey, []);
        }
        endTimeToKeyMap.get(endTimeKey)!.push(newKey);
      }

      delete results[oldKey]; // delete the previous end time
      continue;
    }
    // otherwise we create a new result
    const newKey = endResult.valueOf();
    results[newKey] = {
      start: startResult,
      end: endResult,
    };

    if (endTimeToKeyMap) {
      if (!endTimeToKeyMap.has(endTimeKey)) {
        endTimeToKeyMap.set(endTimeKey, []);
      }
      endTimeToKeyMap.get(endTimeKey)!.push(newKey);
    }
  }

  return results;
}

export function processDateOverride({
  item,
  itemDateAsUtc,
  timeZone,
  travelSchedules,
}: {
  item: DateOverride;
  itemDateAsUtc: Dayjs;
  timeZone: string;
  travelSchedules: TravelSchedule[];
}) {
  const overrideDate = dayjs(item.date);

  const adjustedTimezone = getAdjustedTimezone(overrideDate, timeZone, travelSchedules);

  const itemDateStartOfDay = itemDateAsUtc.startOf("day");
  const startDate = itemDateStartOfDay
    .add(item.startTime.getUTCHours(), "hours")
    .add(item.startTime.getUTCMinutes(), "minutes")
    .second(0)
    .tz(adjustedTimezone, true);

  let endDate = itemDateStartOfDay;
  const endTimeHours = item.endTime.getUTCHours();
  const endTimeMinutes = item.endTime.getUTCMinutes();

  if (endTimeHours === 23 && endTimeMinutes === 59) {
    endDate = endDate.add(1, "day").tz(timeZone, true);
  } else {
    endDate = itemDateStartOfDay
      .add(endTimeHours, "hours")
      .add(endTimeMinutes, "minutes")
      .second(0)
      .tz(adjustedTimezone, true);
  }

  return {
    start: startDate,
    end: endDate,
  };
}

// This function processes out-of-office dates and returns a date range for each OOO date.
function processOOO(outOfOffice: Dayjs, timeZone: string) {
  const OOOdate = outOfOffice.tz(timeZone, true);
  return {
    start: OOOdate,
    end: OOOdate,
  };
}

export function buildDateRanges({
  availability,
  timeZone /* Organizer timeZone */,
  dateFrom /* Attendee dateFrom */,
  dateTo /* `` dateTo */,
  travelSchedules,
  outOfOffice,
}: {
  timeZone: string;
  availability: (DateOverride | WorkingHours)[];
  dateFrom: Dayjs;
  dateTo: Dayjs;
  travelSchedules: TravelSchedule[];
  outOfOffice?: IOutOfOfficeData;
}): { dateRanges: DateRange[]; oooExcludedDateRanges: DateRange[] } {
  const dateFromOrganizerTZ = dateFrom.tz(timeZone);

  const groupedWorkingHours = groupByDate(
    Object.values(
      availability.reduce((processed: Record<number, DateRange>, item) => {
        if (!("days" in item)) {
          return processed;
        }

        processed = processWorkingHours(processed, {
          item,
          timeZone,
          dateFrom: dateFromOrganizerTZ,
          dateTo,
          travelSchedules,
        });

        return processed;
      }, {})
    )
  );

  const groupedOOO = groupByDate(
    outOfOffice
      ? Object.keys(outOfOffice).map((outOfOffice) => processOOO(dayjs.utc(outOfOffice), timeZone))
      : []
  );

  const groupedDateOverrides = groupByDate(
    Object.values(
      availability.reduce((processed: Record<number, DateRange>, item) => {
        // early return if item is not a date override
        if (!("date" in item && !!item.date)) {
          return processed;
        }
        const itemDateAsUtc = dayjs.utc(item.date);
        // TODO: Remove the .subtract(1, "day") and .add(1, "day") part and
        // refactor this to actually work with correct dates.
        // As of 2024-02-20, there are mismatches between local and UTC dates for overrides
        // and the dateFrom and dateTo fields, resulting in this if not returning true, which
        // results in "no available users found" errors.
        if (
          itemDateAsUtc.isBetween(
            dateFrom.subtract(1, "day").startOf("day"),
            dateTo.add(1, "day").endOf("day"),
            null,
            "[]"
          )
        ) {
          // unlike working hours, date overrides are always one. No loop per day.
          const newProcessedDateOverride = processDateOverride({
            item,
            itemDateAsUtc,
            timeZone,
            travelSchedules,
          });
          if (processed[newProcessedDateOverride.start.valueOf()]) {
            // if a result already exists, we merge the end time
            processed[newProcessedDateOverride.start.valueOf()].end = dayjs.max(
              processed[newProcessedDateOverride.start.valueOf()].end,
              newProcessedDateOverride.end
            );
            return processed;
          }
          processed[newProcessedDateOverride.end.valueOf()] = newProcessedDateOverride;
        }
        return processed;
      }, {})
    )
  );

  const dateRanges = Object.values({
    ...groupedWorkingHours,
    ...groupedDateOverrides,
  }).map(
    // remove 0-length overrides that were kept to cancel out working dates until now.
    (ranges) => ranges.filter((range) => range.start.valueOf() !== range.end.valueOf())
  );

  const oooExcludedDateRanges = Object.values({
    ...groupedWorkingHours,
    ...groupedDateOverrides,
    ...groupedOOO,
  }).map(
    // remove 0-length overrides && OOO dates that were kept to cancel out working dates until now.
    (ranges) => ranges.filter((range) => range.start.valueOf() !== range.end.valueOf())
  );

  return { dateRanges: dateRanges.flat(), oooExcludedDateRanges: oooExcludedDateRanges.flat() };
}

export function groupByDate(ranges: DateRange[]): { [x: string]: DateRange[] } {
  const results = ranges.reduce(
    (
      previousValue: {
        [date: string]: DateRange[];
      },
      currentValue
    ) => {
      const dateString = dayjs(currentValue.start).format("YYYY-MM-DD");

      previousValue[dateString] =
        typeof previousValue[dateString] === "undefined"
          ? [currentValue]
          : [...previousValue[dateString], currentValue];
      return previousValue;
    },
    {}
  );

  return results;
}

export function intersect(ranges: DateRange[][]): DateRange[] {
  if (!ranges.length) {
    return [];
  }

  type ProcessedDateRange = DateRange & { startValue: number; endValue: number };

  // Pre-sort all user ranges and cache timestamp values.
  const sortedRanges: ProcessedDateRange[][] = ranges.map((userRanges) =>
    userRanges
      .map((r) => ({
        ...r,
        startValue: r.start.valueOf(),
        endValue: r.end.valueOf(),
      }))
      .sort((a, b) => a.startValue - b.startValue)
  );

  let commonAvailability: ProcessedDateRange[] = sortedRanges[0];

  for (let i = 1; i < sortedRanges.length; i++) {
    // Early exit if no common availability is left.
    if (commonAvailability.length === 0) {
      return [];
    }

    const userRanges = sortedRanges[i];
    const intersectedRanges: ProcessedDateRange[] = [];

    let commonIndex = 0;
    let userIndex = 0;

    while (commonIndex < commonAvailability.length && userIndex < userRanges.length) {
      const commonRange = commonAvailability[commonIndex];
      const userRange = userRanges[userIndex];

      const intersectStartValue = Math.max(commonRange.startValue, userRange.startValue);
      const intersectEndValue = Math.min(commonRange.endValue, userRange.endValue);

      if (intersectStartValue < intersectEndValue) {
        const intersectStart =
          commonRange.startValue > userRange.startValue ? commonRange.start : userRange.start;
        const intersectEnd = commonRange.endValue < userRange.endValue ? commonRange.end : userRange.end;
        intersectedRanges.push({
          start: intersectStart,
          end: intersectEnd,
          startValue: intersectStartValue,
          endValue: intersectEndValue,
        });
      }

      if (commonRange.endValue <= userRange.endValue) {
        commonIndex++;
      } else {
        userIndex++;
      }
    }
    commonAvailability = intersectedRanges;
  }

  // Strip the cached values before returning to match the expected DateRange[] type.
  return commonAvailability.map(({ start, end }) => ({ start, end }));
}

type SubtractedRange<TSourceRange extends DateRange> = Omit<TSourceRange, "start" | "end"> & {
  start: TSourceRange["start"];
  end: TSourceRange["end"];
};

export function subtract<TSourceRange extends DateRange, TExcludedRange extends DateRange>(
  sourceRanges: TSourceRange[],
  excludedRanges: TExcludedRange[]
): SubtractedRange<TSourceRange>[] {
  const result: SubtractedRange<TSourceRange>[] = [];
  const sortedExcludedRanges = [...excludedRanges].sort((a, b) => a.start.valueOf() - b.start.valueOf());

  for (const { start: sourceStart, end: sourceEnd, ...passThrough } of sourceRanges) {
    let currentStart = sourceStart;

    for (const excludedRange of sortedExcludedRanges) {
      if (excludedRange.start.valueOf() >= sourceEnd.valueOf()) break;
      if (excludedRange.end.valueOf() <= currentStart.valueOf()) continue;

      if (excludedRange.start.valueOf() > currentStart.valueOf()) {
        result.push({ start: currentStart, end: excludedRange.start, ...passThrough });
      }

      if (excludedRange.end.valueOf() > currentStart.valueOf()) {
        currentStart = excludedRange.end;
      }
    }

    if (sourceEnd.valueOf() > currentStart.valueOf()) {
      result.push({ start: currentStart, end: sourceEnd, ...passThrough });
    }
  }

  return result;
}

export function mergeOverlappingRanges(ranges: { start: Date; end: Date }[]): { start: Date; end: Date }[] {
  if (ranges.length === 0) return [];

  const sortedRanges = ranges.sort((a, b) => a.start.valueOf() - b.start.valueOf());

  const mergedRanges: { start: Date; end: Date }[] = [sortedRanges[0]];

  for (let i = 1; i < sortedRanges.length; i++) {
    const lastMergedRange = mergedRanges[mergedRanges.length - 1];
    const currentRange = sortedRanges[i];

    if (currentRange.start.getTime() <= lastMergedRange.end.getTime()) {
      lastMergedRange.end = new Date(Math.max(lastMergedRange.end.getTime(), currentRange.end.getTime()));
    } else {
      mergedRanges.push(currentRange);
    }
  }
  return mergedRanges;
}
