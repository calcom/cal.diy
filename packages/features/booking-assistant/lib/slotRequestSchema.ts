import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { z } from "zod";
import { addDays, toUtcMs } from "./calendarDate";
import { BOOKING_ASSISTANT_LIMITS } from "./limits";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isValidCalendarDate = (value: string) => {
  if (!DATE_PATTERN.test(value)) return false;
  // Round-tripping rejects dates like 2026-02-30 that Date.UTC would silently roll over.
  return new Date(toUtcMs(value)).toISOString().slice(0, 10) === value;
};

const calendarDateSchema = z.string().refine(isValidCalendarDate, {
  message: "Expected a calendar date in YYYY-MM-DD format",
});

const timeOfDaySchema = z.string().regex(TIME_PATTERN, {
  message: "Expected a time in HH:mm 24-hour format",
});

// `from` later than `to` is allowed: it describes a window that crosses midnight, e.g. 22:00-01:00.
const timeWindowSchema = z
  .object({
    from: timeOfDaySchema,
    to: timeOfDaySchema,
  })
  .refine((window) => window.from !== window.to, {
    message: "A time window must not start and end at the same time",
  });

export const slotPreferenceSchema = z.enum(["earliest", "latest", "spread"]);

const understoodSlotRequestSchema = z.object({
  understood: z.literal(true),
  dateFrom: calendarDateSchema,
  dateTo: calendarDateSchema,
  timeWindows: z.array(timeWindowSchema).max(4).default([]),
  // 0 = Sunday, matching Date.prototype.getDay.
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  preference: slotPreferenceSchema.default("earliest"),
});

const notUnderstoodSlotRequestSchema = z.object({
  understood: z.literal(false),
});

/**
 * The only shape the LLM output is allowed to take. Anything that fails this schema is
 * treated as "not understood", never repaired, so the model cannot smuggle in other values.
 */
export const slotRequestSchema = z
  .discriminatedUnion("understood", [understoodSlotRequestSchema, notUnderstoodSlotRequestSchema])
  .superRefine((request, ctx) => {
    if (request.understood && request.dateFrom > request.dateTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateTo"],
        message: "dateTo must not be before dateFrom",
      });
    }
  });

export type SlotRequest = z.infer<typeof slotRequestSchema>;
export type UnderstoodSlotRequest = Extract<SlotRequest, { understood: true }>;
export type SlotPreference = z.infer<typeof slotPreferenceSchema>;

export type DateRange = {
  dateFrom: string;
  dateTo: string;
};

/**
 * Bounds a requested range to [today, today + maxDaysAhead] and at most maxRangeDays days.
 * `today` must be the current date in the booker's timezone, the same timezone the range is in.
 * Returns null when no part of the range is within the allowed window.
 */
export function clampDateRange(range: DateRange, today: string): DateRange | null {
  if (!isValidCalendarDate(today)) {
    throw new ErrorWithCode(
      ErrorCode.InternalServerError,
      `Unable to clamp booking assistant date range: "${today}" is not a valid YYYY-MM-DD date`
    );
  }

  const horizonEnd = addDays(today, BOOKING_ASSISTANT_LIMITS.maxDaysAhead);
  const dateFrom = range.dateFrom < today ? today : range.dateFrom;
  const boundedTo = range.dateTo > horizonEnd ? horizonEnd : range.dateTo;
  if (dateFrom > boundedTo) return null;

  const maxDateTo = addDays(dateFrom, BOOKING_ASSISTANT_LIMITS.maxRangeDays - 1);
  return {
    dateFrom,
    dateTo: boundedTo > maxDateTo ? maxDateTo : boundedTo,
  };
}
