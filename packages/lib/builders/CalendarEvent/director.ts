import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import type { Booking } from "@calcom/prisma/client";
import type { CalendarEventBuilder } from "./builder";

const log = logger.getSubLogger({ prefix: ["builders", "CalendarEvent", "director"] });
export class CalendarEventDirector {
  private builder!: CalendarEventBuilder;
  private existingBooking!: Partial<Booking>;
  private cancellationReason!: string;

  public setBuilder(builder: CalendarEventBuilder): void {
    this.builder = builder;
  }

  public setExistingBooking(
    booking: Pick<
      Booking,
      | "id"
      | "uid"
      | "title"
      | "startTime"
      | "endTime"
      | "eventTypeId"
      | "userId"
      | "dynamicEventSlugRef"
      | "dynamicGroupSlugRef"
      | "location"
    >
  ) {
    this.existingBooking = booking;
  }

  public setCancellationReason(reason: string) {
    this.cancellationReason = reason;
  }

  public async buildForRescheduleEmail({
    allowRescheduleForCancelledBooking = false,
  }: {
    /**
     * By default we don't want to allow reschedule for cancelled bookings.
     */
    allowRescheduleForCancelledBooking?: boolean;
  } = {}): Promise<void> {
    if (this.existingBooking && this.existingBooking.eventTypeId && this.existingBooking.uid) {
      await this.builder.buildEventObjectFromInnerClass(this.existingBooking.eventTypeId);
      await this.builder.buildUsersFromInnerClass();
      this.builder.buildAttendeesList();
      this.builder.setLocation(this.existingBooking.location);
      this.builder.setUId(this.existingBooking.uid);
      this.builder.setCancellationReason(this.cancellationReason);
      this.builder.setDescription(this.builder.eventType.description);
      this.builder.setNotes(this.existingBooking.description);
      this.builder.buildRescheduleLink({ allowRescheduleForCancelledBooking });
      log.debug(
        "buildForRescheduleEmail",
        safeStringify({ existingBooking: this.existingBooking, builder: this.builder })
      );
    } else {
      throw new Error("buildForRescheduleEmail.missing.params.required");
    }
  }

  public async buildWithoutEventTypeForRescheduleEmail() {
    if (this.existingBooking && this.existingBooking.userId && this.existingBooking.uid) {
      await this.builder.setUsersFromId(this.existingBooking.userId);
      this.builder.buildAttendeesList();
      this.builder.setLocation(this.existingBooking.location);
      this.builder.setUId(this.existingBooking.uid);
      this.builder.setCancellationReason(this.cancellationReason);
      this.builder.setDescription(this.existingBooking.description);
      await this.builder.buildRescheduleLink();
    } else {
      throw new Error("buildWithoutEventTypeForRescheduleEmail.missing.params.required");
    }
  }
}
