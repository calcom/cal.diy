import { sendRescheduledSeatEmailAndSMS } from "@calcom/emails/email-manager";
import type EventManager from "@calcom/features/bookings/lib/EventManager";
import { CalendarEventBuilder } from "@calcom/features/CalendarEventBuilder";
import { getTranslation } from "@calcom/i18n/server";
import prisma from "@calcom/prisma";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import type { PartialReference } from "@calcom/types/EventManager";
import { cloneDeep } from "lodash";
import { findBookingQuery } from "../../../handleNewBooking/findBookingQuery";
import lastAttendeeDeleteBooking from "../../lib/lastAttendeeDeleteBooking";
import {
  getSeatCalendarReferences,
  OFFICE365_CALENDAR_TYPE,
  withSeatCalendarReferences,
} from "../../lib/seatCalendarReferences";
import type { NewTimeSlotBooking, RescheduleSeatedBookingObject, SeatAttendee } from "../../types";

const seatedCalendarAttendeeUpdateOptions = {
  excludedCalendarTypes: [OFFICE365_CALENDAR_TYPE],
};

/**
 * Reschedules a single seated attendee into a new or existing time slot.
 *
 * @param rescheduleSeatedBookingObject - Booking context for the seated reschedule flow.
 * @param seatAttendee - Attendee being moved between seated bookings.
 * @param newTimeSlotBooking - Existing booking for the target time slot, if any.
 * @param originalBookingEvt - Calendar event for the attendee's original booking.
 * @param eventManager - Event manager used for calendar updates.
 * @returns The rescheduled booking response, or null when a new booking should be created.
 */
const attendeeRescheduleSeatedBooking = async (
  rescheduleSeatedBookingObject: RescheduleSeatedBookingObject,
  seatAttendee: SeatAttendee,
  newTimeSlotBooking: NewTimeSlotBooking | null,
  originalBookingEvt: CalendarEvent,
  eventManager: EventManager
) => {
  const { tAttendees, bookingSeat, evt, eventType } = rescheduleSeatedBookingObject;
  let { originalRescheduledBooking } = rescheduleSeatedBookingObject;

  seatAttendee["language"] = { translate: tAttendees, locale: bookingSeat?.attendee.locale ?? "en" };

  // Set attendeeSeatId so that reschedule/cancel links in emails use seatUid instead of bookingUid
  evt.attendeeSeatId = bookingSeat?.referenceUid;

  // Update the original calendar event by removing the attendee that is rescheduling
  if (originalBookingEvt && originalRescheduledBooking) {
    // Event would probably be deleted so we first check than instead of updating references
    const reschedulingAttendeeId = seatAttendee.id ?? bookingSeat?.attendeeId ?? bookingSeat?.attendee.id;
    const filteredAttendees = originalRescheduledBooking?.attendees.filter((attendee) => {
      return attendee.id !== reschedulingAttendeeId;
    });
    const deletedReference = await lastAttendeeDeleteBooking(
      originalRescheduledBooking,
      filteredAttendees,
      originalBookingEvt
    );

    if (!deletedReference) {
      await eventManager.updateCalendarAttendees(
        originalBookingEvt,
        originalRescheduledBooking,
        seatedCalendarAttendeeUpdateOptions
      );
    }
  }

  // If there is no booking then remove the attendee from the old booking and create a new one
  if (!newTimeSlotBooking) {
    await prisma.attendee.delete({
      where: {
        id: seatAttendee?.id,
      },
    });

    const originalBookingReferences = originalRescheduledBooking?.references;

    // We don't want to trigger rescheduling logic of the original booking
    originalRescheduledBooking = null;

    const evtWithVideoCallData = originalBookingReferences
      ? CalendarEventBuilder.fromEvent(evt).withVideoCallDataFromReferences(originalBookingReferences).build()
      : evt;

    await sendRescheduledSeatEmailAndSMS(evtWithVideoCallData, seatAttendee as Person, eventType.metadata);

    return null;
  }

  // Need to change the new seat reference and attendee record to remove it from the old booking and add it to the new booking
  // https://stackoverflow.com/questions/4980963/database-insert-new-rows-or-update-existing-ones
  if (seatAttendee?.id && bookingSeat?.id) {
    await prisma.$transaction([
      prisma.attendee.update({
        where: {
          id: seatAttendee.id,
        },
        data: {
          bookingId: newTimeSlotBooking.id,
        },
      }),
      prisma.bookingSeat.update({
        where: {
          id: bookingSeat.id,
        },
        data: {
          bookingId: newTimeSlotBooking.id,
        },
      }),
    ]);
  }
  // Add the new attendees to the new time slot booking attendees
  for (const attendee of newTimeSlotBooking.attendees) {
    const translate = await getTranslation(attendee.locale ?? "en", "common");
    evt.attendees.push({
      email: attendee.email,
      name: attendee.name,
      timeZone: attendee.timeZone,
      language: { translate, locale: attendee.locale ?? "en" },
    });
  }

  const copyEvent = cloneDeep({ ...evt, iCalUID: newTimeSlotBooking.iCalUID });
  const seatOffice365CalendarReferences = getSeatCalendarReferences(
    bookingSeat?.metadata,
    OFFICE365_CALENDAR_TYPE
  );
  const hasOffice365CalendarReference = newTimeSlotBooking.references.some(
    (reference) => reference.type === OFFICE365_CALENDAR_TYPE
  );

  if (bookingSeat?.id && (hasOffice365CalendarReference || seatOffice365CalendarReferences.length > 0)) {
    let attendeeSeatOffice365References: PartialReference[] = [];

    if (hasOffice365CalendarReference) {
      const attendeeSeatCalendarEvent = {
        ...copyEvent,
        attendees: [seatAttendee as Person],
      };
      const attendeeSeatCalendarManager =
        await eventManager.createCalendarEventForSeatedAttendee(attendeeSeatCalendarEvent);
      attendeeSeatOffice365References = attendeeSeatCalendarManager.referencesToCreate.filter(
        (reference) => reference.type === OFFICE365_CALENDAR_TYPE && reference.uid
      );
    }

    await prisma.bookingSeat.update({
      where: {
        id: bookingSeat.id,
      },
      data: {
        metadata: withSeatCalendarReferences({
          metadata: bookingSeat.metadata,
          integration: OFFICE365_CALENDAR_TYPE,
          references: attendeeSeatOffice365References,
        }),
      },
    });

    if (seatOffice365CalendarReferences.length > 0) {
      await eventManager.cancelEvent(originalBookingEvt, seatOffice365CalendarReferences);
    }
  }

  await eventManager.updateCalendarAttendees(
    copyEvent,
    newTimeSlotBooking,
    seatedCalendarAttendeeUpdateOptions
  );

  const copyEventWithVideoCallData = newTimeSlotBooking.references
    ? CalendarEventBuilder.fromEvent(copyEvent)
        .withVideoCallDataFromReferences(newTimeSlotBooking.references)
        .build()
    : copyEvent;

  await sendRescheduledSeatEmailAndSMS(
    copyEventWithVideoCallData,
    seatAttendee as Person,
    eventType.metadata
  );

  const foundBooking = await findBookingQuery(newTimeSlotBooking.id);

  return { ...foundBooking, seatReferenceUid: bookingSeat?.referenceUid };
};

export default attendeeRescheduleSeatedBooking;
