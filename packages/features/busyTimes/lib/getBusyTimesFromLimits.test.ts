import dayjs from "@calcom/dayjs";
import LimitManager from "@calcom/lib/intervalLimits/limitManager";
import type { EventBusyDetails } from "@calcom/types/Calendar";
import { describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("@calcom/features/di/containers/BookingLimits", () => ({
  getCheckBookingLimitsService: () => ({
    checkBookingLimit: vi.fn(),
  }),
}));

vi.mock("@calcom/features/di/containers/BusyTimes", () => ({
  getBusyTimesService: () => ({
    getStartEndDateforLimitCheck: vi.fn(),
  }),
}));

vi.mock("@calcom/prisma", () => ({
  default: {},
}));

// Import the function we're testing
import { getBusyTimesFromBookingLimits } from "./getBusyTimesFromLimits";

const startOfTomorrow = dayjs().add(1, "day").startOf("day");

describe("getBusyTimesFromBookingLimits with seats", () => {
  describe("seated events", () => {
    it("should NOT mark slot busy when booking limit is reached but seats remain available", async () => {
      const limitManager = new LimitManager();
      const dateFrom = startOfTomorrow;
      const dateTo = startOfTomorrow.endOf("day");

      // Event type has 5 seats and limit of 1 booking per day
      // 1 booking exists with 1 attendee - 4 seats should still be available
      const bookings: EventBusyDetails[] = [
        {
          start: startOfTomorrow.set("hour", 10).toDate(),
          end: startOfTomorrow.set("hour", 11).toDate(),
          title: "Booking 1",
          source: "eventType-1-booking-1",
          userId: 1,
          attendeeCount: 1, // Only 1 seat taken
        },
      ];

      await getBusyTimesFromBookingLimits({
        bookings,
        bookingLimits: { PER_DAY: 1 },
        dateFrom,
        dateTo,
        limitManager,
        eventTypeId: 1,
        timeZone: "UTC",
        seatsPerTimeSlot: 5, // 5 seats available
      });

      const busyTimes = limitManager.getBusyTimes();

      // Should NOT be marked as busy because 4 seats remain (1 attendee < 5 seats)
      expect(busyTimes).toHaveLength(0);
    });

    it("should mark slot busy when all seats are filled", async () => {
      const limitManager = new LimitManager();
      const dateFrom = startOfTomorrow;
      const dateTo = startOfTomorrow.endOf("day");

      // Event type has 3 seats, and all 3 attendees have booked
      const bookings: EventBusyDetails[] = [
        {
          start: startOfTomorrow.set("hour", 10).toDate(),
          end: startOfTomorrow.set("hour", 11).toDate(),
          title: "Booking 1",
          source: "eventType-1-booking-1",
          userId: 1,
          attendeeCount: 3, // All 3 seats taken
        },
      ];

      await getBusyTimesFromBookingLimits({
        bookings,
        bookingLimits: { PER_DAY: 1 },
        dateFrom,
        dateTo,
        limitManager,
        eventTypeId: 1,
        timeZone: "UTC",
        seatsPerTimeSlot: 3, // Only 3 seats available
      });

      const busyTimes = limitManager.getBusyTimes();

      // Should be marked as busy because all 3 seats are taken
      expect(busyTimes).toHaveLength(1);
    });

    it("should count attendees across multiple bookings for the same slot", async () => {
      const limitManager = new LimitManager();
      const dateFrom = startOfTomorrow;
      const dateTo = startOfTomorrow.endOf("day");

      // Event type has 5 seats, 2 bookings with total 5 attendees
      const bookings: EventBusyDetails[] = [
        {
          start: startOfTomorrow.set("hour", 10).toDate(),
          end: startOfTomorrow.set("hour", 11).toDate(),
          title: "Booking 1",
          source: "eventType-1-booking-1",
          userId: 1,
          attendeeCount: 2,
        },
        {
          start: startOfTomorrow.set("hour", 10).toDate(),
          end: startOfTomorrow.set("hour", 11).toDate(),
          title: "Booking 2",
          source: "eventType-1-booking-2",
          userId: 2,
          attendeeCount: 3,
        },
      ];

      await getBusyTimesFromBookingLimits({
        bookings,
        bookingLimits: { PER_DAY: 10 }, // High limit - shouldn't matter for seats
        dateFrom,
        dateTo,
        limitManager,
        eventTypeId: 1,
        timeZone: "UTC",
        seatsPerTimeSlot: 5, // 5 seats, all filled (2 + 3)
      });

      const busyTimes = limitManager.getBusyTimes();

      // Should be marked as busy because 2 + 3 = 5 attendees >= 5 seats
      expect(busyTimes).toHaveLength(1);
    });
  });

  describe("non-seated events (regression)", () => {
    it("should mark slot busy when booking limit is reached for non-seated event", async () => {
      const limitManager = new LimitManager();
      const dateFrom = startOfTomorrow;
      const dateTo = startOfTomorrow.endOf("day");

      // Regular event with 1 booking per day limit
      const bookings: EventBusyDetails[] = [
        {
          start: startOfTomorrow.set("hour", 10).toDate(),
          end: startOfTomorrow.set("hour", 11).toDate(),
          title: "Booking 1",
          source: "eventType-1-booking-1",
          userId: 1,
          attendeeCount: 1,
        },
      ];

      await getBusyTimesFromBookingLimits({
        bookings,
        bookingLimits: { PER_DAY: 1 },
        dateFrom,
        dateTo,
        limitManager,
        eventTypeId: 1,
        timeZone: "UTC",
        // No seatsPerTimeSlot - this is a non-seated event
      });

      const busyTimes = limitManager.getBusyTimes();

      // Should be marked as busy because 1 booking >= 1 limit
      expect(busyTimes).toHaveLength(1);
    });

    it("should NOT mark slot busy when booking limit is not reached for non-seated event", async () => {
      const limitManager = new LimitManager();
      const dateFrom = startOfTomorrow;
      const dateTo = startOfTomorrow.endOf("day");

      // Regular event with 2 bookings per day limit, only 1 booking exists
      const bookings: EventBusyDetails[] = [
        {
          start: startOfTomorrow.set("hour", 10).toDate(),
          end: startOfTomorrow.set("hour", 11).toDate(),
          title: "Booking 1",
          source: "eventType-1-booking-1",
          userId: 1,
          attendeeCount: 1,
        },
      ];

      await getBusyTimesFromBookingLimits({
        bookings,
        bookingLimits: { PER_DAY: 2 }, // Limit is 2, only 1 booking
        dateFrom,
        dateTo,
        limitManager,
        eventTypeId: 1,
        timeZone: "UTC",
        // No seatsPerTimeSlot - this is a non-seated event
      });

      const busyTimes = limitManager.getBusyTimes();

      // Should NOT be marked as busy because 1 booking < 2 limit
      expect(busyTimes).toHaveLength(0);
    });
  });

  describe("yearly limits with seats", () => {
    it("should use seat-aware logic for yearly limits on seated events", async () => {
      const limitManager = new LimitManager();
      const dateFrom = dayjs().startOf("year");
      const dateTo = dayjs().endOf("year");

      // Event type has 5 seats and limit of 1 booking per year
      // 1 booking exists with 2 attendees - 3 seats should still be available
      const bookings: EventBusyDetails[] = [
        {
          start: dateFrom.add(1, "day").set("hour", 10).toDate(),
          end: dateFrom.add(1, "day").set("hour", 11).toDate(),
          title: "Booking 1",
          source: "eventType-1-booking-1",
          userId: 1,
          attendeeCount: 2, // Only 2 seats taken
        },
      ];

      await getBusyTimesFromBookingLimits({
        bookings,
        bookingLimits: { PER_YEAR: 1 },
        dateFrom,
        dateTo,
        limitManager,
        eventTypeId: 1,
        timeZone: "UTC",
        seatsPerTimeSlot: 5, // 5 seats available
      });

      const busyTimes = limitManager.getBusyTimes();

      // Should NOT be marked as busy because 2 attendees < 5 seats
      // (Without the fix, it would be blocked because 1 booking >= 1 limit)
      expect(busyTimes).toHaveLength(0);
    });

    it("should mark yearly slot busy when all seats are filled", async () => {
      const limitManager = new LimitManager();
      const dateFrom = dayjs().startOf("year");
      const dateTo = dayjs().endOf("year");

      // Event type has 3 seats, and all are booked
      const bookings: EventBusyDetails[] = [
        {
          start: dateFrom.add(1, "day").set("hour", 10).toDate(),
          end: dateFrom.add(1, "day").set("hour", 11).toDate(),
          title: "Booking 1",
          source: "eventType-1-booking-1",
          userId: 1,
          attendeeCount: 3, // All 3 seats taken
        },
      ];

      await getBusyTimesFromBookingLimits({
        bookings,
        bookingLimits: { PER_YEAR: 1 },
        dateFrom,
        dateTo,
        limitManager,
        eventTypeId: 1,
        timeZone: "UTC",
        seatsPerTimeSlot: 3, // Only 3 seats available
      });

      const busyTimes = limitManager.getBusyTimes();

      // Should be marked as busy because all 3 seats are taken
      expect(busyTimes).toHaveLength(1);
    });
  });

  describe("edge cases", () => {
    it("should handle attendeeCount defaulting to 1 when not provided", async () => {
      const limitManager = new LimitManager();
      const dateFrom = startOfTomorrow;
      const dateTo = startOfTomorrow.endOf("day");

      // Booking without attendeeCount should default to 1
      const bookings: EventBusyDetails[] = [
        {
          start: startOfTomorrow.set("hour", 10).toDate(),
          end: startOfTomorrow.set("hour", 11).toDate(),
          title: "Booking 1",
          source: "eventType-1-booking-1",
          userId: 1,
          // No attendeeCount - should default to 1
        },
      ];

      await getBusyTimesFromBookingLimits({
        bookings,
        bookingLimits: { PER_DAY: 1 },
        dateFrom,
        dateTo,
        limitManager,
        eventTypeId: 1,
        timeZone: "UTC",
        seatsPerTimeSlot: 2, // 2 seats, only 1 taken (default)
      });

      const busyTimes = limitManager.getBusyTimes();

      // Should NOT be marked as busy because 1 (default) < 2 seats
      expect(busyTimes).toHaveLength(0);
    });
  });
});
