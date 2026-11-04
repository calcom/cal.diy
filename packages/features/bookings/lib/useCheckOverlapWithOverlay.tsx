import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";

import { useOverlayCalendarStore } from "../Booker/components/OverlayCalendar/store";

export function useCheckOverlapWithOverlay({
  start,
  selectedDuration,
  offset,
}: {
  start: Dayjs;
  selectedDuration: number | null;
  offset: number;
}) {
  const overlayBusyDates = useOverlayCalendarStore((state) => state.overlayBusyDates);

  let overlappingTimeStart: string | null = null;
  let overlappingTimeEnd: string | null = null;
  let overlappingTitle: string | null = null;

  const isOverlapping =
    overlayBusyDates &&
    overlayBusyDates.some((busyDate) => {
      const busyDateStart = dayjs(busyDate.start);
      const busyDateEnd = dayjs(busyDate.end);
      const selectedEndTime = dayjs(start.add(offset, "hours")).add(selectedDuration ?? 0, "minute");

      const isOverlapping =
        (selectedEndTime.isSame(busyDateStart) || selectedEndTime.isAfter(busyDateStart)) &&
        start.add(offset, "hours") < busyDateEnd &&
        selectedEndTime > busyDateStart;

      // Busy times spanning several days need the date, the time alone would be ambiguous
      const timeFormat = busyDateStart.isSame(busyDateEnd, "day") ? "HH:mm" : "MMM D, HH:mm";
      overlappingTimeStart = isOverlapping ? busyDateStart.format(timeFormat) : null;
      overlappingTimeEnd = isOverlapping ? busyDateEnd.format(timeFormat) : null;
      overlappingTitle = isOverlapping ? (busyDate.title ?? null) : null;

      return isOverlapping;
    });

  return { isOverlapping, overlappingTimeStart, overlappingTimeEnd, overlappingTitle } as {
    isOverlapping: boolean;
    overlappingTimeStart: string | null;
    overlappingTimeEnd: string | null;
    overlappingTitle: string | null;
  };
}
