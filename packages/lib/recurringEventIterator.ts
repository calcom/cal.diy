/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../types/ical.d.ts"/>

import type { Dayjs } from "@calcom/dayjs";
import type ICAL from "ical.js";

/**
 * Creates a recurrence iterator anchored to the event's original DTSTART.
 * For a single unbounded DAILY or WEEKLY rule without RDATEs, seeds the iterator
 * a whole number of periods after DTSTART, ending at least one period before
 * windowStart, preserving weekday and INTERVAL phase without walking years of history.
 */
export function createRecurringEventIterator(event: ICAL.Event, windowStart: Dayjs): ICAL.RecurExpansion {
  if (!event.component.hasProperty("rdate")) {
    const rrules = event.component.getAllProperties("rrule");
    const recur =
      rrules.length === 1 ? (rrules[0].getFirstValue() as ICAL.Recur & { interval?: number }) : null;

    if (recur && !recur.count && (recur.freq === "DAILY" || recur.freq === "WEEKLY")) {
      const interval = recur.interval || 1;
      const periodDays = recur.freq === "DAILY" ? interval : 7 * interval;
      const diffDays = windowStart.diff(event.startDate.toJSDate(), "day");
      const periodsBefore = Math.floor(diffDays / periodDays);

      if (periodsBefore > 1) {
        const jumpDays = (periodsBefore - 1) * periodDays;
        const seedTime = event.startDate.clone();
        seedTime.adjust(jumpDays, 0, 0, 0);
        return event.iterator(seedTime);
      }
    }
  }

  return event.iterator();
}
