import dayjs from "@calcom/dayjs";
import { BookingRepository } from "@calcom/features/bookings/repositories/BookingRepository";
import { getErrorFromUnknown } from "@calcom/lib/errors";
import { HttpError } from "@calcom/lib/http-error";
import { ascendingLimitKeys, intervalLimitKeyToUnit } from "@calcom/lib/intervalLimits/intervalLimit";
import type { IntervalLimit, IntervalLimitKey } from "@calcom/lib/intervalLimits/intervalLimitSchema";
import { parseDurationLimit } from "@calcom/lib/intervalLimits/isDurationLimits";
import prisma from "@calcom/prisma";

export async function checkDurationLimits(
  durationLimits: IntervalLimit,
  eventStartDate: Date,
  eventId: number,
  rescheduleUid?: string,
  timeZone?: string | null
) {
  const parsedDurationLimits = parseDurationLimit(durationLimits);
  if (!parsedDurationLimits) return false;

  // not iterating entries to preserve types
  const limitCalculations = ascendingLimitKeys.map((key) =>
    checkDurationLimit({
      key,
      limitingNumber: parsedDurationLimits[key],
      eventStartDate,
      eventId,
      rescheduleUid,
      timeZone,
    })
  );

  try {
    return !!(await Promise.all(limitCalculations));
  } catch (error) {
    throw new HttpError({ message: getErrorFromUnknown(error).message, statusCode: 401 });
  }
}

export async function checkDurationLimit({
  eventStartDate,
  eventId,
  key,
  limitingNumber,
  rescheduleUid,
  timeZone,
}: {
  eventStartDate: Date;
  eventId: number;
  key: IntervalLimitKey;
  limitingNumber: number | undefined;
  rescheduleUid?: string;
  timeZone?: string | null;
}) {
  {
    if (!limitingNumber) return;

    const unit = intervalLimitKeyToUnit(key);

    const eventDateInOrganizerTz = timeZone ? dayjs(eventStartDate).tz(timeZone) : dayjs(eventStartDate);

    const startDate = eventDateInOrganizerTz.startOf(unit).toDate();
    const endDate = eventDateInOrganizerTz.endOf(unit).toDate();

    const bookingRepo = new BookingRepository(prisma);
    const totalBookingDuration = await bookingRepo.getTotalBookingDuration({
      eventId,
      startDate,
      endDate,
      rescheduleUid,
    });

    if (totalBookingDuration < limitingNumber) return;

    throw new HttpError({
      message: `duration_limit_reached`,
      statusCode: 403,
    });
  }
}
