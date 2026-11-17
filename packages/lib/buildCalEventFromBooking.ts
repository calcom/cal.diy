import dayjs from "@calcom/dayjs";
import { getTranslation } from "@calcom/i18n/server";
import type { Prisma } from "@calcom/prisma/client";
import { parseRecurringEvent } from "./isRecurringEvent";

type DestinationCalendar = {
  id: number;
  integration: string;
  externalId: string;
  primaryEmail: string | null;
  userId: number | null;
  eventTypeId: number | null;
  credentialId: number | null;
  delegationCredentialId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  customCalendarReminder: number | null;
} | null;

type Attendee = {
  email: string;
  name: string;
  timeZone: string;
  locale: string | null;
};

type Organizer = {
  email: string;
  name: string | null;
  timeZone: string;
  locale: string | null;
};

type EventType = {
  title: string;
  recurringEvent: Prisma.JsonValue | null;
  seatsPerTimeSlot: number | null;
  seatsShowAttendees: boolean | null;
  hideOrganizerEmail: boolean;
  customReplyToEmail: string | null;
};

type Booking = {
  title: string;
  description: string | null;
  startTime: Date | null;
  endTime: Date | null;
  userPrimaryEmail: string | null;
  uid: string;
  destinationCalendar: DestinationCalendar;
  user: {
    destinationCalendar: DestinationCalendar;
  } | null;
  attendees: Attendee[];
  eventType: EventType | null;
  iCalUID: string | null;
  iCalSequence: number;
};

export const buildCalEventFromBooking = async ({
  booking,
  organizer,
  location,
  conferenceCredentialId,
  organizationId,
}: {
  booking: Booking;
  organizer: Organizer;
  location: string;
  conferenceCredentialId: number | null;
  organizationId: number | null;
}) => {
  const attendeesList = await Promise.all(
    booking.attendees.map(async (attendee) => {
      return {
        name: attendee.name,
        email: attendee.email,
        timeZone: attendee.timeZone,
        language: {
          translate: await getTranslation(attendee.locale ?? "en", "common"),
          locale: attendee.locale ?? "en",
        },
      };
    })
  );

  const tOrganizer = await getTranslation(organizer.locale ?? "en", "common");

  return {
    title: booking.title || "",
    type: (booking.eventType?.title as string) || booking.title || "",
    description: booking.description || "",
    startTime: booking.startTime ? dayjs(booking.startTime).format() : "",
    endTime: booking.endTime ? dayjs(booking.endTime).format() : "",
    organizer: {
      email: booking.userPrimaryEmail ?? organizer.email,
      name: organizer.name ?? "Nameless",
      timeZone: organizer.timeZone,
      language: { translate: tOrganizer, locale: organizer.locale ?? "en" },
    },
    attendees: attendeesList,
    hideOrganizerEmail: booking.eventType?.hideOrganizerEmail,
    uid: booking.uid,
    recurringEvent: parseRecurringEvent(booking.eventType?.recurringEvent),
    location,
    conferenceCredentialId: conferenceCredentialId ?? undefined,
    destinationCalendar: booking.destinationCalendar
      ? [booking.destinationCalendar]
      : booking.user?.destinationCalendar
        ? [booking.user?.destinationCalendar]
        : [],
    seatsPerTimeSlot: booking.eventType?.seatsPerTimeSlot,
    seatsShowAttendees: booking.eventType?.seatsShowAttendees,
    customReplyToEmail: booking.eventType?.customReplyToEmail,
    iCalUID: booking.iCalUID ?? booking.uid,
    iCalSequence: booking.iCalSequence ?? 0,
    organizationId,
  };
};
