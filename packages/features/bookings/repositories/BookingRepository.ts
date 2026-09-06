import { withReporting } from "@calcom/lib/sentryWrapper";
import type { PrismaClient } from "@calcom/prisma";
import type { Booking, Prisma } from "@calcom/prisma/client";
import { BookingStatus, RRTimestampBasis } from "@calcom/prisma/enums";
import { bookingDetailsSelect, bookingMinimalSelect } from "@calcom/prisma/selects/booking";
import { credentialForCalendarServiceSelect } from "@calcom/prisma/selects/credential";
import type {
  BookingUpdateData,
  BookingWhereInput,
  BookingWhereUniqueInput,
  IBookingRepository,
} from "./IBookingRepository";

const referenceSelect = {
  uid: true,
  type: true,
  externalCalendarId: true,
  credentialId: true,
};

type ManagedEventReassignmentCreateParams = {
  uid: string;
  userId: number;
  userPrimaryEmail: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  status: BookingStatus;
  location: string | null;
  smsReminderNumber: string | null;
  responses?: Prisma.JsonValue | null;
  customInputs?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  idempotencyKey: string;
  eventTypeId: number;
  attendees: {
    name: string;
    email: string;
    timeZone: string;
    locale: string | null;
    phoneNumber?: string | null;
  }[];
  paymentId?: number;
  iCalUID: string;
  iCalSequence: number;
  tx?: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
};

export type ManagedEventReassignmentCreatedBooking = {
  id: number;
  uid: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  location: string | null;
  metadata: Prisma.JsonValue;
  responses: Prisma.JsonValue;
  iCalUID: string | null;
  iCalSequence: number;
  smsReminderNumber: string | null;
  attendees: {
    name: string;
    email: string;
    timeZone: string;
    locale: string | null;
  }[];
};

export type ManagedEventCancellationResult = {
  id: number;
  uid: string;
  metadata: Prisma.JsonValue;
  status: BookingStatus;
};


type TeamBookingsParamsBase = {
  user: { id: number; email: string };
  teamId: number;
  startDate: Date;
  endDate: Date;
  excludedUid?: string | null;
  includeManagedEvents: boolean;
  shouldReturnCount?: boolean;
};

type TeamBookingsMultipleUsersParamsBase = {
  users: { id: number; email: string }[];
  teamId: number;
  startDate: Date;
  endDate: Date;
  excludedUid?: string | null;
  includeManagedEvents: boolean;
  shouldReturnCount?: boolean;
};

type TeamBookingsMultipleUsersParamsWithCount = TeamBookingsMultipleUsersParamsBase & {
  shouldReturnCount: true;
};

type TeamBookingsMultipleUsersParamsWithoutCount = TeamBookingsMultipleUsersParamsBase;

type TeamBookingsParamsWithCount = TeamBookingsParamsBase & {
  shouldReturnCount: true;
};

type TeamBookingsParamsWithoutCount = TeamBookingsParamsBase;

const buildWhereClauseForActiveBookings = ({
  eventTypeId,
  startDate,
  endDate,
  users,
  includeNoShowInRRCalculation = false,
  rrTimestampBasis,
}: {
  eventTypeId: number;
  startDate?: Date;
  endDate?: Date;
  users: { id: number; email: string }[];
  includeNoShowInRRCalculation: boolean;
  rrTimestampBasis: RRTimestampBasis;
}): Prisma.BookingWhereInput => ({
  OR: [
    {
      userId: {
        in: users.map((user) => user.id),
      },
      ...(!includeNoShowInRRCalculation
        ? {
            OR: [{ noShowHost: false }, { noShowHost: null }],
          }
        : {}),
    },
    {
      attendees: {
        some: {
          email: {
            in: users.map((user) => user.email),
          },
        },
      },
    },
  ],
  ...(!includeNoShowInRRCalculation ? { attendees: { some: { noShow: false } } } : {}),
  status: BookingStatus.ACCEPTED,
  eventTypeId,
  ...(startDate || endDate
    ? rrTimestampBasis === RRTimestampBasis.CREATED_AT
      ? {
          createdAt: {
            ...(startDate ? { gte: startDate } : {}),
            ...(endDate ? { lte: endDate } : {}),
          },
        }
      : {
          startTime: {
            ...(startDate ? { gte: startDate } : {}),
            ...(endDate ? { lte: endDate } : {}),
          },
        }
    : {}),
});

const selectStatementToGetBookingForCalEventBuilder = {
  id: true,
  uid: true,
  title: true,
  startTime: true,
  endTime: true,
  description: true,
  customInputs: true,
  responses: true,
  metadata: true,
  location: true,
  iCalUID: true,
  iCalSequence: true,
  oneTimePassword: true,
  status: true,
  eventTypeId: true,
  userId: true,
  smsReminderNumber: true,
  cancellationReason: true,
  rejectionReason: true,
  rescheduledBy: true,
  attendees: {
    select: {
      name: true,
      email: true,
      timeZone: true,
      locale: true,
      phoneNumber: true,
      bookingSeat: {
        select: {
          id: true,
          referenceUid: true,
          bookingId: true,
          attendeeId: true,
          data: true,
          metadata: true,
        },
      },
    },
  },
  user: {
    // Organizer
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      timeZone: true,
      locale: true,
      timeFormat: true,
      hideBranding: true,
      destinationCalendar: true,
      profiles: {
        select: {
          organizationId: true,
          organization: { select: { hideBranding: true } },
        },
      },
    },
  },
  // destination calendar of the Organizer
  destinationCalendar: true,
  eventType: {
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      hideCalendarNotes: true,
      price: true,
      currency: true,
      length: true,
      hideCalendarEventDetails: true,
      hideOrganizerEmail: true,
      schedulingType: true,
      seatsPerTimeSlot: true,
      seatsShowAttendees: true,
      seatsShowAvailabilityCount: true,
      customReplyToEmail: true,
      disableRescheduling: true,
      disableCancelling: true,
      requiresConfirmation: true,
      recurringEvent: true,
      bookingFields: true,
      metadata: true,
      eventName: true,
      team: {
        select: {
          id: true,
          name: true,
          parentId: true,
          hideBranding: true,
          parent: { select: { hideBranding: true } },
          members: {
            select: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  username: true,
                  timeZone: true,
                  locale: true,
                  timeFormat: true,
                },
              },
            },
          },
        },
      },
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          timeZone: true,
          locale: true,
          timeFormat: true,
          destinationCalendar: true,
        },
      },
      hosts: {
        select: {
          userId: true,
          isFixed: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
              timeZone: true,
              locale: true,
              timeFormat: true,
              destinationCalendar: true,
            },
          },
        },
      },
    },
  },
  references: {
    where: {
      deleted: null,
    },
    select: {
      type: true,
      meetingId: true,
      meetingPassword: true,
      meetingUrl: true,
      uid: true,
    },
  },
  seatsReferences: {
    select: {
      id: true,
      referenceUid: true,
      attendee: { select: { id: true, email: true, phoneNumber: true } },
    },
  },
  assignmentReason: {
    select: {
      reasonEnum: true,
      reasonString: true,
    },
    orderBy: {
      createdAt: "desc" as const,
    },
    take: 1,
  },
};

export class BookingRepository implements IBookingRepository {
  constructor(private prismaClient: PrismaClient) {}

  async findAcceptedForEventTypeAtStartTime({
    eventTypeId,
    startTime,
  }: {
    eventTypeId: number;
    startTime: Date;
  }) {
    return this.prismaClient.booking.findFirst({
      where: { eventTypeId, startTime, status: BookingStatus.ACCEPTED },
      select: { userId: true, attendees: { select: { email: true } } },
    });
  }

  async updateICalUID({ bookingId, iCalUID }: { bookingId: number; iCalUID: string | null }) {
    return this.prismaClient.booking.update({ where: { id: bookingId }, data: { iCalUID } });
  }

  async updateLocationMetadataAndReferences({
    bookingUid,
    location,
    metadata,
    references,
  }: {
    bookingUid: string;
    location: string | null | undefined;
    metadata: Prisma.InputJsonValue;
    references: Prisma.BookingReferenceCreateManyBookingInput[];
  }) {
    return this.prismaClient.booking.update({
      where: { uid: bookingUid },
      data: { location, metadata, references: { createMany: { data: references } } },
    });
  }

  /**
   * Gets the fromReschedule field for a booking by UID
   * Used to identify if this booking was created from a reschedule
   * @param bookingUid - The unique identifier of the booking
   * @returns The fromReschedule UID or null if not found/not a rescheduled booking
   */
  async getFromRescheduleUid(bookingUid: string): Promise<string | null> {
    const booking = await this.prismaClient.booking.findUnique({
      where: { uid: bookingUid },
      select: { fromReschedule: true },
    });
    return booking?.fromReschedule ?? null;
  }

  async getBookingAttendees(bookingId: number) {
    return await this.prismaClient.attendee.findMany({
      where: {
        bookingId,
      },
    });
  }

  async getBookingWithEventTypeTeamId({ bookingId }: { bookingId: number }) {
    return await this.prismaClient.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        userId: true,
        eventType: {
          select: {
            teamId: true,
          },
        },
      },
    });
  }

  async findByUidIncludeEventTypeAttendeesAndUser({ bookingUid }: { bookingUid: string }) {
    return await this.prismaClient.booking.findUnique({
      where: { uid: bookingUid },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        title: true,
        metadata: true,
        uid: true,
        location: true,
        destinationCalendar: true,
        smsReminderNumber: true,
        userPrimaryEmail: true,
        eventType: {
          select: {
            id: true,
            hideOrganizerEmail: true,
            customReplyToEmail: true,
            schedulingType: true,
            slug: true,
            title: true,
            metadata: true,
            parentId: true,
            teamId: true,
            userId: true,
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
            parent: {
              select: {
                teamId: true,
              },
            },
            owner: {
              select: {
                id: true,
                hideBranding: true,
                email: true,
                name: true,
                timeZone: true,
                locale: true,
                profiles: {
                  select: {
                    organization: { select: { hideBranding: true } },
                  },
                },
              },
            },
            team: {
              select: {
                parentId: true,
                name: true,
                id: true,
                hideBranding: true,
                parent: { select: { hideBranding: true } },
              },
            },
          },
        },
        attendees: {
          select: {
            id: true,
            email: true,
            name: true,
            timeZone: true,
            locale: true,
            phoneNumber: true,
            noShow: true,
          },
        },
        user: {
          select: {
            id: true,
            uuid: true,
            email: true,
            name: true,
            destinationCalendar: true,
            timeZone: true,
            locale: true,
            username: true,
            timeFormat: true,
          },
        },
        noShowHost: true,
      },
    });
  }

  async findByUidIncludeEventType({ bookingUid }: { bookingUid: string }) {
    return await this.prismaClient.booking.findUnique({
      where: {
        uid: bookingUid,
      },
      select: {
        userId: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        attendees: {
          select: {
            email: true,
          },
        },
        eventType: {
          select: {
            teamId: true,
            parent: {
              select: {
                teamId: true,
              },
            },
            hosts: {
              select: {
                userId: true,
                user: {
                  select: {
                    email: true,
                  },
                },
              },
            },
            users: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
    });
  }

  async findByIdIncludeEventType({ bookingId }: { bookingId: number }) {
    return await this.prismaClient.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        userId: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        attendees: {
          select: {
            email: true,
          },
        },
        eventType: {
          select: {
            teamId: true,
            parent: {
              select: {
                teamId: true,
              },
            },
            hosts: {
              select: {
                userId: true,
                user: {
                  select: {
                    email: true,
                  },
                },
              },
            },
            users: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
    });
  }

  async findFirstBookingByReschedule({ originalBookingUid }: { originalBookingUid: string }) {
    return await this.prismaClient.booking.findFirst({
      where: {
        fromReschedule: originalBookingUid,
      },
      select: {
        uid: true,
      },
    });
  }

  async findReschedulerByUid({ uid }: { uid: string }) {
    return await this.prismaClient.booking.findUnique({
      where: {
        uid,
      },
      select: {
        rescheduledBy: true,
        uid: true,
      },
    });
  }

  async findByUidIncludeReport({ bookingUid }: { bookingUid: string }) {
    return await this.prismaClient.booking.findUnique({
      where: {
        uid: bookingUid,
      },
      select: {
        id: true,
        uid: true,
        startTime: true,
        status: true,
        recurringEventId: true,
        attendees: {
          select: {
            email: true,
          },
        },
        seatsReferences: {
          select: {
            referenceUid: true,
            attendee: {
              select: {
                email: true,
              },
            },
          },
        },
        report: {
          select: {
            id: true,
          },
        },
      },
    });
  }

  async findByUidForDetails({ bookingUid }: { bookingUid: string }) {
    return await this.prismaClient.booking.findUnique({
      where: {
        uid: bookingUid,
      },
      select: bookingDetailsSelect,
    });
  }

  async findRescheduledToBooking({ bookingUid }: { bookingUid: string }) {
    return await this.prismaClient.booking.findFirst({
      where: {
        fromReschedule: bookingUid,
      },
      select: {
        uid: true,
      },
    });
  }

  async findPreviousBooking({ fromReschedule }: { fromReschedule: string }) {
    return await this.prismaClient.booking.findUnique({
      where: {
        uid: fromReschedule,
      },
      select: {
        uid: true,
        startTime: true,
        endTime: true,
      },
    });
  }

  async getActiveRecurringBookingsFromDate({
    recurringEventId,
    fromDate,
  }: {
    recurringEventId: string;
    fromDate: Date;
  }) {
    return await this.prismaClient.booking.findMany({
      where: {
        recurringEventId,
        startTime: { gte: fromDate },
        status: { in: [BookingStatus.ACCEPTED, BookingStatus.PENDING] },
      },
      select: { id: true, uid: true },
      orderBy: { startTime: "asc" },
    });
  }

  private async _findAllExistingBookingsForEventTypeBetween({
    eventTypeId,
    seatedEvent = false,
    startDate,
    endDate,
    userIdAndEmailMap,
  }: {
    startDate: Date;
    endDate: Date;
    eventTypeId?: number | null;
    seatedEvent?: boolean;
    userIdAndEmailMap: Map<number, string>;
  }) {
    const sharedQuery = {
      startTime: { lte: endDate },
      endTime: { gte: startDate },
      status: {
        in: [BookingStatus.ACCEPTED],
      },
    };

    const bookingsSelect = {
      id: true,
      uid: true,
      userId: true,
      startTime: true,
      endTime: true,
      title: true,
      attendees: true,
      eventType: {
        select: {
          id: true,
          onlyShowFirstAvailableSlot: true,
          afterEventBuffer: true,
          beforeEventBuffer: true,
          seatsPerTimeSlot: true,
          requiresConfirmationWillBlockSlot: true,
          requiresConfirmation: true,
          allowReschedulingPastBookings: true,
          hideOrganizerEmail: true,
        },
      },
      ...(seatedEvent && {
        _count: {
          select: {
            seatsReferences: true,
          },
        },
      }),
    } satisfies Prisma.BookingSelect;

    const currentBookingsAllUsersQueryOne = this.prismaClient.booking.findMany({
      where: {
        ...sharedQuery,
        userId: {
          in: Array.from(userIdAndEmailMap.keys()),
        },
      },
      select: bookingsSelect,
    });

    const currentBookingsAllUsersQueryTwo = this.prismaClient.booking.findMany({
      where: {
        ...sharedQuery,
        attendees: {
          some: {
            email: {
              in: Array.from(userIdAndEmailMap.values()),
            },
          },
        },
      },
      select: bookingsSelect,
    });

    const currentBookingsAllUsersQueryThree = eventTypeId
      ? this.prismaClient.booking.findMany({
          where: {
            startTime: { lte: endDate },
            endTime: { gte: startDate },
            eventType: {
              id: eventTypeId,
              requiresConfirmation: true,
              requiresConfirmationWillBlockSlot: true,
            },
            status: {
              in: [BookingStatus.PENDING],
            },
          },
          select: bookingsSelect,
        })
      : [];

    const [resultOne, resultTwo, resultThree] = await Promise.all([
      currentBookingsAllUsersQueryOne,
      currentBookingsAllUsersQueryTwo,
      currentBookingsAllUsersQueryThree,
    ]);
    // Prevent duplicate booking records when the organizer books his own event type.
    //
    // *Three is about PENDING, so will never overlap
    // with the other two, which are about ACCEPTED. But ACCEPTED affects *One & *Two
    // and WILL result in a duplicate booking if the organizer books himself.
    const resultTwoWithOrganizersRemoved = resultTwo.filter((booking) => {
      if (!booking.userId) return true;
      const organizerEmail = userIdAndEmailMap.get(booking.userId);
      return !booking.attendees.some((attendee) => attendee.email === organizerEmail);
    });

    return [...resultOne, ...resultTwoWithOrganizersRemoved, ...resultThree];
  }

  findAllExistingBookingsForEventTypeBetween = withReporting(
    this._findAllExistingBookingsForEventTypeBetween.bind(this),
    "findAllExistingBookingsForEventTypeBetween"
  );

  async getAllBookingsForRoundRobin({
    users,
    eventTypeId,
    startDate,
    endDate,
    includeNoShowInRRCalculation,
    rrTimestampBasis,
  }: {
    users: { id: number; email: string }[];
    eventTypeId: number;
    startDate?: Date;
    endDate?: Date;
    includeNoShowInRRCalculation: boolean;
    rrTimestampBasis: RRTimestampBasis;
  }) {
    return await this.prismaClient.booking.findMany({
      where: buildWhereClauseForActiveBookings({
        eventTypeId,
        startDate,
        endDate,
        users,
        includeNoShowInRRCalculation,
        rrTimestampBasis,
      }),
      select: {
        id: true,
        attendees: true,
        userId: true,
        createdAt: true,
        status: true,
        startTime: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async findBookingByUid({ bookingUid }: { bookingUid: string }) {
    return await this.prismaClient.booking.findUnique({
      where: {
        uid: bookingUid,
      },
      select: bookingMinimalSelect,
    });
  }

  async findBookingByUidWithEventType({ bookingUid }: { bookingUid: string }) {
    return await this.prismaClient.booking.findUnique({
      where: {
        uid: bookingUid,
      },
      include: {
        eventType: true,
      },
    });
  }

  async findByIdIncludeUserAndAttendees(bookingId: number) {
    return await this.prismaClient.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        ...bookingMinimalSelect,
        eventType: {
          select: {
            title: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
          },
        },
        attendees: {
          select: {
            name: true,
            email: true,
            phoneNumber: true,
          },
          // Ascending order ensures that the first attendee in the list is the booker and others are guests
          // See why it is important https://github.com/calcom/cal.diy/pull/20935
          // TODO: Ideally we should return `booker` property directly from the booking
          orderBy: {
            id: "asc",
          },
        },
      },
    });
  }

  async findBookingIncludeCalVideoSettingsAndReferences({ bookingUid }: { bookingUid: string }) {
    return await this.prismaClient.booking.findUnique({
      where: {
        uid: bookingUid,
      },
      select: {
        ...bookingMinimalSelect,
        uid: true,
        description: true,
        isRecorded: true,
        eventType: {
          select: {
            id: true,
            hideOrganizerEmail: true,
            hosts: {
              select: {
                userId: true,
                user: {
                  select: {
                    email: true,
                  },
                },
              },
            },
            users: {
              select: {
                id: true,
                email: true,
              },
            },
            calVideoSettings: {
              select: {
                disableRecordingForGuests: true,
                disableRecordingForOrganizer: true,
                enableAutomaticTranscription: true,
                enableAutomaticRecordingForOrganizer: true,
                disableTranscriptionForGuests: true,
                disableTranscriptionForOrganizer: true,
                redirectUrlOnExit: true,
                requireEmailForGuests: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            timeZone: true,
            name: true,
            email: true,
            username: true,
          },
        },
        references: {
          select: {
            id: true,
            uid: true,
            type: true,
            meetingUrl: true,
            meetingPassword: true,
          },
          where: {
            type: "daily_video",
            deleted: null,
          },
          orderBy: {
            id: "asc",
          },
        },
      },
    });
  }

  async findBookingForMeetingEndedPage({ bookingUid }: { bookingUid: string }) {
    return await this.prismaClient.booking.findUnique({
      where: {
        uid: bookingUid,
      },
      select: {
        ...bookingMinimalSelect,
        uid: true,
      },
    });
  }

  async findBookingByUidAndUserId({ bookingUid, userId }: { bookingUid: string; userId: number }) {
    return await this.prismaClient.booking.findFirst({
      where: {
        uid: bookingUid,
        OR: [
          { userId: userId },
          {
            eventType: {
              hosts: {
                some: {
                  userId,
                },
              },
            },
          },
          {
            eventType: {
              users: {
                some: {
                  id: userId,
                },
              },
            },
          },
          {
            eventType: {
              team: {
                members: {
                  some: {
                    userId,
                    accepted: true,
                    role: {
                      in: ["ADMIN", "OWNER"],
                    },
                  },
                },
              },
            },
          },
          {
            eventType: {
              parent: {
                team: {
                  members: {
                    some: {
                      userId,
                      accepted: true,
                      role: {
                        in: ["ADMIN", "OWNER"],
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    });
  }

  async updateLocationById({
    where: { id },
    data: { location, metadata, referencesToCreate, responses, iCalSequence },
  }: {
    where: { id: number };
    data: {
      location: string;
      metadata: Record<string, unknown>;
      referencesToCreate: Prisma.BookingReferenceCreateInput[];
      responses?: Record<string, unknown>;
      iCalSequence?: number;
    };
  }) {
    await this.prismaClient.booking.update({
      where: {
        id,
      },
      data: {
        location,
        // FIXME: metadata is untyped
        metadata: metadata as unknown as Prisma.InputJsonValue,
        // FIXME: responses is untyped
        ...(responses && { responses: responses as unknown as Prisma.InputJsonValue }),
        ...(iCalSequence !== undefined && { iCalSequence }),
        references: {
          create: referencesToCreate,
        },
      },
    });
  }

  async getAllAcceptedTeamBookingsOfUser(params: TeamBookingsParamsWithCount): Promise<number>;

  async getAllAcceptedTeamBookingsOfUser(params: TeamBookingsParamsWithoutCount): Promise<Array<Booking>>;

  async getAllAcceptedTeamBookingsOfUser(params: TeamBookingsParamsBase) {
    const { user, teamId, startDate, endDate, excludedUid, shouldReturnCount, includeManagedEvents } = params;

    const baseWhere: Prisma.BookingWhereInput = {
      status: BookingStatus.ACCEPTED,
      startTime: {
        gte: startDate,
      },
      endTime: {
        lte: endDate,
      },
      ...(excludedUid && {
        uid: {
          not: excludedUid,
        },
      }),
    };

    const whereCollectiveRoundRobinOwner: Prisma.BookingWhereInput = {
      ...baseWhere,
      userId: user.id,
      eventType: {
        teamId,
      },
    };

    const whereCollectiveRoundRobinBookingsAttendee: Prisma.BookingWhereInput = {
      ...baseWhere,
      attendees: {
        some: {
          email: user.email,
        },
      },
      eventType: {
        teamId,
      },
    };

    const whereManagedBookings: Prisma.BookingWhereInput = {
      ...baseWhere,
      userId: user.id,
      eventType: {
        parent: {
          teamId,
        },
      },
    };

    if (shouldReturnCount) {
      const collectiveRoundRobinBookingsOwner = await this.prismaClient.booking.count({
        where: whereCollectiveRoundRobinOwner,
      });

      const collectiveRoundRobinBookingsAttendee = await this.prismaClient.booking.count({
        where: whereCollectiveRoundRobinBookingsAttendee,
      });

      let managedBookings = 0;

      if (includeManagedEvents) {
        managedBookings = await this.prismaClient.booking.count({
          where: whereManagedBookings,
        });
      }

      const totalNrOfBooking =
        collectiveRoundRobinBookingsOwner + collectiveRoundRobinBookingsAttendee + managedBookings;

      return totalNrOfBooking;
    }
    const collectiveRoundRobinBookingsOwner = await this.prismaClient.booking.findMany({
      where: whereCollectiveRoundRobinOwner,
    });

    const collectiveRoundRobinBookingsAttendee = await this.prismaClient.booking.findMany({
      where: whereCollectiveRoundRobinBookingsAttendee,
    });

    let managedBookings: typeof collectiveRoundRobinBookingsAttendee = [];

    if (includeManagedEvents) {
      managedBookings = await this.prismaClient.booking.findMany({
        where: whereManagedBookings,
      });
    }

    return [
      ...collectiveRoundRobinBookingsOwner,
      ...collectiveRoundRobinBookingsAttendee,
      ...managedBookings,
    ];
  }

  async findOriginalRescheduledBooking(uid: string, seatsEventType?: boolean) {
    return await this.prismaClient.booking.findFirst({
      where: {
        uid: uid,
        status: {
          in: [BookingStatus.ACCEPTED, BookingStatus.CANCELLED, BookingStatus.PENDING],
        },
      },
      include: {
        attendees: {
          select: {
            name: true,
            email: true,
            locale: true,
            timeZone: true,
            phoneNumber: true,
            ...(seatsEventType && { bookingSeat: true, id: true }),
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            locale: true,
            timeZone: true,
            timeFormat: true,
            destinationCalendar: true,
            credentials: {
              select: credentialForCalendarServiceSelect,
            },
          },
        },
        eventType: {
          select: {
            id: true,
            minimumRescheduleNotice: true,
            disableRescheduling: true,
            userId: true,
          },
        },
        destinationCalendar: true,
        payment: true,
        references: true,
      },
    });
  }

  async getAllAcceptedTeamBookingsOfUsers(params: TeamBookingsMultipleUsersParamsWithCount): Promise<number>;

  async getAllAcceptedTeamBookingsOfUsers(
    params: TeamBookingsMultipleUsersParamsWithoutCount
  ): Promise<Array<Booking>>;

  async getAllAcceptedTeamBookingsOfUsers(params: TeamBookingsMultipleUsersParamsBase) {
    const { users, teamId, startDate, endDate, excludedUid, shouldReturnCount, includeManagedEvents } =
      params;

    const baseWhere: Prisma.BookingWhereInput = {
      status: BookingStatus.ACCEPTED,
      startTime: {
        gte: startDate,
      },
      endTime: {
        lte: endDate,
      },
      ...(excludedUid && {
        uid: {
          not: excludedUid,
        },
      }),
    };

    const userIds = users.map((user) => user.id);
    const userEmails = users.map((user) => user.email);

    const whereCollectiveRoundRobinOwner: Prisma.BookingWhereInput = {
      ...baseWhere,
      userId: {
        in: userIds,
      },
      eventType: {
        teamId,
      },
    };

    const whereCollectiveRoundRobinBookingsAttendee: Prisma.BookingWhereInput = {
      ...baseWhere,
      attendees: {
        some: {
          email: {
            in: userEmails,
          },
        },
      },
      eventType: {
        teamId,
      },
    };

    const whereManagedBookings: Prisma.BookingWhereInput = {
      ...baseWhere,
      userId: {
        in: userIds,
      },
      eventType: {
        parent: {
          teamId,
        },
      },
    };

    if (shouldReturnCount) {
      const collectiveRoundRobinBookingsOwner = await this.prismaClient.booking.count({
        where: whereCollectiveRoundRobinOwner,
      });

      const collectiveRoundRobinBookingsAttendee = await this.prismaClient.booking.count({
        where: whereCollectiveRoundRobinBookingsAttendee,
      });

      let managedBookings = 0;

      if (includeManagedEvents) {
        managedBookings = await this.prismaClient.booking.count({
          where: whereManagedBookings,
        });
      }

      const totalNrOfBooking =
        collectiveRoundRobinBookingsOwner + collectiveRoundRobinBookingsAttendee + managedBookings;

      return totalNrOfBooking;
    }

    const collectiveRoundRobinBookingsOwner = await this.prismaClient.booking.findMany({
      where: whereCollectiveRoundRobinOwner,
    });

    const collectiveRoundRobinBookingsAttendee = await this.prismaClient.booking.findMany({
      where: whereCollectiveRoundRobinBookingsAttendee,
    });

    let managedBookings: typeof collectiveRoundRobinBookingsAttendee = [];

    if (includeManagedEvents) {
      managedBookings = await this.prismaClient.booking.findMany({
        where: whereManagedBookings,
      });
    }

    return [
      ...collectiveRoundRobinBookingsOwner,
      ...collectiveRoundRobinBookingsAttendee,
      ...managedBookings,
    ];
  }

  async getValidBookingFromEventTypeForAttendee({
    eventTypeId,
    bookerEmail,
    bookerPhoneNumber,
    startTime,
    filterForUnconfirmed,
  }: {
    eventTypeId: number;
    bookerEmail?: string;
    bookerPhoneNumber?: string;
    startTime: Date;
    filterForUnconfirmed?: boolean;
  }) {
    return await this.prismaClient.booking.findFirst({
      where: {
        eventTypeId,
        attendees: {
          some: {
            email: bookerEmail,
            phoneNumber: bookerPhoneNumber,
          },
        },
        startTime,
        status: filterForUnconfirmed ? BookingStatus.PENDING : BookingStatus.ACCEPTED,
      },
      include: {
        attendees: true,
        references: true,
        user: true,
        payment: true,
      },
    });
  }

  async countBookingsByEventTypeAndDateRange({
    eventTypeId,
    startDate,
    endDate,
    excludedUid,
  }: {
    eventTypeId: number;
    startDate: Date;
    endDate: Date;
    excludedUid?: string;
  }) {
    return await this.prismaClient.booking.count({
      where: {
        status: BookingStatus.ACCEPTED,
        eventTypeId,
        startTime: {
          gte: startDate,
        },
        endTime: {
          lte: endDate,
        },
        uid: {
          not: excludedUid,
        },
      },
    });
  }

  async findAcceptedBookingByEventTypeId({
    eventTypeId,
    dateFrom,
    dateTo,
  }: {
    eventTypeId?: number;
    dateFrom: string;
    dateTo: string;
  }) {
    return this.prismaClient.booking.findMany({
      where: {
        eventTypeId,
        startTime: {
          gte: dateFrom,
          lte: dateTo,
        },
        status: BookingStatus.ACCEPTED,
      },
      select: {
        uid: true,
        startTime: true,
        attendees: {
          select: {
            email: true,
          },
        },
      },
    });
  }

  async getTotalBookingDuration({
    eventId,
    startDate,
    endDate,
    rescheduleUid,
  }: {
    eventId: number;
    startDate: Date;
    endDate: Date;
    rescheduleUid?: string;
  }) {
    let totalBookingTime;

    if (rescheduleUid) {
      [totalBookingTime] = await this.prismaClient.$queryRaw<[{ totalMinutes: number | null }]>`
      SELECT SUM(EXTRACT(EPOCH FROM ("endTime" - "startTime")) / 60) as "totalMinutes"
      FROM "Booking"
      WHERE "status" = 'accepted'
        AND "eventTypeId" = ${eventId}
        AND "startTime" >= ${startDate}
        AND "endTime" <= ${endDate}
        AND "uid" != ${rescheduleUid};
    `;
    } else {
      [totalBookingTime] = await this.prismaClient.$queryRaw<[{ totalMinutes: number | null }]>`
      SELECT SUM(EXTRACT(EPOCH FROM ("endTime" - "startTime")) / 60) as "totalMinutes"
      FROM "Booking"
      WHERE "status" = 'accepted'
        AND "eventTypeId" = ${eventId}
        AND "startTime" >= ${startDate}
        AND "endTime" <= ${endDate};
    `;
    }

    // PostgreSQL 16+ returns `numeric` type from EXTRACT(EPOCH FROM ...) instead of `double precision`.
    // Prisma maps `numeric` to a JavaScript Decimal object, which causes string concatenation
    // instead of numeric addition when used with the `+` operator (e.g., Decimal(30) + 30 = "3030").
    // Explicitly convert to a plain number to ensure correct arithmetic in all callers.
    return Number(totalBookingTime.totalMinutes ?? 0);
  }

  async findOriginalRescheduledBookingUserId({ rescheduleUid }: { rescheduleUid: string }) {
    return await this.prismaClient.booking.findFirst({
      where: {
        uid: rescheduleUid,
        status: {
          in: [BookingStatus.ACCEPTED, BookingStatus.CANCELLED, BookingStatus.PENDING],
        },
      },
      select: {
        userId: true,
        attendees: {
          select: {
            email: true,
          },
        },
      },
    });
  }

  async getBookingForPaymentProcessing(bookingId: number) {
    return await this.prismaClient.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        id: true,
        uid: true,
        title: true,
        startTime: true,
        endTime: true,
        userPrimaryEmail: true,
        status: true,
        eventTypeId: true,
        userId: true,
        attendees: {
          select: {
            name: true,
            email: true,
            timeZone: true,
            locale: true,
          },
        },
        eventType: {
          select: {
            title: true,
            hideOrganizerEmail: true,
            teamId: true,
            metadata: true,
            team: {
              select: {
                id: true,
                hideBranding: true,
                parent: { select: { hideBranding: true } },
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            timeZone: true,
            locale: true,
            hideBranding: true,
            profiles: {
              select: {
                organizationId: true,
                organization: { select: { hideBranding: true } },
              },
            },
          },
        },
        payment: {
          select: {
            id: true,
            amount: true,
            currency: true,
            paymentOption: true,
            appId: true,
            success: true,
            data: true,
          },
        },
      },
    });
  }

  async updateMany({ where, data }: { where: BookingWhereInput; data: BookingUpdateData }) {
    return await this.prismaClient.booking.updateMany({
      where: where,
      data,
    });
  }

  async update({ where, data }: { where: BookingWhereUniqueInput; data: BookingUpdateData }) {
    return await this.prismaClient.booking.update({
      where,
      data,
    });
  }

  async updateNoShowHost({
    bookingUid,
    noShowHost,
  }: {
    bookingUid: string;
    noShowHost: boolean;
  }): Promise<{ id: number }> {
    return await this.prismaClient.booking.update({
      where: { uid: bookingUid },
      data: { noShowHost },
      select: { id: true },
    });
  }

  /**
   * Update a booking and return it with references
   * Used during booking cancellation to update status and retrieve related data in one query
   */
  async updateIncludeReferences({
    where,
    data,
  }: {
    where: BookingWhereUniqueInput;
    data: BookingUpdateData;
  }) {
    return await this.prismaClient.booking.update({
      where,
      data,
      select: {
        id: true,
        startTime: true,
        endTime: true,
        references: {
          select: referenceSelect,
        },
        uid: true,
      },
    });
  }

  /**
   * Find bookings with references for cleanup during cancellation
   * Used after bulk cancellation of recurring events
   */
  async findManyIncludeReferences({ where }: { where: BookingWhereInput }) {
    return await this.prismaClient.booking.findMany({
      where,
      select: {
        id: true,
        startTime: true,
        endTime: true,
        references: {
          select: referenceSelect,
        },
        uid: true,
      },
    });
  }

  async getBookingForCalEventBuilder(bookingId: number) {
    return await this.prismaClient.booking.findUnique({
      where: { id: bookingId },
      select: selectStatementToGetBookingForCalEventBuilder,
    });
  }

  async getBookingForCalEventBuilderFromUid(bookingUid: string) {
    return this.prismaClient.booking.findUnique({
      where: { uid: bookingUid },
      select: selectStatementToGetBookingForCalEventBuilder,
    });
  }

  async findByIdIncludeDestinationCalendar(bookingId: number) {
    return await this.prismaClient.booking.findUnique({
      where: {
        id: bookingId,
      },
      include: {
        attendees: true,
        eventType: {
          select: {
            teamId: true,
            bookingFields: true,
            title: true,
            hideOrganizerEmail: true,
            recurringEvent: true,
            seatsPerTimeSlot: true,
            seatsShowAttendees: true,
            customReplyToEmail: true,
            metadata: true,
            schedulingType: true,
            team: {
              select: {
                id: true,
                name: true,
                hideBranding: true,
                parent: { select: { hideBranding: true } },
              },
            },
          },
        },
        destinationCalendar: true,
        references: true,
        user: {
          include: {
            destinationCalendar: true,
            credentials: true,
            profiles: {
              select: {
                organizationId: true,
                organization: { select: { hideBranding: true } },
              },
            },
          },
        },
      },
    });
  }

  async findByIdForReassignment(bookingId: number) {
    return await this.prismaClient.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        id: true,
        uid: true,
        eventTypeId: true,
        userId: true,
        startTime: true,
        endTime: true,
      },
    });
  }

  async findByIdWithAttendeesPaymentAndReferences(bookingId: number) {
    return await this.prismaClient.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        uid: true,
        title: true,
        description: true,
        customInputs: true,
        responses: true,
        startTime: true,
        endTime: true,
        metadata: true,
        status: true,
        location: true,
        smsReminderNumber: true,
        iCalUID: true,
        iCalSequence: true,
        eventTypeId: true,
        userId: true,
        attendees: {
          select: {
            name: true,
            email: true,
            timeZone: true,
            locale: true,
            phoneNumber: true,
          },
          orderBy: {
            id: "asc",
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            name: true,
            timeZone: true,
            locale: true,
            timeFormat: true,
          },
        },
        payment: {
          select: {
            id: true,
          },
        },
        references: {
          select: {
            uid: true,
            type: true,
            meetingUrl: true,
            meetingId: true,
            meetingPassword: true,
            externalCalendarId: true,
            credentialId: true,
            thirdPartyRecurringEventId: true,
            delegationCredentialId: true,
          },
        },
      },
    });
  }

  async updateBookingAttendees({
    bookingId,
    newAttendees,
    updatedResponses,
  }: {
    bookingId: number;
    newAttendees: { name: string; email: string; timeZone: string; locale: string | null }[];
    updatedResponses: Prisma.InputJsonValue;
  }) {
    return await this.prismaClient.booking.update({
      where: {
        id: bookingId,
      },
      include: {
        attendees: true,
      },
      data: {
        attendees: {
          createMany: {
            data: newAttendees,
          },
        },
        responses: updatedResponses,
      },
    });
  }

  findByUidIncludeEventTypeAndReferences({ bookingUid }: { bookingUid: string }) {
    return this.prismaClient.booking.findUniqueOrThrow({
      where: {
        uid: bookingUid,
      },
      select: {
        id: true,
        uid: true,
        userId: true,
        status: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
        title: true,
        description: true,
        startTime: true,
        endTime: true,
        eventTypeId: true,
        userPrimaryEmail: true,
        eventType: {
          select: {
            teamId: true,
            parentId: true,
            slug: true,
            title: true,
            length: true,
            hideOrganizerEmail: true,
            customReplyToEmail: true,
            bookingFields: true,
            metadata: true,
            team: {
              select: {
                id: true,
                name: true,
                parentId: true,
              },
            },
          },
        },
        location: true,
        attendees: true,
        references: true,
        customInputs: true,
        dynamicEventSlugRef: true,
        dynamicGroupSlugRef: true,
        destinationCalendar: true,
        smsReminderNumber: true,
        responses: true,
        iCalUID: true,
        iCalSequence: true,
      },
    });
  }

  async updateBookingStatus({
    bookingId,
    status,
    cancellationReason,
    cancelledBy,
    rescheduledBy,
    rescheduled,
  }: {
    bookingId: number;
    status?: BookingStatus;
    cancellationReason?: string;
    cancelledBy?: string;
    rescheduledBy?: string;
    rescheduled?: boolean;
  }) {
    return await this.prismaClient.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        ...(status !== undefined && { status }),
        ...(rescheduled !== undefined && { rescheduled }),
        ...(cancellationReason !== undefined && { cancellationReason }),
        ...(cancelledBy !== undefined && { cancelledBy }),
        ...(rescheduledBy !== undefined && { rescheduledBy }),
        updatedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Cancels a booking as part of the Managed Event reassignment flow.
   * Callers only pass domain data; repository handles persistence details.
   */
  async cancelBookingForManagedEventReassignment({
    bookingId,
    cancellationReason,
    metadata,
    tx,
  }: {
    bookingId: number;
    cancellationReason: string;
    metadata?: Record<string, unknown> | null;
    tx?: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
  }): Promise<ManagedEventCancellationResult> {
    const client = tx ?? this.prismaClient;
    return client.booking.update({
      where: { id: bookingId },
      data: {
        cancellationReason,
        metadata: metadata as unknown as Prisma.InputJsonValue,
        status: BookingStatus.CANCELLED,
      },
      select: {
        id: true,
        uid: true,
        metadata: true,
        status: true,
      },
    });
  }

  /**
   * Creates a booking specifically for Managed Event reassignment flows.
   * Encapsulates the select shape so callers don't deal with Prisma selections.
   */
  async createBookingForManagedEventReassignment(
    params: ManagedEventReassignmentCreateParams
  ): Promise<ManagedEventReassignmentCreatedBooking> {
    const {
      uid,
      userId,
      userPrimaryEmail,
      title,
      description,
      startTime,
      endTime,
      status,
      location,
      smsReminderNumber,
      responses,
      customInputs,
      metadata,
      idempotencyKey,
      eventTypeId,
      attendees,
      paymentId,
      iCalUID,
      iCalSequence,
      tx,
    } = params;
    const client = tx ?? this.prismaClient;
    return client.booking.create({
      data: {
        uid,
        userPrimaryEmail,
        title,
        description,
        startTime,
        endTime,
        status,
        location,
        smsReminderNumber,
        responses: responses ?? undefined,
        customInputs: (customInputs as unknown as Prisma.InputJsonValue) ?? undefined,
        metadata: (metadata as unknown as Prisma.InputJsonValue) ?? undefined,
        idempotencyKey,
        iCalUID,
        iCalSequence,
        eventType: {
          connect: { id: eventTypeId },
        },
        user: {
          connect: { id: userId },
        },
        attendees: {
          createMany: {
            data: attendees.map((attendee) => ({
              name: attendee.name,
              email: attendee.email,
              timeZone: attendee.timeZone,
              locale: attendee.locale,
              phoneNumber: attendee.phoneNumber ?? null,
            })),
          },
        },
        payment: paymentId ? { connect: { id: paymentId } } : undefined,
      },
      select: {
        id: true,
        uid: true,
        title: true,
        description: true,
        startTime: true,
        endTime: true,
        location: true,
        metadata: true,
        responses: true,
        iCalUID: true,
        iCalSequence: true,
        smsReminderNumber: true,
        attendees: {
          select: {
            name: true,
            email: true,
            timeZone: true,
            locale: true,
          },
          orderBy: {
            id: "asc" as const,
          },
        },
      },
    });
  }

  /**
   * Wraps the cancel+create operations for managed events in a single transaction.
   */
  async managedEventReassignmentTransaction({
    bookingId,
    cancellationReason,
    metadata,
    newBookingPlan,
  }: {
    bookingId: number;
    cancellationReason: string;
    metadata?: Record<string, unknown> | null;
    newBookingPlan: Omit<ManagedEventReassignmentCreateParams, "tx">;
  }): Promise<{
    newBooking: ManagedEventReassignmentCreatedBooking;
    cancelledBooking: ManagedEventCancellationResult;
  }> {
    return this.prismaClient.$transaction(async (tx) => {
      const cancelledBooking = await this.cancelBookingForManagedEventReassignment({
        bookingId,
        cancellationReason,
        metadata,
        tx,
      });

      const newBooking = await this.createBookingForManagedEventReassignment({
        ...newBookingPlan,
        tx,
      });

      return { newBooking, cancelledBooking };
    });
  }

  async findByIdForTargetEventTypeSearch(bookingId: number) {
    return this.prismaClient.booking.findUnique({
      where: { id: bookingId },
      select: {
        eventTypeId: true,
        userId: true,
        startTime: true,
        endTime: true,
      },
    });
  }

  async findByIdForWithUserIdAndEventTypeId(bookingId: number) {
    return this.prismaClient.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        eventTypeId: true,
        userId: true,
      },
    });
  }

  async findByIdForReassignmentValidation(bookingId: number) {
    return this.prismaClient.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        recurringEventId: true,
        startTime: true,
        endTime: true,
      },
    });
  }

  async updateRecordedStatus({
    bookingUid,
    isRecorded,
  }: {
    bookingUid: string;
    isRecorded: boolean;
  }): Promise<void> {
    await this.prismaClient.booking.update({
      where: { uid: bookingUid },
      data: { isRecorded },
    });
  }

  async findByUidIncludeUserAndEventTypeTeamAndAttendeesAndAssignmentReason({
    bookingUid,
  }: {
    bookingUid: string;
  }) {
    return await this.prismaClient.booking.findUnique({
      where: { uid: bookingUid },
      select: {
        id: true,
        uid: true,
        title: true,
        startTime: true,
        endTime: true,
        status: true,
        userId: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        eventType: {
          select: {
            id: true,
            title: true,
            slug: true,
            team: {
              select: {
                id: true,
                parentId: true,
              },
            },
          },
        },
        attendees: {
          select: {
            email: true,
          },
        },
        assignmentReason: {
          select: {
            reasonString: true,
          },
          take: 1,
          orderBy: {
            createdAt: "asc" as const,
          },
        },
      },
    });
  }

  async findByIdWithUserAndEventType(bookingId: number) {
    return await this.prismaClient.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        ...bookingMinimalSelect,
        uid: true,
        location: true,
        isRecorded: true,
        eventTypeId: true,
        eventType: {
          select: {
            teamId: true,
            parentId: true,
            canSendCalVideoTranscriptionEmails: true,
            customReplyToEmail: true,
          },
        },
        user: {
          select: {
            id: true,
            timeZone: true,
            email: true,
            name: true,
            locale: true,
            destinationCalendar: true,
          },
        },
      },
    });
  }
}
