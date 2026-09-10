import type { PrismaClient } from "@calcom/prisma";
import type { IAttendeeRepository } from "./IAttendeeRepository";

const safeSelect = {
  id: true,
  email: true,
  name: true,
  locale: true,
  timeZone: true,
  phoneNumber: true,
  bookingId: true,
  noShow: true,
  createdAt: true
};

/**
 * Prisma-based implementation of IAttendeeRepository
 *
 * This repository provides methods for looking up attendee information.
 */
export class AttendeeRepository implements IAttendeeRepository {
  constructor(private prismaClient: PrismaClient) {}

  async findById(id: number): Promise<{ name: string; email: string } | null> {
    const attendee = await this.prismaClient.attendee.findUnique({
      where: { id },
      select: {
        name: true,
        email: true,
      },
    });

    return attendee;
  }

  async findByIds({ ids }: { ids: number[] }): Promise<{ id: number; name: string; email: string }[]> {
    return this.prismaClient.attendee.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });
  }

  async findByBookingIdAndSeatReference({
    bookingId,
    seatReferenceUid,
  }: {
    bookingId: number;
    seatReferenceUid: string;
  }): Promise<{ email: string }[]> {
    return this.prismaClient.attendee.findMany({
      where: {
        bookingId,
        bookingSeat: {
          referenceUid: seatReferenceUid,
        },
      },
      select: { email: true },
    });
  }

  async findByBookingUidAndEmails({
    bookingUid,
    emails,
  }: {
    bookingUid: string;
    emails: string[];
  }): Promise<{ id: number; email: string; noShow: boolean | null }[]> {
    return this.prismaClient.attendee.findMany({
      where: {
        booking: { uid: bookingUid },
        email: { in: emails },
      },
      select: { id: true, email: true, noShow: true },
    });
  }

  async updateNoShow({
    where: { attendeeId },
    data: { noShow },
  }: {
    where: { attendeeId: number };
    data: { noShow: boolean };
  }): Promise<{ noShow: boolean | null; email: string }> {
    return this.prismaClient.attendee.update({
      where: { id: attendeeId },
      data: { noShow },
      select: { noShow: true, email: true },
    });
  }

  async findByBookingId(bookingId: number): Promise<
    {
      id: number;
      email: string;
      name: string;
      locale: string | null;
      timeZone: string;
      phoneNumber: string | null;
      bookingId: number | null;
      noShow: boolean | null;
      createdAt: Date | null;
    }[]
  > {
    return this.prismaClient.attendee.findMany({
      where: { bookingId },
      select: safeSelect,
    });
  }

  async updateManyNoShowByBookingIdAndEmails({
    where: { bookingId, emails },
    data: { noShow },
  }: {
    where: { bookingId: number; emails: string[] };
    data: { noShow: boolean };
  }): Promise<{ count: number }> {
    return this.prismaClient.attendee.updateMany({
      where: {
        bookingId,
        email: { in: emails },
      },
      data: { noShow },
    });
  }

  async updateManyNoShowByBookingIdExcludingEmails({
    where: { bookingId, excludeEmails },
    data: { noShow },
  }: {
    where: { bookingId: number; excludeEmails: string[] };
    data: { noShow: boolean };
  }): Promise<{ count: number }> {
    return this.prismaClient.attendee.updateMany({
      where: {
        bookingId,
        email: { notIn: excludeEmails },
      },
      data: { noShow },
    });
  }
}
