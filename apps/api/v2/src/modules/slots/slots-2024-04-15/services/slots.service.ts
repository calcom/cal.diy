import { EventTypesRepository_2024_04_15 } from "@/platform/event-types/event-types_2024_04_15/event-types.repository";
import { SlotsRepository_2024_04_15 } from "@/modules/slots/slots-2024-04-15/slots.repository";
import { Injectable, NotFoundException } from "@nestjs/common";
import { v4 as uuid } from "uuid";

import { ReserveSlotInput_2024_04_15 } from "@calcom/platform-types";

@Injectable()
export class SlotsService_2024_04_15 {
  constructor(
    private readonly eventTypeRepo: EventTypesRepository_2024_04_15,
    private readonly slotsRepo: SlotsRepository_2024_04_15
  ) {}

  async reserveSlot(input: ReserveSlotInput_2024_04_15, headerUid?: string) {
    const uid = headerUid || uuid();
    const eventType = await this.eventTypeRepo.getEventTypeWithSeats(input.eventTypeId);
    if (!eventType) {
      throw new NotFoundException("Event Type not found");
    }

    let shouldReserveSlot = true;
    if (eventType.seatsPerTimeSlot) {
      const bookingWithAttendees = input.bookingUid
        ? await this.slotsRepo.getBookingWithAttendees(input.bookingUid)
        : undefined;
      const bookingAttendeesLength = bookingWithAttendees?.attendees?.length;
      if (bookingAttendeesLength) {
        const seatsLeft = eventType.seatsPerTimeSlot - bookingAttendeesLength;
        if (seatsLeft < 1) shouldReserveSlot = false;
      }
    }

    if (eventType && shouldReserveSlot && !input._isDryRun) {
      await Promise.all(
        eventType.users.map((user) =>
          this.slotsRepo.upsertSelectedSlot(user.id, input, uid, eventType.seatsPerTimeSlot !== null)
        )
      );
    }

    return uid;
  }

  async deleteSelectedslot(uid?: string) {
    if (!uid) return;

    return this.slotsRepo.deleteSelectedSlots(uid);
  }

  async checkIfIsTeamEvent(eventTypeId?: number) {
    if (!eventTypeId) return false;

    const event = await this.eventTypeRepo.getEventTypeById(eventTypeId);
    return !!event?.teamId;
  }
}
