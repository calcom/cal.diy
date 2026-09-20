import type { Prisma } from "../client";

export const bookingMinimalSelect = {
  id: true,
  title: true,
  userPrimaryEmail: true,
  description: true,
  customInputs: true,
  startTime: true,
  endTime: true,
  attendees: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.BookingSelect;

export const bookingDetailsSelect = {
  uid: true,
  rescheduled: true,
  fromReschedule: true,
  rootBookingUid: true,
  tracking: {
    select: {
      utm_source: true,
      utm_medium: true,
      utm_campaign: true,
      utm_term: true,
      utm_content: true,
    },
  },
} satisfies Prisma.BookingSelect;

export const bookingWithUserAndEventDetailsSelect = {
  title: true,
  description: true,
  startTime: true,
  endTime: true,
  userPrimaryEmail: true,
  uid: true,
  iCalUID: true,
  iCalSequence: true,
  eventTypeId: true,
  id: true,
  userId: true,
  location: true,
  responses: true,
  metadata: true,
  destinationCalendar: {
    select: {
      id: true,
      integration: true,
      externalId: true,
      primaryEmail: true,
      userId: true,
      eventTypeId: true,
      credentialId: true,
      delegationCredentialId: true,
      createdAt: true,
      updatedAt: true,
      customCalendarReminder: true,
    },
  },
  attendees: {
    select: {
      email: true,
      name: true,
      timeZone: true,
      locale: true,
    },
  },
  references: {
    select: {
      id: true,
      type: true,
      uid: true,
      deleted: true,
      credentialId: true,
      delegationCredentialId: true,
      externalCalendarId: true,
    },
  },
  user: {
    select: {
      email: true,
      name: true,
      timeZone: true,
      locale: true,
      credentials: {
        select: {
          id: true,
          type: true,
          delegationCredentialId: true,
        },
      },
      destinationCalendar: {
        select: {
          id: true,
          integration: true,
          externalId: true,
          primaryEmail: true,
          userId: true,
          eventTypeId: true,
          credentialId: true,
          delegationCredentialId: true,
          createdAt: true,
          updatedAt: true,
          customCalendarReminder: true,
        },
      },
      profiles: {
        select: {
          organizationId: true,
        },
      },
    },
  },
  eventType: {
    select: {
      title: true,
      metadata: true,
      recurringEvent: true,
      seatsPerTimeSlot: true,
      seatsShowAttendees: true,
      hideOrganizerEmail: true,
      customReplyToEmail: true,
    },
  },
} satisfies Prisma.BookingSelect;

export type BookingWithUserAndEventDetails = Prisma.BookingGetPayload<{
  select: typeof bookingWithUserAndEventDetailsSelect;
}>;
