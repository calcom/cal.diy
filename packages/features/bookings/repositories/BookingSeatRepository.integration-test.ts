import { prisma } from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/enums";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BookingSeatRepository } from "./BookingSeatRepository";

const repository = new BookingSeatRepository(prisma);

describe("BookingSeatRepository", () => {
  let userId: number;
  let hasUser = false;
  let bookingId: number;
  let attendeeId: number;

  beforeEach(async () => {
    const id = crypto.randomUUID();
    const user = await prisma.user.create({
      data: { email: `booking-seat-${id}@test.cal.com`, username: `booking-seat-${id}` },
      select: { id: true },
    });
    userId = user.id;
    hasUser = true;
    const booking = await prisma.booking.create({
      data: {
        uid: `booking-seat-${id}`,
        userId,
        title: "Seated booking",
        startTime: new Date("2031-05-01T10:00:00.000Z"),
        endTime: new Date("2031-05-01T10:30:00.000Z"),
        status: BookingStatus.ACCEPTED,
        attendees: {
          create: { email: "seat-attendee@test.cal.com", name: "Seat Attendee", timeZone: "UTC" },
        },
      },
      select: { id: true, attendees: { select: { id: true } } },
    });
    bookingId = booking.id;
    attendeeId = booking.attendees[0].id;
  });

  afterEach(async () => {
    if (hasUser) await prisma.user.delete({ where: { id: userId } });
    hasUser = false;
  });

  it("creates a seat connected to the requested attendee and preserves booking form data", async () => {
    await repository.create({
      referenceUid: `seat-${crypto.randomUUID()}`,
      booking: { connect: { id: bookingId } },
      attendee: { connect: { id: attendeeId } },
      data: { description: "Needs wheelchair access" },
      metadata: { source: "booking-form" },
    });

    await expect(
      prisma.attendee.findUniqueOrThrow({
        where: { id: attendeeId },
        select: { bookingSeat: { select: { bookingId: true, data: true, metadata: true } } },
      })
    ).resolves.toMatchObject({
      bookingSeat: {
        bookingId,
        data: { description: "Needs wheelchair access" },
        metadata: { source: "booking-form" },
      },
    });
  });
});
