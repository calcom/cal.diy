import type { PrismaClient } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";

export class BookingSeatRepository {
  constructor(private prismaClient: PrismaClient) {}

  async create(data: Prisma.BookingSeatCreateArgs["data"]) {
    return this.prismaClient.bookingSeat.create({ data });
  }

  getByUidIncludeAttendee(uid: string) {
    return this.prismaClient.bookingSeat.findUnique({
      where: {
        referenceUid: uid,
      },
      select: {
        attendee: {
          select: {
            email: true,
          },
        },
      },
    });
  }

  getByReferenceUidWithAttendeeDetails(referenceUid: string) {
    return this.prismaClient.bookingSeat.findUnique({
      where: {
        referenceUid,
      },
      select: {
        attendee: {
          select: {
            name: true,
            id: true,
            bookingId: true,
            noShow: true,
            phoneNumber: true,
            email: true,
            locale: true,
            timeZone: true,
          },
        },
      },
    });
  }
}
