import { prisma } from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/enums";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BookingRepository } from "./BookingRepository";

const suffix = `${Date.now()}`;
const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
const endTime = new Date(startTime.getTime() + 15 * 60 * 1000);

let hostId: number;
let otherHostId: number;
let blockingEventTypeId: number;
let nonBlockingEventTypeId: number;
let otherEventTypeId: number;
let bookingCounter = 0;
const bookingIds: number[] = [];

const hostEmail = `pending-block-${suffix}@example.com`;

async function createUser(name: string) {
  return prisma.user.create({
    data: { email: `${name}-${suffix}@example.com`, username: `${name}-${suffix}` },
    select: { id: true },
  });
}

async function createEventType(
  slug: string,
  data: { requiresConfirmation: boolean; requiresConfirmationWillBlockSlot: boolean }
) {
  return prisma.eventType.create({
    data: {
      title: slug,
      slug: `${slug}-${suffix}`,
      length: 15,
      userId: hostId,
      requiresConfirmation: data.requiresConfirmation,
      requiresConfirmationWillBlockSlot: data.requiresConfirmationWillBlockSlot,
    },
    select: { id: true },
  });
}

async function createPendingBooking({ eventTypeId, userId }: { eventTypeId: number; userId: number }) {
  bookingCounter += 1;
  const booking = await prisma.booking.create({
    data: {
      uid: `pending-${suffix}-${bookingCounter}`,
      title: "Pending booking",
      userId,
      eventTypeId,
      status: BookingStatus.PENDING,
      startTime,
      endTime,
    },
    select: { id: true },
  });
  bookingIds.push(booking.id);
  return booking;
}

describe("BookingRepository.findAllExistingBookingsForEventTypeBetween (Integration)", () => {
  beforeAll(async () => {
    hostId = (await createUser("pending-block")).id;
    otherHostId = (await createUser("pending-block-other-host")).id;

    blockingEventTypeId = (
      await createEventType("blocking", {
        requiresConfirmation: true,
        requiresConfirmationWillBlockSlot: true,
      })
    ).id;
    nonBlockingEventTypeId = (
      await createEventType("non-blocking", {
        requiresConfirmation: true,
        requiresConfirmationWillBlockSlot: false,
      })
    ).id;
    otherEventTypeId = (
      await createEventType("other", {
        requiresConfirmation: false,
        requiresConfirmationWillBlockSlot: false,
      })
    ).id;
  });

  afterEach(async () => {
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    bookingIds.length = 0;
  });

  afterAll(async () => {
    await prisma.eventType.deleteMany({ where: { userId: hostId } });
    await prisma.user.deleteMany({ where: { id: { in: [hostId, otherHostId] } } });
  });

  const findBookings = (eventTypeId: number) =>
    new BookingRepository(prisma).findAllExistingBookingsForEventTypeBetween({
      startDate: new Date(startTime.getTime() - 60 * 60 * 1000),
      endDate: new Date(endTime.getTime() + 60 * 60 * 1000),
      eventTypeId,
      userIdAndEmailMap: new Map([[hostId, hostEmail]]),
    });

  it("returns a blocking pending booking when a different event type of the host is being booked", async () => {
    const pending = await createPendingBooking({ eventTypeId: blockingEventTypeId, userId: hostId });

    const bookings = await findBookings(otherEventTypeId);

    expect(bookings.map((booking) => booking.id)).toEqual([pending.id]);
  });

  it("returns a blocking pending booking of another user when the same event type is being booked", async () => {
    const pending = await createPendingBooking({ eventTypeId: blockingEventTypeId, userId: otherHostId });

    const bookings = await findBookings(blockingEventTypeId);

    expect(bookings.map((booking) => booking.id)).toEqual([pending.id]);
  });

  it("ignores a pending booking whose event type does not block slots", async () => {
    const pending = await createPendingBooking({ eventTypeId: nonBlockingEventTypeId, userId: hostId });

    const bookings = await findBookings(otherEventTypeId);

    expect(bookings.map((booking) => booking.id)).not.toContain(pending.id);
  });

  it("ignores a pending booking of an event type that does not require confirmation", async () => {
    const pending = await createPendingBooking({ eventTypeId: otherEventTypeId, userId: hostId });

    const bookings = await findBookings(otherEventTypeId);

    expect(bookings.map((booking) => booking.id)).not.toContain(pending.id);
  });
});
