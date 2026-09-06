import { BookingRepository } from "@calcom/features/bookings/repositories/BookingRepository";
import { prisma } from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/enums";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const bookingRepository = new BookingRepository(prisma);

describe("RegularBookingService persistence", () => {
  let userId: number;
  let hasUser = false;
  let eventTypeId: number;
  let acceptedBooking: { id: number; uid: string };

  beforeEach(async () => {
    const id = crypto.randomUUID();
    const user = await prisma.user.create({
      data: { email: `regular-booking-${id}@test.cal.com`, username: `regular-booking-${id}` },
      select: { id: true },
    });
    userId = user.id;
    hasUser = true;
    const eventType = await prisma.eventType.create({
      data: { title: "Seated event", slug: `seated-event-${id}`, length: 30, userId },
      select: { id: true },
    });
    eventTypeId = eventType.id;

    const startTime = new Date("2031-05-01T10:00:00.000Z");
    const booking = await prisma.booking.create({
      data: {
        uid: `accepted-booking-${id}`,
        userId,
        eventTypeId,
        title: "Accepted booking",
        startTime,
        endTime: new Date("2031-05-01T10:30:00.000Z"),
        status: BookingStatus.ACCEPTED,
        attendees: {
          create: { email: "accepted-attendee@test.cal.com", name: "Accepted Attendee", timeZone: "UTC" },
        },
      },
      select: { id: true, uid: true },
    });
    acceptedBooking = booking;

    await prisma.booking.create({
      data: {
        uid: `pending-booking-${id}`,
        userId,
        eventTypeId,
        title: "Pending booking",
        startTime,
        endTime: new Date("2031-05-01T10:30:00.000Z"),
        status: BookingStatus.PENDING,
      },
    });
  });

  afterEach(async () => {
    if (hasUser) await prisma.user.delete({ where: { id: userId } });
    hasUser = false;
  });

  it("uses the accepted slot and persists calendar data created during booking", async () => {
    const booking = await bookingRepository.findAcceptedForEventTypeAtStartTime({
      eventTypeId,
      startTime: new Date("2031-05-01T10:00:00.000Z"),
    });
    expect(booking).toEqual({ userId, attendees: [{ email: "accepted-attendee@test.cal.com" }] });

    await bookingRepository.updateICalUID({ bookingId: acceptedBooking.id, iCalUID: "updated-ical-uid" });
    await bookingRepository.updateLocationMetadataAndReferences({
      bookingUid: acceptedBooking.uid,
      location: "https://meet.example.com/booking",
      metadata: { videoCallUrl: "https://meet.example.com/booking" },
      references: [{ type: "google_calendar", uid: "calendar-event-id" }],
    });

    await expect(
      prisma.booking.findUniqueOrThrow({
        where: { id: acceptedBooking.id },
        select: {
          iCalUID: true,
          location: true,
          metadata: true,
          references: { select: { type: true, uid: true } },
        },
      })
    ).resolves.toEqual({
      iCalUID: "updated-ical-uid",
      location: "https://meet.example.com/booking",
      metadata: { videoCallUrl: "https://meet.example.com/booking" },
      references: [{ type: "google_calendar", uid: "calendar-event-id" }],
    });
  });
});
