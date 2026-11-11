import type { IGetAvailableSlots } from "@calcom/features/bookings/Booker/hooks/useAvailableTimeSlots";
import { ErrorWithCode } from "@calcom/lib/errors";
import { addDays, weekdayOf } from "./calendarDate";
import { BOOKING_ASSISTANT_LIMITS } from "./limits";
import type { UnderstoodSlotRequest } from "./slotRequestSchema";

type SlotFilter = Pick<
  UnderstoodSlotRequest,
  "dateFrom" | "dateTo" | "timeWindows" | "weekdays" | "preference"
>;
type TimeWindow = SlotFilter["timeWindows"][number];

export type FilterSlotsParams = {
  slots: IGetAvailableSlots["slots"];
  filter: SlotFilter;
  // The booker's timezone. The filter's dates, times and weekdays are all expressed in it.
  timeZone: string;
};

type MatchedSlot = {
  time: string;
  instant: number;
  // The booker's calendar day the slot counts towards, which differs from its own date after midnight.
  day: string;
};

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

// Intl handles DST per instant, which dayjs.tz would too, but without the per-slot cost.
const createLocalTimeReader = (timeZone: string) => {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw ErrorWithCode.Factory.BadRequest(`Unable to filter slots: "${timeZone}" is not a valid timezone`);
  }

  return (instant: number) => {
    const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
    for (const part of formatter.formatToParts(instant)) {
      parts[part.type] = part.value;
    }
    return {
      localDate: `${parts.year}-${parts.month}-${parts.day}`,
      minutes: Number(parts.hour) * 60 + Number(parts.minute),
    };
  };
};

/**
 * Returns the day the slot counts towards for this window, or null if it is outside the window.
 * The window end is exclusive. A window whose end is before its start wraps past midnight, and its
 * after-midnight part belongs to the previous day: 00:30 in "Friday 22:00-01:00" is Friday night.
 */
const getWindowDay = (localDate: string, minutes: number, window: TimeWindow) => {
  const from = toMinutes(window.from);
  const to = toMinutes(window.to);
  if (from < to) return minutes >= from && minutes < to ? localDate : null;
  if (minutes >= from) return localDate;
  if (minutes < to) return addDays(localDate, -1);
  return null;
};

const pickSpread = (sortedSlots: MatchedSlot[], limit: number) => {
  const slotsByDay = new Map<string, MatchedSlot[]>();
  for (const slot of sortedSlots) {
    const daySlots = slotsByDay.get(slot.day);
    if (daySlots) {
      daySlots.push(slot);
    } else {
      slotsByDay.set(slot.day, [slot]);
    }
  }
  // Array.from rather than spread: @calcom/trpc compiles this file with an ES5 target.
  const days = Array.from(slotsByDay.values());

  if (days.length >= limit) {
    // Evenly spaced day indexes that always include the first and last day.
    const step = (days.length - 1) / Math.max(limit - 1, 1);
    return Array.from({ length: limit }, (_, index) => days[Math.round(index * step)][0]);
  }

  const picked = new Set(days.map((daySlots) => daySlots[0]));
  for (const slot of sortedSlots) {
    if (picked.size >= limit) break;
    picked.add(slot);
  }
  return Array.from(picked).sort((a, b) => a.instant - b.instant);
};

const rankSlots = (sortedSlots: MatchedSlot[], preference: SlotFilter["preference"]) => {
  const limit = BOOKING_ASSISTANT_LIMITS.maxSuggestions;
  switch (preference) {
    case "earliest":
      return sortedSlots.slice(0, limit);
    case "latest":
      return sortedSlots.slice(-limit).reverse();
    case "spread":
      return pickSpread(sortedSlots, limit);
  }
};

/**
 * Narrows slots already computed by the slot engine to those matching the booker's request.
 * It only ever removes and orders slots, so every returned time is one the engine offered.
 * Results are best match first, at most BOOKING_ASSISTANT_LIMITS.maxSuggestions long.
 */
export function filterSlots({ slots, filter, timeZone }: FilterSlotsParams): string[] {
  const readLocalTime = createLocalTimeReader(timeZone);
  const weekdays = new Set(filter.weekdays);
  const isDayAllowed = (day: string | null): day is string =>
    day !== null &&
    day >= filter.dateFrom &&
    day <= filter.dateTo &&
    (weekdays.size === 0 || weekdays.has(weekdayOf(day)));

  const seenInstants = new Set<number>();
  const matches: MatchedSlot[] = [];

  // Date keys are ignored because the engine may key slots by a different timezone than the filter uses.
  for (const daySlots of Object.values(slots)) {
    for (const slot of daySlots) {
      // Away entries only mark out-of-office periods in the Booker; they can't be booked.
      if (slot.away) continue;

      const instant = Date.parse(slot.time);
      if (Number.isNaN(instant) || seenInstants.has(instant)) continue;
      seenInstants.add(instant);

      const { localDate, minutes } = readLocalTime(instant);
      const candidateDays =
        filter.timeWindows.length === 0
          ? [localDate]
          : filter.timeWindows.map((window) => getWindowDay(localDate, minutes, window));
      const day = candidateDays.find(isDayAllowed);
      if (!day) continue;

      matches.push({ time: slot.time, instant, day });
    }
  }

  matches.sort((a, b) => a.instant - b.instant);
  return rankSlots(matches, filter.preference).map((slot) => slot.time);
}
