import dayjs from "@calcom/dayjs";
import getAllUserBookings from "@calcom/features/bookings/lib/getAllUserBookings";
import { isTextFilterValue } from "@calcom/features/data-table/lib/utils";
import type { DB } from "@calcom/kysely";
import kysely from "@calcom/kysely";
import { parseEventTypeColor } from "@calcom/lib/isEventTypeColor";
import { parseRecurringEvent } from "@calcom/lib/isRecurringEvent";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import type { PrismaClient } from "@calcom/prisma";
import type { Booking } from "@calcom/prisma/client";
import { Prisma } from "@calcom/prisma/client";
import { BookingStatus, MembershipRole, SchedulingType } from "@calcom/prisma/enums";
import { EventTypeMetaDataSchema } from "@calcom/prisma/zod-utils";
import { TRPCError } from "@trpc/server";
import type { Kysely, SelectQueryBuilder } from "kysely";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/postgres";
import type { TrpcSessionUser } from "../../../types";
import type { TGetInputSchema } from "./get.schema";

class PermissionCheckService {
  constructor(_prisma?: unknown) {}
  async checkPermission(..._args: unknown[]) { return true; }
  async hasPermission(..._args: unknown[]) { return true; }
  async getTeamIdsWithPermission(..._args: unknown[]): Promise<number[]> { return []; }
}

type GetOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
    prisma: PrismaClient;
  };
  input: TGetInputSchema;
};

type InputByStatus = "upcoming" | "recurring" | "past" | "cancelled" | "unconfirmed";

const log = logger.getSubLogger({ prefix: ["bookings.get"] });

export const getHandler = async ({ ctx, input }: GetOptions) => {
  // Support both offset-based (list) and cursor-based pagination (calendar)
  // Cursor is just the offset as a string (fake cursor pagination)
  const take = input.limit;
  let skip = input.offset;

  // If cursor is provided, parse it to get the offset
  if (input.cursor) {
    const parsedCursor = parseInt(input.cursor, 10);
    if (!Number.isNaN(parsedCursor) && parsedCursor >= 0) {
      skip = parsedCursor;
    }
  }

  const { prisma, user } = ctx;
  const defaultStatus = "upcoming";

  const bookingListingByStatus = input.filters.statuses?.length
    ? input.filters.statuses
    : [input.filters.status || defaultStatus];

  const { bookings, recurringInfo, totalCount } = await getAllUserBookings({
    ctx: {
      user: { id: user.id, email: user.email, orgId: user?.profile?.organizationId },
      prisma: prisma,
      kysely: kysely,
    },
    bookingListingByStatus: bookingListingByStatus,
    take,
    skip,
    filters: input.filters,
    sort: input.sort,
  });

  // Generate next cursor for infinite query support
  const nextOffset = skip + take;
  const hasMore = nextOffset < totalCount;
  const nextCursor = hasMore ? nextOffset.toString() : undefined;

  return {
    bookings,
    recurringInfo,
    totalCount,
    nextCursor,
  };
};

type BookingsUnionQuery = SelectQueryBuilder<
  DB,
  "Booking",
  Pick<Booking, "id" | "createdAt" | "updatedAt" | "startTime" | "endTime">
>;

export async function getBookings({
  user,
  prisma,
  kysely,
  bookingListingByStatus,
  sort,
  filters,
  take,
  skip,
}: {
  user: { id: number; email: string; orgId?: number | null };
  filters: TGetInputSchema["filters"];
  prisma: PrismaClient;
  kysely: Kysely<DB>;
  bookingListingByStatus: InputByStatus[];
  sort?: {
    sortStart?: "asc" | "desc";
    sortEnd?: "asc" | "desc";
    sortCreated?: "asc" | "desc";
    sortUpdated?: "asc" | "desc";
  };
  take: number;
  skip: number;
}) {
  const permissionCheckService = new PermissionCheckService();
  const fallbackRoles: MembershipRole[] = [MembershipRole.ADMIN, MembershipRole.OWNER];

  const teamIdsWithBookingPermission = await permissionCheckService.getTeamIdsWithPermission({
    userId: user.id,
    permission: "booking.read",
    fallbackRoles,
    orgId: user.orgId ?? undefined,
  });

  // Only fetch user IDs from teams if we need to validate userIds filter
  // PERFORMANCE: We no longer need to fetch all emails/IDs for the main query since we use subqueries
  const needsUserIdsValidation = !!filters?.userIds && filters.userIds.length > 0;

  const [
    eventTypeIdsFromTeamIdsFilter,
    attendeeEmailsFromUserIdsFilter,
    eventTypeIdsFromEventTypeIdsFilter,
    allAccessibleUserIds,
  ] = await Promise.all([
    getEventTypeIdsFromTeamIdsFilter(prisma, filters?.teamIds),
    getAttendeeEmailsFromUserIdsFilter(prisma, user.email, filters?.userIds),
    getEventTypeIdsFromEventTypeIdsFilter(prisma, filters?.eventTypeIds),
    // Only fetch accessible user IDs when we need to validate the userIds filter
    needsUserIdsValidation
      ? getUserIdsFromTeamIds(prisma, teamIdsWithBookingPermission)
      : Promise.resolve([]),
  ]);

  const bookingQueries: { query: BookingsUnionQuery; tables: (keyof DB)[] }[] = [];

  // If userIds filter is provided
  if (!!filters?.userIds && filters.userIds.length > 0) {
    const areUserIdsWithinUserOrgOrTeam = filters.userIds.every((userId) =>
      allAccessibleUserIds.includes(userId)
    );

    const isCurrentUser = filters.userIds.length === 1 && user.id === filters.userIds[0];

    //  Scope depends on `user.orgId`:
    // - Throw an error if trying to filter by usersIds that are not within your ORG
    // - Throw an error if trying to filter by usersIds that are not within your TEAM
    if (!areUserIdsWithinUserOrgOrTeam && !isCurrentUser) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have permissions to fetch bookings for specified userIds",
      });
    }

    // 1. Booking created by one of the filtered users
    bookingQueries.push({
      query: kysely
        .selectFrom("Booking")
        .select("Booking.id")
        .select("Booking.startTime")
        .select("Booking.endTime")
        .select("Booking.createdAt")
        .select("Booking.updatedAt")
        .where("userId", "in", filters.userIds),
      tables: ["Booking"],
    });

    // 2. Attendee email matches one of the filtered users' emails
    if (attendeeEmailsFromUserIdsFilter?.length) {
      bookingQueries.push({
        query: kysely
          .selectFrom("Booking")
          .select("Booking.id")
          .select("Booking.startTime")
          .select("Booking.endTime")
          .select("Booking.createdAt")
          .select("Booking.updatedAt")
          .innerJoin("Attendee", "Attendee.bookingId", "Booking.id")
          .where("Attendee.email", "in", attendeeEmailsFromUserIdsFilter),
        tables: ["Booking", "Attendee"],
      });
    }

    // 3. Seat reference attendee email matches one of the filtered users' emails
    if (attendeeEmailsFromUserIdsFilter?.length) {
      bookingQueries.push({
        query: kysely
          .selectFrom("Booking")
          .select("Booking.id")
          .select("Booking.startTime")
          .select("Booking.endTime")
          .select("Booking.createdAt")
          .select("Booking.updatedAt")
          .innerJoin("Attendee", "Attendee.bookingId", "Booking.id")
          .innerJoin("BookingSeat", "Attendee.id", "BookingSeat.attendeeId")
          .where("Attendee.email", "in", attendeeEmailsFromUserIdsFilter),
        tables: ["Booking", "Attendee", "BookingSeat"],
      });
    }
  } else {
    // 1. Current user created bookings
    bookingQueries.push({
      query: kysely
        .selectFrom("Booking")
        .select("Booking.id")
        .select("Booking.startTime")
        .select("Booking.endTime")
        .select("Booking.createdAt")
        .select("Booking.updatedAt")
        .where("Booking.userId", "=", user.id),
      tables: ["Booking"],
    });
    // 2. Current user is an attendee
    bookingQueries.push({
      query: kysely
        .selectFrom("Booking")
        .select("Booking.id")
        .select("Booking.startTime")
        .select("Booking.endTime")
        .select("Booking.createdAt")
        .select("Booking.updatedAt")
        .innerJoin("Attendee", "Attendee.bookingId", "Booking.id")
        .where("Attendee.email", "=", user.email),
      tables: ["Booking", "Attendee"],
    });
    // 3. Current user is an attendee via seats reference
    bookingQueries.push({
      query: kysely
        .selectFrom("Booking")
        .select("Booking.id")
        .select("Booking.startTime")
        .select("Booking.endTime")
        .select("Booking.createdAt")
        .select("Booking.updatedAt")
        .innerJoin("BookingSeat", "BookingSeat.bookingId", "Booking.id")
        .innerJoin("Attendee", "Attendee.bookingId", "Booking.id")
        .where("Attendee.email", "=", user.email),
      tables: ["Booking", "Attendee", "BookingSeat"],
    });
    // 4. Scope depends on `user.orgId`:
    // - If Current user is ORG_OWNER/ADMIN or has booking.read permission, get bookings where organization/team members are attendees
    // PERFORMANCE: Use subquery with team membership instead of materializing all emails (can be 400+ for large orgs)
    if (teamIdsWithBookingPermission?.length) {
      bookingQueries.push({
        query: kysely
          .selectFrom("Booking")
          .select("Booking.id")
          .select("Booking.startTime")
          .select("Booking.endTime")
          .select("Booking.createdAt")
          .select("Booking.updatedAt")
          .innerJoin("Attendee", "Attendee.bookingId", "Booking.id")
          .where("Attendee.email", "in", (eb) =>
            eb
              .selectFrom("users")
              .select("users.email")
              .innerJoin("Membership", "Membership.userId", "users.id")
              .where("Membership.teamId", "in", teamIdsWithBookingPermission)
          ),
        tables: ["Booking", "Attendee"],
      });
    }
    // 5. Scope depends on `user.orgId`:
    // - If Current user is ORG_OWNER/ADMIN or has booking.read permission, get bookings where organization/team members are attendees via seatsReference
    // PERFORMANCE: Use subquery with team membership instead of materializing all emails
    if (teamIdsWithBookingPermission?.length) {
      bookingQueries.push({
        query: kysely
          .selectFrom("Booking")
          .select("Booking.id")
          .select("Booking.startTime")
          .select("Booking.endTime")
          .select("Booking.createdAt")
          .select("Booking.updatedAt")
          .innerJoin("Attendee", "Attendee.bookingId", "Booking.id")
          .innerJoin("BookingSeat", "Attendee.id", "BookingSeat.attendeeId")
          .where("Attendee.email", "in", (eb) =>
            eb
              .selectFrom("users")
              .select("users.email")
              .innerJoin("Membership", "Membership.userId", "users.id")
              .where("Membership.teamId", "in", teamIdsWithBookingPermission)
          ),
        tables: ["Booking", "Attendee", "BookingSeat"],
      });
    }

    // 6. Scope depends on `user.orgId`:
    // - If Current user is ORG_OWNER/ADMIN or has booking.read permission, get booking created for an event type within the organization/team
    // PERFORMANCE: Use subquery to get event type IDs instead of materializing them
    if (teamIdsWithBookingPermission?.length) {
      bookingQueries.push({
        query: kysely
          .selectFrom("Booking")
          .select("Booking.id")
          .select("Booking.startTime")
          .select("Booking.endTime")
          .select("Booking.createdAt")
          .select("Booking.updatedAt")
          .where("Booking.eventTypeId", "in", (eb) =>
            eb
              .selectFrom("EventType")
              .select("EventType.id")
              .where("EventType.teamId", "in", teamIdsWithBookingPermission)
          ),
        tables: ["Booking"],
      });
    }

    // 7. Scope depends on `user.orgId`:
    // - If Current user is ORG_OWNER/ADMIN or has booking.read permission, get bookings created by users within the same organization/team
    // PERFORMANCE: Use subquery with team membership instead of materializing all user IDs
    if (teamIdsWithBookingPermission?.length) {
      bookingQueries.push({
        query: kysely
          .selectFrom("Booking")
          .select("Booking.id")
          .select("Booking.startTime")
          .select("Booking.endTime")
          .select("Booking.createdAt")
          .select("Booking.updatedAt")
          .where("Booking.userId", "in", (eb) =>
            eb
              .selectFrom("Membership")
              .select("Membership.userId")
              .where("Membership.teamId", "in", teamIdsWithBookingPermission)
          ),
        tables: ["Booking"],
      });
    }
  }

  const queriesWithFilters = bookingQueries.map(({ query, tables }) => {
    // 1. Apply mandatory status filter
    let fullQuery = addStatusesQueryFilters(query, bookingListingByStatus);

    // 2. Filter by Event Type IDs derived from Team IDs (if provided)
    if (eventTypeIdsFromTeamIdsFilter && eventTypeIdsFromTeamIdsFilter.length > 0) {
      fullQuery = fullQuery.where("Booking.eventTypeId", "in", eventTypeIdsFromTeamIdsFilter);
    }

    // 3. Filter by specific Event Type IDs (if provided)
    // If both teamIds filter and eventTypeIds filter are provided, filter 2. ensures the event-types are within the teams
    if (eventTypeIdsFromEventTypeIdsFilter && eventTypeIdsFromEventTypeIdsFilter.length > 0) {
      fullQuery = fullQuery.where("Booking.eventTypeId", "in", eventTypeIdsFromEventTypeIdsFilter);
    }

    // 4. Filter by Attendee Name (if provided)
    if (filters?.attendeeName) {
      if (typeof filters.attendeeName === "string") {
        // Simple string match (case-insensitive)
        fullQuery = fullQuery
          .innerJoin("Attendee", "Attendee.bookingId", "Booking.id")
          .where(({ eb }) =>
            eb(eb.fn<string>("lower", ["Attendee.name"]), "=", filters.attendeeName.trim().toLowerCase())
          );
      } else if (isTextFilterValue(filters.attendeeName)) {
        // TODO: write makeWhereClause equivalent for kysely
        fullQuery = addAdvancedAttendeeWhereClause(
          fullQuery,
          "name",
          filters.attendeeName.data.operator,
          filters.attendeeName.data.operand,
          tables.includes("Attendee")
        );
      }
    }

    // 5. Filter by Attendee Email (if provided)
    if (filters?.attendeeEmail) {
      if (typeof filters.attendeeEmail === "string") {
        // Simple string match (case-insensitive)
        fullQuery = fullQuery
          .innerJoin("Attendee", "Attendee.bookingId", "Booking.id")
          .where(({ eb }) =>
            eb(eb.fn<string>("lower", ["Attendee.email"]), "=", filters.attendeeEmail.trim().toLowerCase())
          );
      } else if (isTextFilterValue(filters.attendeeEmail)) {
        // TODO: write makeWhereClause equivalent for kysely
        fullQuery = addAdvancedAttendeeWhereClause(
          fullQuery,
          "email",
          filters.attendeeEmail.data.operator,
          filters.attendeeEmail.data.operand,
          tables.includes("Attendee")
        );
      }
    }

    // 6. Filter by Booking Uid (if provided)
    if (filters?.bookingUid) {
      fullQuery = fullQuery.where("Booking.uid", "=", filters.bookingUid.trim());
    }

    // 7. Booking Start/End Time Range Filters
    if (filters?.afterStartDate) {
      fullQuery = fullQuery.where("Booking.startTime", ">=", dayjs.utc(filters.afterStartDate).toDate());
    }
    if (filters?.beforeEndDate) {
      fullQuery = fullQuery.where("Booking.endTime", "<=", dayjs.utc(filters.beforeEndDate).toDate());
    }

    return fullQuery;
  });

  const queryUnion = queriesWithFilters.reduce((acc, query) => {
    return acc.unionAll(query);
  });

  const orderBy = getOrderBy(bookingListingByStatus, sort);

  const getBookingsUnionCompiled = kysely
    .selectFrom(queryUnion.as("union_subquery"))
    .distinct()
    .selectAll("union_subquery")
    .$if(Boolean(filters?.afterUpdatedDate), (eb) =>
      eb.where("union_subquery.updatedAt", ">=", dayjs.utc(filters.afterUpdatedDate).toDate())
    )
    .$if(Boolean(filters?.beforeUpdatedDate), (eb) =>
      eb.where("union_subquery.updatedAt", "<=", dayjs.utc(filters.beforeUpdatedDate).toDate())
    )
    .$if(Boolean(filters?.afterCreatedDate), (eb) =>
      eb.where("union_subquery.createdAt", ">=", dayjs.utc(filters.afterCreatedDate).toDate())
    )
    .$if(Boolean(filters?.beforeCreatedDate), (eb) =>
      eb.where("union_subquery.createdAt", "<=", dayjs.utc(filters.beforeCreatedDate).toDate())
    )
    .orderBy(orderBy.key, orderBy.order)
    .limit(take)
    .offset(skip)
    .compile();

  const bookingsFromUnion = (await kysely.executeQuery(getBookingsUnionCompiled)).rows;

  log.debug(`Get bookings for user ${user.id} SQL:`, getBookingsUnionCompiled.sql);

  const totalCount = Number(
    (
      await kysely
        .selectFrom(queryUnion.as("union_subquery"))
        .select(({ fn }) => fn.count("union_subquery.id").distinct().as("bookingCount"))
        .executeTakeFirst()
    )?.bookingCount ?? 0
  );

  const plainBookings = !(bookingsFromUnion?.length === 0)
    ? await kysely
        .selectFrom("Booking")
        .where(
          "id",
          "in",
          bookingsFromUnion.map((booking) => booking.id)
        )
        .select((eb) => [
          "Booking.id",
          "Booking.title",
          "Booking.userPrimaryEmail",
          "Booking.description",
          "Booking.customInputs",
          "Booking.startTime",
          "Booking.createdAt",
          "Booking.updatedAt",
          "Booking.endTime",
          "Booking.metadata",
          "Booking.uid",
          eb
            .cast<Prisma.JsonValue>(
              // Target TypeScript type
              eb.ref("Booking.responses"), // Source column
              "jsonb" // Target SQL type
            )
            .as("responses"),
          "Booking.recurringEventId",
          "Booking.location",
          eb
            .cast<BookingStatus>(
              eb
                .case()
                .when("Booking.status", "=", "cancelled")
                .then(BookingStatus.CANCELLED)
                .when("Booking.status", "=", "accepted")
                .then(BookingStatus.ACCEPTED)
                .when("Booking.status", "=", "rejected")
                .then(BookingStatus.REJECTED)
                .when("Booking.status", "=", "pending")
                .then(BookingStatus.PENDING)
                .when("Booking.status", "=", "awaiting_host")
                .then(BookingStatus.AWAITING_HOST)
                .else(BookingStatus.PENDING)
                .end(), // End of CASE expression
              "varchar"
            )
            .as("status"),
          "Booking.paid",
          "Booking.fromReschedule",
          "Booking.rescheduled",
          "Booking.rescheduledBy",
          "Booking.cancelledBy",
          "Booking.isRecorded",
          "Booking.cancellationReason",
          "Booking.rejectionReason",
          jsonObjectFrom(
            eb
              .selectFrom("EventType")
              .select((eb) => [
                "EventType.slug",
                "EventType.id",
                "EventType.title",
                "EventType.eventName",
                "EventType.price",
                "EventType.recurringEvent",
                "EventType.currency",
                "EventType.metadata",
                "EventType.disableGuests",
                "EventType.bookingFields",
                "EventType.seatsPerTimeSlot",
                "EventType.seatsShowAttendees",
                "EventType.seatsShowAvailabilityCount",
                "EventType.eventTypeColor",
                "EventType.customReplyToEmail",
                "EventType.allowReschedulingPastBookings",
                "EventType.hideOrganizerEmail",
                "EventType.disableCancelling",
                "EventType.disableRescheduling",
                "EventType.minimumRescheduleNotice",
                "EventType.teamId",
                "EventType.parentId",
                eb
                  .cast<SchedulingType | null>(
                    eb
                      .case()
                      .when("EventType.schedulingType", "=", "roundRobin")
                      .then(SchedulingType.ROUND_ROBIN)
                      .when("EventType.schedulingType", "=", "collective")
                      .then(SchedulingType.COLLECTIVE)
                      .when("EventType.schedulingType", "=", "managed")
                      .then(SchedulingType.MANAGED)
                      .else(null)
                      .end(),
                    "varchar" // Or 'text' - use the actual SQL data type
                  )
                  .as("schedulingType"),
                jsonArrayFrom(
                  eb
                    .selectFrom("Host")
                    .select((eb) => [
                      "Host.userId",
                      jsonObjectFrom(
                        eb
                          .selectFrom("users")
                          .select(["users.id", "users.email"])
                          .whereRef("Host.userId", "=", "users.id")
                      ).as("user"),
                    ])
                    .whereRef("Host.eventTypeId", "=", "EventType.id")
                ).as("hosts"),
                "EventType.length",
                jsonObjectFrom(
                  eb
                    .selectFrom("Team")
                    .select(["Team.id", "Team.name", "Team.slug"])
                    .whereRef("EventType.teamId", "=", "Team.id")
                ).as("team"),
                jsonArrayFrom(
                  eb
                    .selectFrom("HostGroup")
                    .select(["HostGroup.id", "HostGroup.name"])
                    .whereRef("HostGroup.eventTypeId", "=", "EventType.id")
                ).as("hostGroups"),
              ])
              .whereRef("EventType.id", "=", "Booking.eventTypeId")
          ).as("eventType"),
          jsonArrayFrom(
            eb
              .selectFrom("BookingReference")
              .selectAll()
              .whereRef("BookingReference.bookingId", "=", "Booking.id")
          ).as("references"),
          jsonArrayFrom(
            eb
              .selectFrom("Payment")
              .select([
                "Payment.paymentOption",
                "Payment.amount",
                "Payment.currency",
                "Payment.success",
                "Payment.appId",
                "Payment.refunded",
              ])
              .whereRef("Payment.bookingId", "=", "Booking.id")
          ).as("payment"),
          jsonObjectFrom(
            eb
              .selectFrom("users")
              .select([
                "users.id",
                "users.name",
                "users.email",
                "users.avatarUrl",
                "users.username",
                "users.timeZone",
              ])
              .whereRef("Booking.userId", "=", "users.id")
          ).as("user"),
          jsonArrayFrom(
            eb.selectFrom("Attendee").selectAll().whereRef("Attendee.bookingId", "=", "Booking.id")
          ).as("attendees"),
          jsonArrayFrom(
            eb
              .selectFrom("BookingSeat")
              .select((eb) => [
                "BookingSeat.referenceUid",
                jsonObjectFrom(
                  eb
                    .selectFrom("Attendee")
                    .select(["Attendee.email"])
                    .whereRef("BookingSeat.attendeeId", "=", "Attendee.id")
                ).as("attendee"),
              ])
              .whereRef("BookingSeat.bookingId", "=", "Booking.id")
          ).as("seatsReferences"),
          jsonArrayFrom(
            eb
              .selectFrom("AssignmentReason")
              .selectAll()
              .whereRef("AssignmentReason.bookingId", "=", "Booking.id")
              .orderBy("AssignmentReason.createdAt", "asc")
          ).as("assignmentReasonSortedByCreatedAt"),
          jsonObjectFrom(
            eb
              .selectFrom("BookingReport")
              .select([
                "BookingReport.id",
                "BookingReport.reportedById",
                "BookingReport.reason",
                "BookingReport.description",
                "BookingReport.createdAt",
              ])
              .whereRef("BookingReport.bookingUid", "=", "Booking.uid")
          ).as("report"),
        ])
        .orderBy(orderBy.key, orderBy.order)
        .execute()
    : [];

  const [
    recurringInfoBasic,
    recurringInfoExtended,
    // We need all promises to be successful, so we are not using Promise.allSettled
  ] = await Promise.all([
    prisma.booking.groupBy({
      by: ["recurringEventId"],
      _min: {
        startTime: true,
      },
      _count: {
        recurringEventId: true,
      },
      where: {
        recurringEventId: {
          not: { equals: null },
        },
        userId: user.id,
      },
    }),
    prisma.booking.groupBy({
      by: ["recurringEventId", "status", "startTime"],
      _min: {
        startTime: true,
      },
      where: {
        recurringEventId: {
          not: { equals: null },
        },
        userId: user.id,
      },
    }),
  ]);

  const recurringInfo = recurringInfoBasic.map(
    (
      info: (typeof recurringInfoBasic)[number]
    ): {
      recurringEventId: string | null;
      count: number;
      firstDate: Date | null;
      bookings: {
        [key: string]: Date[];
      };
    } => {
      const bookings = recurringInfoExtended.reduce(
        (prev, curr) => {
          if (curr.recurringEventId === info.recurringEventId) {
            prev[curr.status].push(curr.startTime);
          }
          return prev;
        },
        { ACCEPTED: [], CANCELLED: [], REJECTED: [], PENDING: [], AWAITING_HOST: [] } as {
          [key in BookingStatus]: Date[];
        }
      );
      return {
        recurringEventId: info.recurringEventId,
        count: info._count.recurringEventId,
        firstDate: info._min.startTime,
        bookings,
      };
    }
  );

  // Now enrich bookings with relation data. We could have queried the relation data along with the bookings, but that would cause unnecessary queries to the database.
  // Because Prisma is also going to query the select relation data sequentially, we are fine querying it separately here as it would be just 1 query instead of 4
  log.info(
    `fetching all bookings for ${user.id}`,
    safeStringify({
      ids: plainBookings.map((booking) => booking.id),
      filters,
      orderBy,
      take,
      skip,
    })
  );

  const checkIfUserIsHost = (userId: number, booking: (typeof plainBookings)[number]) => {
    if (booking.user?.id === userId) {
      return true;
    }

    if (!booking.eventType?.hosts || booking.eventType.hosts.length === 0) {
      return false;
    }

    const attendeeEmails = new Set(booking.attendees.map((attendee) => attendee.email));

    return booking.eventType.hosts.some(({ user: hostUser }) => {
      return hostUser?.id === userId && attendeeEmails.has(hostUser.email);
    });
  };

  const bookings = await Promise.all(
    plainBookings.map(async (booking) => {
      // If seats are enabled, the event is not set to show attendees, and the current user is not the host, filter out attendees who are not the current user
      if (
        booking.seatsReferences.length &&
        !booking.eventType?.seatsShowAttendees &&
        !checkIfUserIsHost(user.id, booking)
      ) {
        booking.attendees = booking.attendees.filter((attendee) => attendee.email === user.email);
      }

      let rescheduler = null;
      if (booking.fromReschedule) {
        const rescheduledBooking = await prisma.booking.findUnique({
          where: {
            uid: booking.fromReschedule,
          },
          select: {
            rescheduledBy: true,
          },
        });
        if (rescheduledBooking) {
          rescheduler = rescheduledBooking.rescheduledBy;
        }
      }

      return {
        ...booking,
        rescheduler,
        eventType: {
          ...booking.eventType,
          recurringEvent: parseRecurringEvent(booking.eventType?.recurringEvent),
          eventTypeColor: parseEventTypeColor(booking.eventType?.eventTypeColor),
          price: booking.eventType?.price || 0,
          currency: booking.eventType?.currency || "usd",
          metadata: EventTypeMetaDataSchema.parse(booking.eventType?.metadata || {}),
        },
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime.toISOString(),
      };
    })
  );

  // Enrich attendees with user data
  const enrichedBookings = await enrichAttendeesWithUserData(bookings, kysely);

  return { bookings: enrichedBookings, recurringInfo, totalCount };
}

type EnrichedUserData = {
  name: string | null;
  email: string;
  avatarUrl: string | null;
  username: string | null;
};

/**
 * Enriches booking attendees with user data by performing a left outer join
 * between attendees and users tables on email addresses.
 *
 * @param bookings - Array of bookings with attendees to enrich
 * @param kysely - Kysely database client instance
 * @returns Bookings with attendees enriched with user data (name, email, avatarUrl, username)
 */
async function enrichAttendeesWithUserData<
  TBooking extends { attendees: ReadonlyArray<{ id: number; email: string }> },
>(
  bookings: TBooking[],
  kysely: Kysely<DB>
): Promise<
  Array<
    Omit<TBooking, "attendees"> & {
      attendees: Array<TBooking["attendees"][number] & { user: EnrichedUserData | null }>;
    }
  >
> {
  // Extract all unique attendee emails from bookings
  const allAttendees = bookings.flatMap((booking) => booking.attendees);
  const uniqueAttendeeIds = Array.from(new Set(allAttendees.map((attendee) => attendee.id)));

  // Query attendees with left join to users table
  const enrichedAttendees =
    uniqueAttendeeIds.length > 0
      ? await kysely
          .selectFrom("Attendee")
          .leftJoin("users", "users.email", "Attendee.email")
          .select(["Attendee.id", "users.name", "Attendee.email", "users.avatarUrl", "users.username"])
          .where("Attendee.id", "in", uniqueAttendeeIds)
          .execute()
      : [];

  // Create a lookup map for O(1) access by attendee ID
  const attendeeUserDataMap = new Map<number, EnrichedUserData>(
    enrichedAttendees.map((enriched) => [
      enriched.id,
      {
        name: enriched.name,
        email: enriched.email,
        avatarUrl: enriched.avatarUrl,
        username: enriched.username,
      },
    ])
  );

  // Map over bookings and enrich each attendee with user data
  return bookings.map((booking) => ({
    ...booking,
    attendees: booking.attendees.map((attendee) => ({
      ...attendee,
      user: attendeeUserDataMap.get(attendee.id) || null,
    })),
  }));
}

/**
 * Gets event type IDs for the given team IDs using an optimized raw SQL query.
 *
 * This query uses a UNION to combine:
 * 1. Child event types whose parent belongs to the specified teams (managed event types)
 * 2. Direct team event types that belong to the specified teams
 *
 * The subquery structure `WHERE "parent"."id" IN (SELECT "id" FROM "EventType" WHERE "teamId" IN (...)))`
 * is intentional - it allows PostgreSQL to use the composite index on EventType(parentId, teamId)
 * efficiently via Nested Loop joins, resulting in ~66x faster execution compared to a direct
 * WHERE clause on parent.teamId (2.46ms vs 164ms in production benchmarks).
 *
 * @param prisma The Prisma client
 * @param teamIds Array of team IDs to filter by
 * @returns Array of event type IDs or undefined if no teamIds provided
 */
async function getEventTypeIdsFromTeamIdsFilter(prisma: PrismaClient, teamIds?: number[]) {
  if (!teamIds || teamIds.length === 0) {
    return undefined;
  }

  const result = await prisma.$queryRaw<{ id: number }[]>`
    SELECT "child"."id"
    FROM "public"."EventType" AS "parent"
    LEFT JOIN "public"."EventType" "child" ON ("parent"."id") = ("child"."parentId")
    WHERE "parent"."id" IN (SELECT "id" FROM "public"."EventType" WHERE "teamId" IN (${Prisma.join(teamIds)}))
      AND "child"."id" IS NOT NULL
    UNION
    SELECT "parent"."id"
    FROM "public"."EventType" AS "parent"
    WHERE "parent"."teamId" IN (${Prisma.join(teamIds)})
  `;

  return result.map((row) => row.id);
}

async function getAttendeeEmailsFromUserIdsFilter(
  prisma: PrismaClient,
  _userEmail: string,
  userIds?: number[]
) {
  if (!userIds || userIds.length === 0) {
    return;
  }

  const attendeeEmailsFromUserIdsFilter = await prisma.user
    .findMany({
      where: {
        id: {
          in: userIds,
        },
      },
      select: {
        email: true,
      },
    })
    .then((users) => users.map((user) => user.email));

  if (!attendeeEmailsFromUserIdsFilter || attendeeEmailsFromUserIdsFilter?.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The requested users do not exist.",
    });
  }

  return attendeeEmailsFromUserIdsFilter;
}

async function getEventTypeIdsFromEventTypeIdsFilter(prisma: PrismaClient, eventTypeIds?: number[]) {
  if (!eventTypeIds || eventTypeIds.length === 0) {
    return undefined;
  }
  const [directEventTypeIds, parentEventTypeIds] = await Promise.all([
    prisma.eventType
      .findMany({
        where: {
          id: { in: eventTypeIds },
        },
        select: {
          id: true,
        },
      })
      .then((eventTypes) => eventTypes.map((eventType) => eventType.id)),

    prisma.eventType
      .findMany({
        where: {
          parent: {
            id: {
              in: eventTypeIds,
            },
          },
        },
        select: {
          id: true,
        },
      })
      .then((eventTypes) => eventTypes.map((eventType) => eventType.id)),
  ]);

  const eventTypeIdsFromDb = Array.from(new Set([...directEventTypeIds, ...parentEventTypeIds]));

  if (eventTypeIdsFromDb?.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The requested event-types do not exist.",
    });
  }

  return eventTypeIdsFromDb;
}

/**
 * Gets user IDs of members from specified team IDs.
 * PERFORMANCE: This is a lighter version that only fetches IDs (not emails) for permission validation.
 * @param prisma The Prisma client.
 * @param teamIds Array of team IDs to get members from
 * @returns {Promise<number[]>} UserIDs for members in the specified teams.
 */
async function getUserIdsFromTeamIds(prisma: PrismaClient, teamIds: number[]): Promise<number[]> {
  if (teamIds.length === 0) {
    return [];
  }

  const users = await prisma.user.findMany({
    where: {
      teams: {
        some: {
          teamId: {
            in: teamIds,
          },
        },
      },
    },
    select: {
      id: true,
    },
  });
  return Array.from(new Set(users.map((user) => user.id)));
}

function addStatusesQueryFilters(query: BookingsUnionQuery, statuses: InputByStatus[]) {
  if (statuses?.length) {
    return query.where(({ eb, or, and }) =>
      or(
        statuses.map((status) => {
          if (status === "upcoming") {
            return and([
              eb("Booking.endTime", ">=", new Date()),
              or([
                and([eb("Booking.recurringEventId", "is not", null), eb("Booking.status", "=", "accepted")]),
                and([
                  eb("Booking.recurringEventId", "is", null),
                  eb("Booking.status", "not in", ["cancelled", "rejected"]),
                ]),
              ]),
            ]);
          }

          if (status === "recurring") {
            return and([
              eb("Booking.endTime", ">=", new Date()),
              eb("Booking.recurringEventId", "is not", null),
              eb("Booking.status", "not in", ["cancelled", "rejected"]),
            ]);
          }

          if (status === "past") {
            return and([
              eb("Booking.endTime", "<=", new Date()),
              eb("Booking.status", "not in", ["cancelled", "rejected"]),
            ]);
          }

          if (status === "cancelled") {
            return eb("Booking.status", "in", ["cancelled", "rejected"]);
          }

          if (status === "unconfirmed") {
            return and([eb("Booking.endTime", ">=", new Date()), eb("Booking.status", "=", "pending")]);
          }
          return and([]);
        })
      )
    );
  }

  return query;
}

function addAdvancedAttendeeWhereClause(
  query: BookingsUnionQuery,
  key: "name" | "email",
  operator:
    | "endsWith"
    | "startsWith"
    | "equals"
    | "notEquals"
    | "contains"
    | "notContains"
    | "isEmpty"
    | "isNotEmpty",
  operand: string,
  isAttendeeTableJoined: boolean
) {
  let fullQuery = query.$if(!isAttendeeTableJoined, (eb) =>
    eb.innerJoin("Attendee", "Attendee.bookingId", "Booking.id")
  ) as SelectQueryBuilder<
    DB,
    "Booking" | "Attendee",
    Pick<Booking, "id" | "createdAt" | "updatedAt" | "startTime" | "endTime">
  >;

  switch (operator) {
    case "endsWith":
      fullQuery = fullQuery.where(`Attendee.${key}`, "ilike", `%${operand}`);
      break;

    case "startsWith":
      fullQuery = fullQuery.where(`Attendee.${key}`, "ilike", `${operand}%`);
      break;

    case "equals":
      fullQuery = fullQuery.where((eb) =>
        eb(eb.fn<string>("lower", [`Attendee.${key}`]), "=", `${operand.toLowerCase()}`)
      );
      break;

    case "notEquals":
      fullQuery = fullQuery.where((eb) =>
        eb(eb.fn<string>("lower", [`Attendee.${key}`]), "!=", `${operand.toLowerCase()}`)
      );
      break;

    case "contains":
      fullQuery = fullQuery.where(`Attendee.${key}`, "ilike", `%${operand}%`);
      break;

    case "notContains":
      fullQuery = fullQuery.where(`Attendee.${key}`, "not ilike", `%${operand}%`);
      break;

    case "isEmpty":
      fullQuery = fullQuery.where(`Attendee.${key}`, "=", "");
      break;

    case "isNotEmpty":
      fullQuery = fullQuery.where(`Attendee.${key}`, "!=", "");
      break;

    default:
      break;
  }

  return fullQuery;
}

function getOrderBy(
  bookingListingByStatus: InputByStatus[],
  sort?: {
    sortStart?: "asc" | "desc";
    sortEnd?: "asc" | "desc";
    sortCreated?: "asc" | "desc";
    sortUpdated?: "asc" | "desc";
  }
): { key: "startTime" | "endTime" | "createdAt" | "updatedAt"; order: "desc" | "asc" } {
  const bookingListingOrderby = {
    upcoming: { startTime: "asc" },
    recurring: { startTime: "asc" },
    past: { startTime: "desc" },
    cancelled: { startTime: "desc" },
    unconfirmed: { startTime: "asc" },
  } as const;

  if (bookingListingByStatus?.length === 1 && !sort) {
    return { key: "startTime", order: bookingListingOrderby[bookingListingByStatus[0]].startTime };
  }

  if (sort?.sortStart) {
    return { key: "startTime", order: sort.sortStart };
  }
  if (sort?.sortEnd) {
    return { key: "endTime", order: sort.sortEnd };
  }
  if (sort?.sortCreated) {
    return { key: "createdAt", order: sort.sortCreated };
  }
  if (sort?.sortUpdated) {
    return { key: "updatedAt", order: sort.sortUpdated };
  }

  return { key: "startTime", order: "asc" };
}
