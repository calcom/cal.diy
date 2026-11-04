import type { LocationObject } from "@calcom/app-store/locations";
import { getBookingFieldsWithSystemFields } from "@calcom/features/bookings/lib/getBookingFields";
import type { DefaultEvent } from "@calcom/features/eventtypes/lib/defaultEvents";
import { withSelectedCalendars } from "@calcom/features/users/repositories/UserRepository";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { parseRecurringEvent } from "@calcom/lib/isRecurringEvent";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { credentialForCalendarServiceSelect } from "@calcom/prisma/selects/credential";
import { userSelect } from "@calcom/prisma/selects/user";
import {
  customInputSchema,
  EventTypeMetaDataSchema,
  rrSegmentQueryValueSchema,
} from "@calcom/prisma/zod-utils";

const getEventTypesFromDBSelect = {
  id: true,
  customInputs: true,
  disableGuests: true,
  restrictionScheduleId: true,
  useBookerTimezone: true,
  disableRescheduling: true,
  minimumRescheduleNotice: true,
  disableCancelling: true,
  users: {
    select: {
      credentials: {
        select: credentialForCalendarServiceSelect,
      },
      ...userSelect,
    },
  },
  slug: true,
  profile: {
    select: {
      organizationId: true,
    },
  },
  teamId: true,
  team: {
    select: {
      id: true,
      name: true,
      parentId: true,
      bookingLimits: true,
      includeManagedEventsInLimits: true,
      rrResetInterval: true,
      rrTimestampBasis: true,
      hideBranding: true,
      parent: { select: { hideBranding: true } },
    },
  },
  bookingFields: true,
  title: true,
  length: true,
  offsetStart: true,
  eventName: true,
  schedulingType: true,
  description: true,
  periodType: true,
  periodStartDate: true,
  periodEndDate: true,
  periodDays: true,
  periodCountCalendarDays: true,
  lockTimeZoneToggleOnBookingPage: true,
  lockedTimeZone: true,
  requiresConfirmation: true,
  requiresConfirmationForFreeEmail: true,
  requiresBookerEmailVerification: true,
  maxLeadThreshold: true,
  includeNoShowInRRCalculation: true,
  minimumBookingNotice: true,
  slotInterval: true,
  showOptimizedSlots: true,
  maxActiveBookingsPerBooker: true,
  maxActiveBookingPerBookerOfferReschedule: true,
  userId: true,
  price: true,
  currency: true,
  metadata: true,
  destinationCalendar: true,
  hideCalendarNotes: true,
  hideCalendarEventDetails: true,
  hideOrganizerEmail: true,
  seatsPerTimeSlot: true,
  recurringEvent: true,
  seatsShowAttendees: true,
  seatsShowAvailabilityCount: true,
  bookingLimits: true,
  durationLimits: true,
  rescheduleWithSameRoundRobinHost: true,
  assignAllTeamMembers: true,
  isRRWeightsEnabled: true,
  beforeEventBuffer: true,
  customReplyToEmail: true,
  afterEventBuffer: true,
  parentId: true,
  parent: {
    select: {
      teamId: true,
      team: {
        select: {
          id: true,
          parentId: true,
          bookingLimits: true,
          includeManagedEventsInLimits: true,
        },
      },
    },
  },
  useEventTypeDestinationCalendarEmail: true,
  owner: {
    select: {
      id: true,
      hideBranding: true,
      profiles: {
        select: {
          organizationId: true,
          organization: { select: { hideBranding: true } },
        },
        take: 1,
      },
    },
  },
  locations: true,
  timeZone: true,
  schedule: {
    select: {
      id: true,
      availability: true,
      timeZone: true,
    },
  },
  enablePerHostLocations: true,
  hosts: {
    select: {
      isFixed: true,
      priority: true,
      weight: true,
      createdAt: true,
      groupId: true,
      location: {
        select: {
          id: true,
          type: true,
          credentialId: true,
          link: true,
          address: true,
          phoneNumber: true,
        },
      },
      user: {
        select: {
          credentials: {
            select: credentialForCalendarServiceSelect,
          },
          ...userSelect,
        },
      },
      schedule: {
        select: {
          availability: {
            select: {
              date: true,
              startTime: true,
              endTime: true,
              days: true,
            },
          },
          timeZone: true,
          id: true,
        },
      },
    },
  },
  availability: {
    select: {
      date: true,
      startTime: true,
      endTime: true,
      days: true,
    },
  },
  secondaryEmailId: true,
  secondaryEmail: {
    select: {
      id: true,
      email: true,
    },
  },
  assignRRMembersUsingSegment: true,
  rrSegmentQueryValue: true,
  useEventLevelSelectedCalendars: true,
  hostGroups: {
    select: {
      id: true,
      name: true,
    },
  },
  rrHostSubsetEnabled: true,
  instantMeetingExpiryTimeOffsetInSeconds: true,
  autoTranslateInstantMeetingTitleEnabled: true,
} satisfies Prisma.EventTypeSelect;

export const getEventTypesFromDB = async (eventTypeId: number) => {
  const eventType = await prisma.eventType.findUniqueOrThrow({
    where: {
      id: eventTypeId,
    },
    select: getEventTypesFromDBSelect,
  });

  if (!eventType) {
    throw new Error(ErrorCode.EventTypeNotFound);
  }

  const { profile, hosts, users, ...restEventType } = eventType;

  const isOrgTeamEvent = !!eventType?.team && !!profile?.organizationId;

  const hostsWithSelectedCalendars = hosts.map((host) => ({
    ...host,
    user: withSelectedCalendars(host.user),
  }));

  const usersWithSelectedCalendars = users.map((user) => withSelectedCalendars(user));

  return {
    ...restEventType,
    hosts: hostsWithSelectedCalendars,
    users: usersWithSelectedCalendars,
    metadata: EventTypeMetaDataSchema.parse(eventType?.metadata || {}),
    recurringEvent: parseRecurringEvent(eventType?.recurringEvent),
    customInputs: customInputSchema.array().parse(eventType?.customInputs || []),
    locations: (eventType?.locations ?? []) as LocationObject[],
    bookingFields: getBookingFieldsWithSystemFields({ ...restEventType, isOrgTeamEvent }),
    rrSegmentQueryValue: rrSegmentQueryValueSchema.parse(eventType.rrSegmentQueryValue) ?? null,
    isDynamic: false,
    hostGroups: eventType.hostGroups || [],
  };
};

export type getEventTypeResponse = Awaited<ReturnType<typeof getEventTypesFromDB>>;

export type NewBookingEventType = DefaultEvent | getEventTypeResponse;
