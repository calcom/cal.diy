import dayjs from "@calcom/dayjs";
import type { CheckBookingLimitsService } from "@calcom/features/bookings/lib/checkBookingLimits";
import { checkDurationLimits } from "@calcom/features/bookings/lib/checkDurationLimits";
import type { IntervalLimit } from "@calcom/lib/intervalLimits/intervalLimitSchema";
import { withReporting } from "@calcom/lib/sentryWrapper";

import type { NewBookingEventType } from "./getEventTypesFromDB";

type EventType = Pick<NewBookingEventType, "bookingLimits" | "durationLimits" | "id" | "schedule">;

type InputProps = {
  eventType: EventType;
  reqBodyStart: string;
  reqBodyRescheduleUid?: string;
  // Skip the booking-limit check (e.g. already validated up front for a whole recurring series).
  skipBookingLimits?: boolean;
};

type RecurringInputProps = {
  eventType: Pick<EventType, "bookingLimits" | "id" | "schedule">;
  reqBodyStarts: string[];
  reqBodyRescheduleUid?: string;
};

export interface ICheckBookingAndDurationLimitsService {
  checkBookingLimitsService: CheckBookingLimitsService;
}

export class CheckBookingAndDurationLimitsService {
  constructor(private readonly dependencies: ICheckBookingAndDurationLimitsService) {}

  checkBookingAndDurationLimits = withReporting(
    this._checkBookingAndDurationLimits.bind(this),
    "checkBookingAndDurationLimits"
  );

  async _checkBookingAndDurationLimits({
    eventType,
    reqBodyStart,
    reqBodyRescheduleUid,
    skipBookingLimits = false,
  }: InputProps) {
    if (
      Object.prototype.hasOwnProperty.call(eventType, "bookingLimits") ||
      Object.prototype.hasOwnProperty.call(eventType, "durationLimits")
    ) {
      const startAsDate = dayjs(reqBodyStart).toDate();
      if (!skipBookingLimits && eventType.bookingLimits && Object.keys(eventType.bookingLimits).length > 0) {
        await this.dependencies.checkBookingLimitsService.checkBookingLimits(
          eventType.bookingLimits as IntervalLimit,
          startAsDate,
          eventType.id,
          reqBodyRescheduleUid,
          eventType.schedule?.timeZone
        );
      }
      if (eventType.durationLimits) {
        await checkDurationLimits(
          eventType.durationLimits as IntervalLimit,
          startAsDate,
          eventType.id,
          reqBodyRescheduleUid
        );
      }
    }
  }

  checkRecurringBookingLimits = withReporting(
    this._checkRecurringBookingLimits.bind(this),
    "checkRecurringBookingLimits"
  );

  async _checkRecurringBookingLimits({
    eventType,
    reqBodyStarts,
    reqBodyRescheduleUid,
  }: RecurringInputProps) {
    if (!eventType.bookingLimits || Object.keys(eventType.bookingLimits).length === 0) return;

    await this.dependencies.checkBookingLimitsService.checkBookingLimitsForRecurringBooking(
      eventType.bookingLimits as IntervalLimit,
      reqBodyStarts.map((start) => dayjs(start).toDate()),
      eventType.id,
      reqBodyRescheduleUid,
      eventType.schedule?.timeZone
    );
  }
}
