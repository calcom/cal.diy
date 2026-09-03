import { prisma } from "@calcom/prisma";
import type { Prisma, PrismaClient } from "@calcom/prisma/client";
import { BookingStatus } from "@calcom/prisma/enums";
import type { PartialReference } from "@calcom/types/EventManager";

import type { IBookingReferenceRepository } from "./IBookingReferenceRepository";

const bookingReferenceSelect = {
  id: true,
  type: true,
  uid: true,
  meetingId: true,
  meetingUrl: true,
  credentialId: true,
  deleted: true,
  bookingId: true,
} satisfies Prisma.BookingReferenceSelect;

export type BookingReferenceWithBookingStatus = {
  id: number;
  type: string;
  uid: string;
  meetingId: string | null;
  thirdPartyRecurringEventId: string | null;
  meetingPassword: string | null;
  meetingUrl: string | null;
  bookingId: number | null;
  externalCalendarId: string | null;
  deleted: boolean | null;
  credentialId: number | null;
  delegationCredentialId: string | null;
  domainWideDelegationCredentialId: string | null;
};

export class BookingReferenceRepository implements IBookingReferenceRepository {
  private prismaClient: PrismaClient;
  constructor(private deps: { prismaClient: PrismaClient }) {
    this.prismaClient = deps.prismaClient;
  }

  static async findDailyVideoReferenceByRoomName({ roomName }: { roomName: string }) {
    return prisma.bookingReference.findFirst({
      where: {
        type: "daily_video",
        uid: roomName,
        meetingId: roomName,
        bookingId: { not: null },
        deleted: null,
      },
      select: bookingReferenceSelect,
    });
  }

  /**
   * If rescheduling a booking with new references from the EventManager. Delete the previous references and replace them with new ones
   */
  static async replaceBookingReferences({
    bookingId,
    newReferencesToCreate,
  }: {
    bookingId: number;
    newReferencesToCreate: PartialReference[];
  }) {
    const newReferenceTypes = newReferencesToCreate.map((reference) => reference.type);

    await prisma.bookingReference.updateMany({
      where: {
        bookingId,
        type: {
          in: newReferenceTypes,
        },
      },
      data: {
        deleted: true,
      },
    });

    await prisma.bookingReference.createMany({
      data: newReferencesToCreate.map((reference) => {
        return { ...reference, bookingId };
      }),
    });
  }

  async updateManyByBookingId(
    bookingId: number,
    data: Prisma.BookingReferenceUpdateManyMutationInput
  ): Promise<void> {
    await this.prismaClient.bookingReference.updateMany({
      where: {
        bookingId,
      },
      data,
    });
  }

  /**
   * Finds booking references by type with associated booking status and date range filters.
   * Uses raw SQL for optimal performance with proper INNER JOIN instead of LEFT JOIN.
   *
   * This replaces the inefficient Prisma-generated query that uses LEFT JOIN with WHERE
   * conditions on the joined table, which effectively makes it an INNER JOIN but with
   * worse query planning.
   *
   * @param type - The booking reference type (e.g., "google_calendar")
   * @param excludeExternalCalendarId - External calendar ID to exclude from results
   * @param bookingStatus - The booking status to filter by (e.g., "ACCEPTED")
   * @param updatedAtStart - Start of the date range for booking.updatedAt
   * @param updatedAtEnd - End of the date range for booking.updatedAt
   * @param offset - Number of rows to skip for pagination
   * @param limit - Maximum number of rows to return
   */
  async findByTypeWithBookingStatusAndDateRange({
    type,
    excludeExternalCalendarId,
    bookingStatus,
    updatedAtStart,
    updatedAtEnd,
    offset = 0,
    limit = 1000,
  }: {
    type: string;
    excludeExternalCalendarId: string;
    bookingStatus: BookingStatus;
    updatedAtStart: Date;
    updatedAtEnd: Date;
    offset?: number;
    limit?: number;
  }): Promise<BookingReferenceWithBookingStatus[]> {
    return this.prismaClient.$queryRaw<BookingReferenceWithBookingStatus[]>`
      SELECT
        br."id",
        br."type",
        br."uid",
        br."meetingId",
        br."thirdPartyRecurringEventId",
        br."meetingPassword",
        br."meetingUrl",
        br."bookingId",
        br."externalCalendarId",
        br."deleted",
        br."credentialId",
        br."delegationCredentialId",
        br."domainWideDelegationCredentialId"
      FROM "BookingReference" br
      INNER JOIN "Booking" b ON b."id" = br."bookingId"
      WHERE br."type" = ${type}
        AND br."externalCalendarId" IS NOT NULL
        AND br."externalCalendarId" != ${excludeExternalCalendarId}
        AND br."credentialId" IS NOT NULL
        AND b."status" = ${bookingStatus}::"BookingStatus"
        AND b."updatedAt" >= ${updatedAtStart}
        AND b."updatedAt" <= ${updatedAtEnd}
      ORDER BY br."id"
      LIMIT ${limit}
      OFFSET ${offset}
    `;
  }
}
