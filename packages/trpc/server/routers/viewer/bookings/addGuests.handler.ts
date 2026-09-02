import process from "node:process";
import { getUsersCredentialsIncludeServiceAccountKey } from "@calcom/app-store/delegationCredential";
import { eventTypeMetaDataSchemaWithTypedApps } from "@calcom/app-store/zod-utils";
import dayjs from "@calcom/dayjs";
import { BookingEmailSmsHandler } from "@calcom/features/bookings/lib/BookingEmailSmsHandler";
import EventManager from "@calcom/features/bookings/lib/EventManager";
import { BookingRepository } from "@calcom/features/bookings/repositories/BookingRepository";
import {
  type EventTypeBrandingData,
  getEventTypeService,
} from "@calcom/features/eventtypes/di/EventTypeService.container";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { getTranslation } from "@calcom/i18n/server";
import { extractBaseEmail } from "@calcom/lib/extract-base-email";
import { parseRecurringEvent } from "@calcom/lib/isRecurringEvent";
import logger from "@calcom/lib/logger";
import { prisma } from "@calcom/prisma";
import type { BookingResponses } from "@calcom/prisma/zod-utils";
import { eventTypeBookingFields } from "@calcom/prisma/zod-utils";
import type { CalendarEvent } from "@calcom/types/Calendar";
import { TRPCError } from "@trpc/server";
import type { TrpcSessionUser } from "../../../types";
import type { TAddGuestsInputSchema } from "./addGuests.schema";

type ActionSource = string;

export type TUser = Pick<NonNullable<TrpcSessionUser>, "id" | "email" | "organizationId" | "uuid"> &
  Partial<Pick<NonNullable<TrpcSessionUser>, "profile">>;

type AddGuestsOptions = {
  ctx: {
    user: TUser;
  };
  input: TAddGuestsInputSchema;
  emailsEnabled?: boolean;
  actionSource: ActionSource;
};

export type Booking = NonNullable<
  Awaited<ReturnType<BookingRepository["findByIdIncludeDestinationCalendar"]>>
>;
type OrganizerData = Awaited<ReturnType<typeof getOrganizerData>>;

export const addGuestsHandler = async ({
  ctx,
  input,
  emailsEnabled = true,
  actionSource,
}: AddGuestsOptions) => {
  const { user } = ctx;
  const { bookingId, guests } = input;

  const booking = await getBooking(bookingId);

  await validateUserPermissions(booking, user);

  validateGuestsFieldEnabled(booking);

  const organizer = await getOrganizerData(booking.userId);

  const uniqueGuests = await sanitizeAndFilterGuests(guests, booking);

  const newGuestsDetails = uniqueGuests.map((guest) => ({
    name: guest.name || "",
    email: guest.email,
    timeZone: guest.timeZone || organizer.timeZone,
    locale: guest.language || organizer.locale,
  }));

  const uniqueGuestEmails = uniqueGuests.map((guest) => guest.email);

  const bookingAttendees = await updateBookingAttendees(
    bookingId,
    newGuestsDetails,
    uniqueGuestEmails,
    booking
  );

  // Capture new attendee emails after update for audit logging
  const _newAttendeeEmails = bookingAttendees.attendees.map((attendee) => attendee.email);

  const attendeesList = await prepareAttendeesList(bookingAttendees.attendees);

  const evt = await buildCalendarEvent(booking, organizer, attendeesList);

  await updateCalendarEvent(booking, evt);

  if (emailsEnabled) {
    await sendGuestNotifications(evt, booking, uniqueGuestEmails);
  }

  return { message: "Guests added" };
};

export async function getBooking(bookingId: number) {
  const bookingRepository = new BookingRepository(prisma);
  const booking = await bookingRepository.findByIdIncludeDestinationCalendar(bookingId);

  if (!booking || !booking.user) {
    throw new TRPCError({ code: "NOT_FOUND", message: "booking_not_found" });
  }

  return booking;
}

export async function validateUserPermissions(booking: Booking, user: TUser): Promise<void> {
  const isOrganizer = booking.userId === user.id;
  const isAttendee = !!booking.attendees.find((attendee) => attendee.email === user.email);

  if (!isOrganizer && !isAttendee) {
    throw new TRPCError({ code: "FORBIDDEN", message: "you_do_not_have_permission" });
  }
}

export function validateGuestsFieldEnabled(booking: Booking): void {
  const parsedBookingFields = booking?.eventType?.bookingFields
    ? eventTypeBookingFields.parse(booking.eventType.bookingFields)
    : [];

  const guestsBookingField = parsedBookingFields.find((field) => field.name === "guests");
  if (guestsBookingField?.hidden) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot add guests to this booking. The guests field is disabled for event type "${booking?.eventType?.title}" (ID: ${booking?.eventTypeId}). Please contact the event organizer to enable guest additions.`,
    });
  }
}

export async function getOrganizerData(userId: number | null) {
  if (!userId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "User not found" });
  }

  return await prisma.user.findUniqueOrThrow({
    where: {
      id: userId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      timeZone: true,
      locale: true,
      hideBranding: true,
      profiles: {
        select: {
          organization: { select: { hideBranding: true } },
        },
      },
    },
  });
}

function deduplicateGuestEmails(guests: string[]): string[] {
  const seenBaseEmails = new Set<string>();
  return guests.filter((guest) => {
    const baseEmail = extractBaseEmail(guest).toLowerCase();
    if (seenBaseEmails.has(baseEmail)) {
      return false;
    }
    seenBaseEmails.add(baseEmail);
    return true;
  });
}

function getBlacklistedEmails(): string[] {
  return process.env.BLACKLISTED_GUEST_EMAILS
    ? process.env.BLACKLISTED_GUEST_EMAILS.split(",").map((email) => email.toLowerCase())
    : [];
}

async function getEmailVerificationRequirements(guestEmails: string[]): Promise<Map<string, boolean>> {
  const userRepo = new UserRepository(prisma);
  const guestUsers = await userRepo.findManyByEmailsWithEmailVerificationSettings({
    emails: guestEmails,
  });

  const emailToRequiresVerification = new Map<string, boolean>();
  for (const user of guestUsers) {
    const matchedBase = extractBaseEmail(user.matchedEmail ?? user.email).toLowerCase();
    emailToRequiresVerification.set(matchedBase, user.requiresBookerEmailVerification === true);
  }

  return emailToRequiresVerification;
}

export async function sanitizeAndFilterGuests(
  guests: Array<{
    email: string;
    name?: string;
    timeZone?: string;
    phoneNumber?: string;
    language?: string;
  }>,
  booking: Booking
): Promise<
  Array<{
    email: string;
    name?: string;
    timeZone?: string;
    phoneNumber?: string;
    language?: string;
  }>
> {
  const guestEmails = guests.map((guest) => guest.email);
  const deduplicatedGuests = deduplicateGuestEmails(guestEmails);
  const blacklistedGuestEmails = getBlacklistedEmails();
  const guestEmailsLowerCase = deduplicatedGuests.map((email) => extractBaseEmail(email).toLowerCase());
  const emailToRequiresVerification = await getEmailVerificationRequirements(guestEmailsLowerCase);

  // Create a map of email to guest object using FIRST occurrence (consistent with deduplicateGuestEmails)
  type Guest = {
    email: string;
    name?: string;
    timeZone?: string;
    phoneNumber?: string;
    language?: string;
  };
  const emailToGuestMap = new Map<string, Guest>();
  for (const guest of guests) {
    const baseEmail = extractBaseEmail(guest.email).toLowerCase();
    if (!emailToGuestMap.has(baseEmail)) {
      emailToGuestMap.set(baseEmail, guest);
    }
  }

  const uniqueGuestEmails = deduplicatedGuests.filter((email) => {
    const baseGuestEmail = extractBaseEmail(email).toLowerCase();
    return (
      !booking.attendees.some(
        (attendee) => extractBaseEmail(attendee.email).toLowerCase() === baseGuestEmail
      ) &&
      !blacklistedGuestEmails.includes(baseGuestEmail) &&
      !emailToRequiresVerification.get(baseGuestEmail)
    );
  });

  if (uniqueGuestEmails.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "emails_must_be_unique_valid" });
  }

  // Return the full guest objects for unique emails (using first occurrence)
  return uniqueGuestEmails
    .map((email) => emailToGuestMap.get(extractBaseEmail(email).toLowerCase()))
    .filter((guest): guest is NonNullable<typeof guest> => guest !== undefined);
}

export async function updateBookingAttendees(
  bookingId: number,
  newAttendees: { name: string; email: string; timeZone: string; locale: string | null }[],
  uniqueGuestEmails: string[],
  booking: Booking
) {
  const bookingResponses = booking.responses as BookingResponses;
  const bookingRepository = new BookingRepository(prisma);

  return await bookingRepository.updateBookingAttendees({
    bookingId,
    newAttendees,
    updatedResponses: {
      ...bookingResponses,
      guests: [...(bookingResponses?.guests || []), ...uniqueGuestEmails],
    },
  });
}

export async function prepareAttendeesList(attendees: Booking["attendees"]) {
  const attendeesListPromises = attendees.map(async (attendee) => {
    return {
      name: attendee.name,
      email: attendee.email,
      timeZone: attendee.timeZone,
      language: {
        translate: await getTranslation(attendee.locale ?? "en", "common"),
        locale: attendee.locale ?? "en",
      },
    };
  });

  return await Promise.all(attendeesListPromises);
}

export async function buildCalendarEvent(
  booking: Booking,
  organizer: OrganizerData,
  attendeesList: Awaited<ReturnType<typeof prepareAttendeesList>>
): Promise<CalendarEvent> {
  const tOrganizer = await getTranslation(organizer.locale ?? "en", "common");
  const videoCallReference = booking.references.find((reference) => reference.type.includes("_video"));

  const evt: CalendarEvent = {
    title: booking.title || "",
    type: (booking.eventType?.title as string) || booking?.title || "",
    description: booking.description || "",
    startTime: booking.startTime ? dayjs(booking.startTime).format() : "",
    endTime: booking.endTime ? dayjs(booking.endTime).format() : "",
    organizer: {
      email: booking?.userPrimaryEmail ?? organizer.email,
      name: organizer.name ?? "Nameless",
      timeZone: organizer.timeZone,
      language: { translate: tOrganizer, locale: organizer.locale ?? "en" },
    },
    hideOrganizerEmail: booking.eventType?.hideOrganizerEmail,
    attendees: attendeesList,
    uid: booking.uid,
    iCalUID: booking.iCalUID,
    recurringEvent: parseRecurringEvent(booking.eventType?.recurringEvent),
    location: booking.location,
    destinationCalendar: booking?.destinationCalendar
      ? [booking?.destinationCalendar]
      : booking?.user?.destinationCalendar
        ? [booking?.user?.destinationCalendar]
        : [],
    seatsPerTimeSlot: booking.eventType?.seatsPerTimeSlot,
    seatsShowAttendees: booking.eventType?.seatsShowAttendees,
    customReplyToEmail: booking.eventType?.customReplyToEmail,
    organizationId: booking.user?.profiles?.[0]?.organizationId ?? null,
    hideBranding: booking.eventTypeId
      ? await getEventTypeService().shouldHideBrandingForEventType(booking.eventTypeId, {
          team: booking.eventType?.team
            ? { hideBranding: booking.eventType.team.hideBranding, parent: booking.eventType.team.parent }
            : null,
          owner: {
            id: organizer.id,
            hideBranding: organizer.hideBranding,
            profiles: organizer.profiles ?? [],
          },
        } satisfies EventTypeBrandingData)
      : false,
  };

  if (videoCallReference) {
    evt.videoCallData = {
      type: videoCallReference.type,
      id: videoCallReference.meetingId,
      password: videoCallReference?.meetingPassword,
      url: videoCallReference.meetingUrl,
    };
  }

  return evt;
}

export async function updateCalendarEvent(booking: Booking, evt: CalendarEvent): Promise<void> {
  if (!booking.user) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Booking user not found" });
  }

  const credentials = await getUsersCredentialsIncludeServiceAccountKey(booking.user);

  const eventManager = new EventManager({
    ...booking.user,
    credentials: [...credentials],
  });

  await eventManager.updateCalendarAttendees(evt, booking);
}

async function sendGuestNotifications(
  evt: CalendarEvent,
  booking: Booking,
  uniqueGuests: string[]
): Promise<void> {
  const emailsAndSmsHandler = new BookingEmailSmsHandler({
    logger: logger,
  });

  await emailsAndSmsHandler.handleAddGuests({
    evt,
    eventType: {
      metadata: eventTypeMetaDataSchemaWithTypedApps.parse(booking?.eventType?.metadata),
      schedulingType: booking.eventType?.schedulingType || null,
    },
    newGuests: uniqueGuests,
  });
}
