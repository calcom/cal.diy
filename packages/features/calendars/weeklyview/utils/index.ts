import dayjs from "@calcom/dayjs";
import type { TimeRange } from "@calcom/types/schedule";

// By default starts on Sunday (Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday)
export function weekdayDates(weekStart = 0, startDate: Date, length = 6) {
  const tmpStartDate = startDate;
  while (tmpStartDate.getDay() !== weekStart) {
    tmpStartDate.setDate(tmpStartDate.getDate() - 1);
  }
  return {
    startDate: tmpStartDate,
    endDate: new Date(tmpStartDate.getTime() + length * 24 * 60 * 60 * 1000),
  };
}
export type GridCellToDateProps = {
  day: dayjs.Dayjs;
  gridCellIdx: number;
  totalGridCells: number;
  selectionLength: number;
  startHour: number;
  timezone: string;
};

export function gridCellToDateTime({
  day,
  gridCellIdx,
  totalGridCells,
  selectionLength,
  startHour,
  timezone,
}: GridCellToDateProps) {
  // endHour - startHour = selectionLength
  const minutesInSelection = (selectionLength + 1) * 60;
  const minutesPerCell = minutesInSelection / totalGridCells;
  const minutesIntoSelection = minutesPerCell * gridCellIdx;

  // Add startHour since we use StartOfDay for day props. This could be improved by changing the getDaysBetweenDates function
  // To handle the startHour+endHour
  const cellDateTime = dayjs(day)
    .tz(timezone)
    .startOf("day")
    .add(minutesIntoSelection, "minutes")
    .add(startHour, "hours");
  return cellDateTime;
}

export function getDaysBetweenDates(dateFrom: Date, dateTo: Date) {
  const dates = []; // this is as dayjs date
  let startDate = dayjs(dateFrom).hour(0).minute(0).second(0).millisecond(0);

  dates.push(startDate);
  const endDate = dayjs(dateTo).hour(0).minute(0).second(0).millisecond(0);

  while (startDate.isBefore(endDate)) {
    dates.push(startDate.add(1, "day"));
    startDate = startDate.add(1, "day");
  }

  return dates.slice(0, 7);
}

export function getHoursToDisplay(startHour: number, endHour: number, timezone?: string) {
  const dates = []; // this is as dayjs date
  let startDate = dayjs("1970-01-01").tz(timezone).hour(startHour);
  dates.push(startDate);
  const endDate = dayjs("1970-01-01").tz(timezone).hour(endHour);
  while (startDate.isBefore(endDate)) {
    dates.push(startDate.add(1, "hour"));
    startDate = startDate.add(1, "hour");
  }
  return dates;
}

export function mergeOverlappingDateRanges(dateRanges: TimeRange[]) {
  //Sort the date ranges by start date
  dateRanges.sort((a, b) => {
    return a.start.getTime() - b.start.getTime();
  });
  //Create a new array to hold the merged date ranges
  const mergedDateRanges = [];
  //Loop through the date ranges
  for (let i = 0; i < dateRanges.length; i++) {
    //If the merged date ranges array is empty, add the first date range
    if (mergedDateRanges.length === 0) {
      mergedDateRanges.push(dateRanges[i]);
    } else {
      //Get the last date range in the merged date ranges array
      const lastMergedDateRange = mergedDateRanges[mergedDateRanges.length - 1];
      //Get the current date range
      const currentDateRange = dateRanges[i];
      //If the last merged date range overlaps with the current date range, merge them
      if (lastMergedDateRange.end.getTime() >= currentDateRange.start.getTime()) {
        lastMergedDateRange.end = currentDateRange.end;
      } else {
        //Otherwise, add the current date range to the merged date ranges array
        mergedDateRanges.push(currentDateRange);
      }
    }
  }
  return mergedDateRanges;
}

export function calculateHourSizeInPx(
  gridElementRef: HTMLOListElement | null,
  startHour: number,
  endHour: number
) {
  // Gap added at bottom to give calendar some breathing room.
  // I guess we could come up with a better way to do this in the future.
  const gapOnBottom = 50;
  // In case the calendar has for example a header above it. We take a look at the
  // distance the grid is rendered from the top, and subtract that from the height.
  const offsetFromTop = gridElementRef?.getBoundingClientRect().top ?? 65;
  return (window.innerHeight - offsetFromTop - gapOnBottom) / (endHour - startHour);
}

/**
 * Returns the part of an event that falls on the given day, or null when the event doesn't touch that day.
 * Events spanning midnight (multi-day, all-day) are rendered as one segment per day they cover.
 */
export function getEventSegmentForDay(event: { start: Date | string; end: Date | string }, day: dayjs.Dayjs) {
  const dayStart = day.startOf("day");
  const dayEnd = dayStart.add(1, "day");
  const eventStart = dayjs(event.start);
  const eventEnd = dayjs(event.end);

  const startsBeforeDayEnds = eventStart.isBefore(dayEnd);
  // An event ending exactly at midnight belongs to the previous day only
  const endsAfterDayStarts = eventEnd.isAfter(dayStart) || !eventStart.isBefore(dayStart);
  if (!startsBeforeDayEnds || !endsAfterDayStarts) return null;

  return { start: dayjs.max(eventStart, dayStart), end: dayjs.min(eventEnd, dayEnd) };
}
