import process from "node:process";
import { enrichUserWithDelegationCredentials } from "@calcom/app-store/delegationCredential";
import { getCalEventResponses } from "@calcom/features/bookings/lib/getCalEventResponses";
import {
  type EventTypeBrandingData,
  getEventTypeService,
} from "@calcom/features/eventtypes/di/EventTypeService.container";
import { getTranslation } from "@calcom/i18n/server";
import { HttpError as HttpCode } from "@calcom/lib/http-error";
import { isPrismaObjOrUndefined } from "@calcom/lib/isPrismaObj";
import { parseRecurringEvent } from "@calcom/lib/isRecurringEvent";
import { getTimeFormatStringFromUserTimeFormat } from "@calcom/lib/timeFormat";
import { bookingMinimalSelect, prisma } from "@calcom/prisma";
import { credentialForCalendarServiceSelect } from "@calcom/prisma/selects/credential";
import { EventTypeMetaDataSchema } from "@calcom/prisma/zod-utils";
import type { CalendarEvent } from "@calcom/types/Calendar";
import { DisableCancelling } from "@calcom/prisma/client";

const getBookerBaseUrl = async (_orgSlug?: string | number | null): Promise<string> =>
  process.env.NEXT_PUBLIC_WEBAPP_URL || "https://app.cal.com";

async function getEventType(id: number) {
  return prisma.eventType.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      recurringEvent: true,
      requiresConfirmation: true,
      metadata: true,
    },
  });
}
export async function getBooking(bookingId: number) {
  const booking = await prisma.booking.findUnique({
    where: {
      id: bookingId,
    },
    select: {
      ...bookingMinimalSelect,
      responses: true,
      eventType: {
        select: {
          owner: {
            select: {
              hideBranding: true,
            },
          },
          currency: true,
          description: true,
          hosts: {
            select: {
              user: {
                select: {
                  email: true,
                  destinationCalendar: {
                    select: {
                      primaryEmail: true,
                    },
                  },
                },
              },
            },
          },
          id: true,
          length: true,
          price: true,
          requiresConfirmation: true,
          hideOrganizerEmail: true,
          metadata: true,
          customReplyToEmail: true,
          title: true,
          teamId: true,
          parentId: true,
          parent: {
            select: {
              teamId: true,
            },
          },
          slug: true,
          schedulingType: true,
          bookingFields: true,
          team: {
            select: {
              id: true,
              name: true,
              parentId: true,
              hideBranding: true,
              parent: { select: { hideBranding: true } },
            },
          },
          seatsPerTimeSlot: true,
          seatsShowAttendees: true,
          disableCancelling: true,
          disableRescheduling: true,
        },
      },
      metadata: true,
      smsReminderNumber: true,
      location: true,
      eventTypeId: true,
      userId: true,
      uid: true,
      paid: true,
      destinationCalendar: true,
      status: true,
      user: {
        select: {
          id: true,
          username: true,
          timeZone: true,
          credentials: { select: credentialForCalendarServiceSelect },
          timeFormat: true,
          email: true,
          name: true,
          locale: true,
          destinationCalendar: true,
          isPlatformManaged: true,
          hideBranding: true,
          profiles: {
            select: {
              organization: { select: { hideBranding: true } },
            },
          },
        },
      },
    },
  });

  if (!booking) throw new HttpCode({ statusCode: 204, message: "No booking found" });

  type EventTypeRaw = Awaited<ReturnType<typeof getEventType>>;
  let eventTypeRaw: EventTypeRaw | null = null;
  if (booking.eventTypeId) {
    eventTypeRaw = await getEventType(booking.eventTypeId);
  }

  const eventType = { ...eventTypeRaw, metadata: EventTypeMetaDataSchema.parse(eventTypeRaw?.metadata) };

  const { user: userWithoutDelegationCredentials } = booking;

  if (!userWithoutDelegationCredentials) throw new HttpCode({ statusCode: 204, message: "No user found" });
  const user = await enrichUserWithDelegationCredentials({
    user: userWithoutDelegationCredentials,
  });

  const t = await getTranslation(user.locale ?? "en", "common");
  const attendeesListPromises = booking.attendees.map(async (attendee) => {
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

  const organizerOrganizationProfile = await prisma.profile.findFirst({
    where: {
      userId: booking.userId ?? undefined,
    },
  });

  const organizerOrganizationId = organizerOrganizationProfile?.organizationId;

  const bookerUrl = await getBookerBaseUrl(
    booking.eventType?.team?.parentId ?? organizerOrganizationId ?? null
  );

  const attendeesList = await Promise.all(attendeesListPromises);
  const selectedDestinationCalendar = booking.destinationCalendar || user.destinationCalendar;
  const evt: CalendarEvent = {
    type: booking?.eventType?.slug as string,
    title: booking.title,
    bookerUrl,
    description: booking.description || undefined,
    startTime: booking.startTime.toISOString(),
    endTime: booking.endTime.toISOString(),
    customInputs: isPrismaObjOrUndefined(booking.customInputs),
    ...getCalEventResponses({
      booking: booking,
      bookingFields: booking.eventType?.bookingFields || null,
    }),
    organizer: {
      email: booking?.userPrimaryEmail ?? user.email,
      name: user.name!,
      username: user.username || undefined,
      usernameInOrg: organizerOrganizationProfile?.username || undefined,
      timeZone: user.timeZone,
      timeFormat: getTimeFormatStringFromUserTimeFormat(user.timeFormat),
      language: { translate: t, locale: user.locale ?? "en" },
      id: user.id,
    },
    hideOrganizerEmail: booking.eventType?.hideOrganizerEmail,
    team: booking.eventType?.team
      ? {
          name: booking.eventType.team.name,
          id: booking.eventType.team.id,
          members: [],
        }
      : undefined,
    attendees: attendeesList,
    location: booking.location,
    uid: booking.uid,
    destinationCalendar: selectedDestinationCalendar ? [selectedDestinationCalendar] : [],
    recurringEvent: parseRecurringEvent(eventType?.recurringEvent),
    customReplyToEmail: booking.eventType?.customReplyToEmail,
    seatsPerTimeSlot: booking.eventType?.seatsPerTimeSlot,
    seatsShowAttendees: booking.eventType?.seatsShowAttendees,
    hideBranding: booking.eventTypeId
      ? await getEventTypeService().shouldHideBrandingForEventType(booking.eventTypeId, {
          team: booking.eventType?.team
            ? { hideBranding: booking.eventType.team.hideBranding, parent: booking.eventType.team.parent }
            : null,
          owner: {
            id: user.id,
            hideBranding: userWithoutDelegationCredentials.hideBranding,
            profiles: userWithoutDelegationCredentials.profiles ?? [],
          },
        } satisfies EventTypeBrandingData)
      : false,
    disableCancelling: booking.eventType?.disableCancelling ?? DisableCancelling.NOBODY,
    disableRescheduling: booking.eventType?.disableRescheduling ?? false,
  };

  return {
    booking,
    user,
    evt,
    eventType,
  };
}
