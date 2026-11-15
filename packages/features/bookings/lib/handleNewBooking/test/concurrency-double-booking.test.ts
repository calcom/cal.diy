import prismaMock from "@calcom/testing/lib/__mocks__/prisma";
import {
  createBookingScenario,
  getDate,
  getGoogleCalendarCredential,
  getOrganizer,
  getScenarioData,
  mockCalendarToHaveNoBusySlots,
  TestData,
} from "@calcom/testing/lib/bookingScenario/bookingScenario";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { BookingStatus } from "@calcom/prisma/enums";
import { getMockRequestDataForBooking } from "@calcom/testing/lib/bookingScenario/getMockRequestDataForBooking";
import { setupAndTeardown } from "@calcom/testing/lib/bookingScenario/setupAndTeardown";
import { test } from "@calcom/testing/lib/fixtures/fixtures";
import { describe, expect } from "vitest";
import { getNewBookingHandler } from "./getNewBookingHandler";

describe("Booking Concurrency & Overlap Protection", () => {
  setupAndTeardown();

  test("rejects overlapping booking when another booking already occupies part of the time window", async () => {
    const handleNewBooking = getNewBookingHandler();
    const organizer = getOrganizer({
      name: "Busy Host",
      email: "host@example.com",
      id: 101,
      schedules: [TestData.schedules.IstWorkHours],
      credentials: [getGoogleCalendarCredential()],
      selectedCalendars: [TestData.selectedCalendars.google],
      emailVerified: new Date(),
    });

    await createBookingScenario(
      getScenarioData({
        eventTypes: [
          {
            id: 1,
            slotInterval: 30,
            length: 30,
            users: [{ id: 101 }],
          },
        ],
        organizer,
        apps: [TestData.apps["google-calendar"]],
      })
    );

    await mockCalendarToHaveNoBusySlots("googlecalendar", {});

    const targetDate = getDate({ dateIncrement: 1 }).dateString;

    // Slot 1: 04:00 to 04:30 UTC
    const bookingData1 = getMockRequestDataForBooking({
      data: {
        eventTypeId: 1,
        user: organizer.username,
        start: `${targetDate}T04:00:00.000Z`,
        end: `${targetDate}T04:30:00.000Z`,
        responses: {
          email: "booker1@example.com",
          name: "Booker One",
        },
      },
    });

    // Create the first booking successfully
    const firstBooking = await handleNewBooking({
      bookingData: bookingData1,
    });
    expect(firstBooking.id).toBeDefined();

    // Slot 2: 04:15 to 04:45 UTC (overlaps with first booking from 04:15 to 04:30)
    const bookingData2 = getMockRequestDataForBooking({
      data: {
        eventTypeId: 1,
        user: organizer.username,
        start: `${targetDate}T04:15:00.000Z`,
        end: `${targetDate}T04:45:00.000Z`,
        responses: {
          email: "booker2@example.com",
          name: "Booker Two",
        },
      },
    });

    // Attempting to book the overlapping slot sequentially is caught by availability validation
    await expect(
      handleNewBooking({
        bookingData: bookingData2,
      })
    ).rejects.toThrow("no_available_users_found_error");

    // Verify only ONE booking exists for this organizer in DB
    const allBookings = await prismaMock.booking.findMany({
      where: {
        userId: 101,
        status: BookingStatus.ACCEPTED,
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
      },
    });

    expect(allBookings).toHaveLength(1);
  });

  test("prevents race condition when two requests attempt to book the exact same slot concurrently", async () => {
    const handleNewBooking = getNewBookingHandler();
    const organizer = getOrganizer({
      name: "Popular Host",
      email: "popular@example.com",
      id: 202,
      schedules: [TestData.schedules.IstWorkHours],
      credentials: [getGoogleCalendarCredential()],
      selectedCalendars: [TestData.selectedCalendars.google],
      emailVerified: new Date(),
    });

    await createBookingScenario(
      getScenarioData({
        eventTypes: [
          {
            id: 2,
            slotInterval: 30,
            length: 30,
            users: [{ id: 202 }],
          },
        ],
        organizer,
        apps: [TestData.apps["google-calendar"]],
      })
    );

    await mockCalendarToHaveNoBusySlots("googlecalendar", {});

    const targetDate = getDate({ dateIncrement: 2 }).dateString;

    const requestA = getMockRequestDataForBooking({
      data: {
        eventTypeId: 2,
        user: organizer.username,
        start: `${targetDate}T05:00:00.000Z`,
        end: `${targetDate}T05:30:00.000Z`,
        responses: {
          email: "userA@example.com",
          name: "User A",
        },
      },
    });

    const requestB = getMockRequestDataForBooking({
      data: {
        eventTypeId: 2,
        user: organizer.username,
        start: `${targetDate}T05:00:00.000Z`,
        end: `${targetDate}T05:30:00.000Z`,
        responses: {
          email: "userB@example.com",
          name: "User B",
        },
      },
    });

    // Launch both booking requests concurrently at the same instant
    const results = await Promise.allSettled([
      handleNewBooking({ bookingData: requestA }),
      handleNewBooking({ bookingData: requestB }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one must succeed, and the other must be rejected specifically with BookingConflict
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const rejectedResult = rejected[0] as PromiseRejectedResult;
    expect(rejectedResult.reason?.message).toContain(ErrorCode.BookingConflict);

    // Database must have only 1 booking for this slot
    const bookingsInDb = await prismaMock.booking.findMany({
      where: {
        userId: 202,
        status: BookingStatus.ACCEPTED,
      },
      select: {
        id: true,
        userPrimaryEmail: true,
      },
    });

    expect(bookingsInDb).toHaveLength(1);
  });

  test("prevents race condition when two requests attempt to book partially overlapping time windows concurrently", async () => {
    const handleNewBooking = getNewBookingHandler();
    const organizer = getOrganizer({
      name: "Flexible Host",
      email: "flexible@example.com",
      id: 303,
      schedules: [TestData.schedules.IstWorkHours],
      credentials: [getGoogleCalendarCredential()],
      selectedCalendars: [TestData.selectedCalendars.google],
      emailVerified: new Date(),
    });

    await createBookingScenario(
      getScenarioData({
        eventTypes: [
          {
            id: 3,
            slotInterval: 15,
            length: 30,
            users: [{ id: 303 }],
          },
        ],
        organizer,
        apps: [TestData.apps["google-calendar"]],
      })
    );

    await mockCalendarToHaveNoBusySlots("googlecalendar", {});

    const targetDate = getDate({ dateIncrement: 3 }).dateString;

    // Window 1: 06:00 to 06:30
    const request1 = getMockRequestDataForBooking({
      data: {
        eventTypeId: 3,
        user: organizer.username,
        start: `${targetDate}T06:00:00.000Z`,
        end: `${targetDate}T06:30:00.000Z`,
        responses: {
          email: "user1@example.com",
          name: "User 1",
        },
      },
    });

    // Window 2: 06:15 to 06:45 (partially overlaps 06:15 to 06:30)
    const request2 = getMockRequestDataForBooking({
      data: {
        eventTypeId: 3,
        user: organizer.username,
        start: `${targetDate}T06:15:00.000Z`,
        end: `${targetDate}T06:45:00.000Z`,
        responses: {
          email: "user2@example.com",
          name: "User 2",
        },
      },
    });

    const results = await Promise.allSettled([
      handleNewBooking({ bookingData: request1 }),
      handleNewBooking({ bookingData: request2 }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one must succeed, and the other must be rejected specifically with BookingConflict
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const rejectedResult3 = rejected[0] as PromiseRejectedResult;
    expect(rejectedResult3.reason?.message).toContain(ErrorCode.BookingConflict);

    const bookingsInDb = await prismaMock.booking.findMany({
      where: {
        userId: 303,
        status: BookingStatus.ACCEPTED,
      },
      select: {
        id: true,
      },
    });

    expect(bookingsInDb).toHaveLength(1);
  });

  test("prevents race condition when concurrent booking collides with an event buffer window", async () => {
    const handleNewBooking = getNewBookingHandler();
    const organizer = getOrganizer({
      name: "Buffered Host",
      email: "buffered@example.com",
      id: 404,
      schedules: [TestData.schedules.IstWorkHours],
      credentials: [getGoogleCalendarCredential()],
      selectedCalendars: [TestData.selectedCalendars.google],
      emailVerified: new Date(),
    });

    await createBookingScenario(
      getScenarioData({
        eventTypes: [
          {
            id: 4,
            slotInterval: 30,
            length: 30,
            afterEventBuffer: 15,
            users: [{ id: 404 }],
          },
        ],
        organizer,
        apps: [TestData.apps["google-calendar"]],
      })
    );

    await mockCalendarToHaveNoBusySlots("googlecalendar", {});

    const targetDate = getDate({ dateIncrement: 4 }).dateString;

    // Slot 1: 07:00 to 07:30 (with 15 min after buffer, host is busy until 07:45)
    const request1 = getMockRequestDataForBooking({
      data: {
        eventTypeId: 4,
        user: organizer.username,
        start: `${targetDate}T07:00:00.000Z`,
        end: `${targetDate}T07:30:00.000Z`,
        responses: {
          email: "user1@example.com",
          name: "User 1",
        },
      },
    });

    // Slot 2: 07:30 to 08:00 (Starts immediately at 07:30, colliding with Slot 1's 15m after-buffer)
    const request2 = getMockRequestDataForBooking({
      data: {
        eventTypeId: 4,
        user: organizer.username,
        start: `${targetDate}T07:30:00.000Z`,
        end: `${targetDate}T08:00:00.000Z`,
        responses: {
          email: "user2@example.com",
          name: "User 2",
        },
      },
    });

    const results = await Promise.allSettled([
      handleNewBooking({ bookingData: request1 }),
      handleNewBooking({ bookingData: request2 }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one must succeed, and the other must be rejected specifically with BookingConflict
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const rejectedResult4 = rejected[0] as PromiseRejectedResult;
    expect(rejectedResult4.reason?.message).toContain(ErrorCode.BookingConflict);

    const bookingsInDb = await prismaMock.booking.findMany({
      where: {
        userId: 404,
        status: BookingStatus.ACCEPTED,
      },
      select: {
        id: true,
      },
    });

    expect(bookingsInDb).toHaveLength(1);
  });
});
