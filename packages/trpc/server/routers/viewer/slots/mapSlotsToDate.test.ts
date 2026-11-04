import dayjs from "@calcom/dayjs";
import { describe, expect, it } from "vitest";
import { mapSlotsToDateMap } from "./util";

// UTC formatter matching production usage (fr-CA gives YYYY-MM-DD)
const utcFormatter = new Intl.DateTimeFormat("fr-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
});

function makeSlot(isoString: string) {
  return { time: dayjs.utc(isoString) };
}

function makeCurrentSeat(isoString: string, attendees: number, uid = "booking-1") {
  return {
    uid,
    startTime: new Date(isoString),
    _count: { attendees },
  };
}

describe("mapSlotsToDateMap", () => {
  describe("basic slot mapping", () => {
    it("should map slots to their respective dates", () => {
      const result = mapSlotsToDateMap({
        availableTimeSlots: [
          makeSlot("2025-06-15T09:00:00.000Z"),
          makeSlot("2025-06-15T09:30:00.000Z"),
          makeSlot("2025-06-16T10:00:00.000Z"),
        ],
        currentSeats: null,
        eventType: null,
        formatter: utcFormatter,
      });

      expect(Object.keys(result)).toEqual(["2025-06-15", "2025-06-16"]);
      expect(result["2025-06-15"]).toHaveLength(2);
      expect(result["2025-06-16"]).toHaveLength(1);
    });

    it("should return empty object when no slots are provided", () => {
      const result = mapSlotsToDateMap({
        availableTimeSlots: [],
        currentSeats: null,
        eventType: null,
        formatter: utcFormatter,
      });

      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe("onlyShowFirstAvailableSlot without seats", () => {
    it("should show only the first slot per day when enabled", () => {
      const result = mapSlotsToDateMap({
        availableTimeSlots: [
          makeSlot("2025-06-15T09:00:00.000Z"),
          makeSlot("2025-06-15T09:30:00.000Z"),
          makeSlot("2025-06-15T10:00:00.000Z"),
        ],
        currentSeats: null,
        eventType: { onlyShowFirstAvailableSlot: true },
        formatter: utcFormatter,
      });

      expect(result["2025-06-15"]).toHaveLength(1);
      expect(result["2025-06-15"][0].time).toBe("2025-06-15T09:00:00.000Z");
    });

    it("should show all slots when disabled", () => {
      const result = mapSlotsToDateMap({
        availableTimeSlots: [
          makeSlot("2025-06-15T09:00:00.000Z"),
          makeSlot("2025-06-15T09:30:00.000Z"),
          makeSlot("2025-06-15T10:00:00.000Z"),
        ],
        currentSeats: null,
        eventType: { onlyShowFirstAvailableSlot: false },
        formatter: utcFormatter,
      });

      expect(result["2025-06-15"]).toHaveLength(3);
    });

    it("should still show first slot per day across multiple days", () => {
      const result = mapSlotsToDateMap({
        availableTimeSlots: [
          makeSlot("2025-06-15T09:00:00.000Z"),
          makeSlot("2025-06-15T10:00:00.000Z"),
          makeSlot("2025-06-16T11:00:00.000Z"),
          makeSlot("2025-06-16T12:00:00.000Z"),
        ],
        currentSeats: null,
        eventType: { onlyShowFirstAvailableSlot: true },
        formatter: utcFormatter,
      });

      expect(result["2025-06-15"]).toHaveLength(1);
      expect(result["2025-06-15"][0].time).toBe("2025-06-15T09:00:00.000Z");
      expect(result["2025-06-16"]).toHaveLength(1);
      expect(result["2025-06-16"][0].time).toBe("2025-06-16T11:00:00.000Z");
    });
  });

  describe("seat capacity handling", () => {
    it("should attach attendees and bookingUid when slot has existing bookings", () => {
      const result = mapSlotsToDateMap({
        availableTimeSlots: [makeSlot("2025-06-15T09:00:00.000Z")],
        currentSeats: [makeCurrentSeat("2025-06-15T09:00:00.000Z", 1, "uid-123")],
        eventType: { seatsPerTimeSlot: 3 },
        formatter: utcFormatter,
      });

      expect(result["2025-06-15"][0].attendees).toBe(1);
      expect(result["2025-06-15"][0].bookingUid).toBe("uid-123");
    });

    it("should exclude fully booked slots", () => {
      const result = mapSlotsToDateMap({
        availableTimeSlots: [makeSlot("2025-06-15T09:00:00.000Z"), makeSlot("2025-06-15T09:30:00.000Z")],
        currentSeats: [makeCurrentSeat("2025-06-15T09:00:00.000Z", 2)],
        eventType: { seatsPerTimeSlot: 2 },
        formatter: utcFormatter,
      });

      expect(result["2025-06-15"]).toHaveLength(1);
      expect(result["2025-06-15"][0].time).toBe("2025-06-15T09:30:00.000Z");
    });

    it("should include partially booked slots", () => {
      const result = mapSlotsToDateMap({
        availableTimeSlots: [makeSlot("2025-06-15T09:00:00.000Z")],
        currentSeats: [makeCurrentSeat("2025-06-15T09:00:00.000Z", 1)],
        eventType: { seatsPerTimeSlot: 3 },
        formatter: utcFormatter,
      });

      expect(result["2025-06-15"]).toHaveLength(1);
      expect(result["2025-06-15"][0].attendees).toBe(1);
    });

    it("should exclude slot when attendees exceed seat capacity", () => {
      const result = mapSlotsToDateMap({
        availableTimeSlots: [makeSlot("2025-06-15T09:00:00.000Z")],
        currentSeats: [makeCurrentSeat("2025-06-15T09:00:00.000Z", 5)],
        eventType: { seatsPerTimeSlot: 3 },
        formatter: utcFormatter,
      });

      expect(result["2025-06-15"] ?? []).toHaveLength(0);
    });
  });

  describe("onlyShowFirstAvailableSlot combined with seats (bug fix)", () => {
    it("should show next available slot when first slot reaches full seat capacity", () => {
      const result = mapSlotsToDateMap({
        availableTimeSlots: [
          makeSlot("2025-06-15T09:00:00.000Z"),
          makeSlot("2025-06-15T09:30:00.000Z"),
          makeSlot("2025-06-15T10:00:00.000Z"),
        ],
        currentSeats: [makeCurrentSeat("2025-06-15T09:00:00.000Z", 2)],
        eventType: { onlyShowFirstAvailableSlot: true, seatsPerTimeSlot: 2 },
        formatter: utcFormatter,
      });

      expect(result["2025-06-15"]).toHaveLength(1);
      expect(result["2025-06-15"][0].time).toBe("2025-06-15T09:30:00.000Z");
    });

    it("should show first slot when it still has available seats", () => {
      const result = mapSlotsToDateMap({
        availableTimeSlots: [
          makeSlot("2025-06-15T09:00:00.000Z"),
          makeSlot("2025-06-15T09:30:00.000Z"),
          makeSlot("2025-06-15T10:00:00.000Z"),
        ],
        currentSeats: [makeCurrentSeat("2025-06-15T09:00:00.000Z", 1)],
        eventType: { onlyShowFirstAvailableSlot: true, seatsPerTimeSlot: 3 },
        formatter: utcFormatter,
      });

      expect(result["2025-06-15"]).toHaveLength(1);
      expect(result["2025-06-15"][0].time).toBe("2025-06-15T09:00:00.000Z");
      expect(result["2025-06-15"][0].attendees).toBe(1);
    });

    it("should skip multiple fully booked slots and show the first available one", () => {
      const result = mapSlotsToDateMap({
        availableTimeSlots: [
          makeSlot("2025-06-15T09:00:00.000Z"),
          makeSlot("2025-06-15T09:30:00.000Z"),
          makeSlot("2025-06-15T10:00:00.000Z"),
        ],
        currentSeats: [
          makeCurrentSeat("2025-06-15T09:00:00.000Z", 2, "booking-1"),
          makeCurrentSeat("2025-06-15T09:30:00.000Z", 2, "booking-2"),
        ],
        eventType: { onlyShowFirstAvailableSlot: true, seatsPerTimeSlot: 2 },
        formatter: utcFormatter,
      });

      expect(result["2025-06-15"]).toHaveLength(1);
      expect(result["2025-06-15"][0].time).toBe("2025-06-15T10:00:00.000Z");
    });

    it("should return no slots for a day when all slots are fully booked", () => {
      const result = mapSlotsToDateMap({
        availableTimeSlots: [makeSlot("2025-06-15T09:00:00.000Z"), makeSlot("2025-06-15T09:30:00.000Z")],
        currentSeats: [
          makeCurrentSeat("2025-06-15T09:00:00.000Z", 2, "booking-1"),
          makeCurrentSeat("2025-06-15T09:30:00.000Z", 2, "booking-2"),
        ],
        eventType: { onlyShowFirstAvailableSlot: true, seatsPerTimeSlot: 2 },
        formatter: utcFormatter,
      });

      expect(result["2025-06-15"] ?? []).toHaveLength(0);
    });

    it("should handle seats + onlyShowFirstAvailableSlot across multiple days", () => {
      const result = mapSlotsToDateMap({
        availableTimeSlots: [
          makeSlot("2025-06-15T09:00:00.000Z"),
          makeSlot("2025-06-15T09:30:00.000Z"),
          makeSlot("2025-06-16T09:00:00.000Z"),
          makeSlot("2025-06-16T09:30:00.000Z"),
        ],
        currentSeats: [
          makeCurrentSeat("2025-06-15T09:00:00.000Z", 2, "booking-1"),
          makeCurrentSeat("2025-06-16T09:00:00.000Z", 1, "booking-2"),
        ],
        eventType: { onlyShowFirstAvailableSlot: true, seatsPerTimeSlot: 2 },
        formatter: utcFormatter,
      });

      // Day 1: first slot fully booked, should show 09:30
      expect(result["2025-06-15"]).toHaveLength(1);
      expect(result["2025-06-15"][0].time).toBe("2025-06-15T09:30:00.000Z");

      // Day 2: first slot partially booked (1/2), should still show 09:00
      expect(result["2025-06-16"]).toHaveLength(1);
      expect(result["2025-06-16"][0].time).toBe("2025-06-16T09:00:00.000Z");
      expect(result["2025-06-16"][0].attendees).toBe(1);
    });

    it("should not filter by seats when seatsPerTimeSlot is null", () => {
      const result = mapSlotsToDateMap({
        availableTimeSlots: [makeSlot("2025-06-15T09:00:00.000Z"), makeSlot("2025-06-15T09:30:00.000Z")],
        currentSeats: [makeCurrentSeat("2025-06-15T09:00:00.000Z", 5)],
        eventType: { onlyShowFirstAvailableSlot: true, seatsPerTimeSlot: null },
        formatter: utcFormatter,
      });

      // Without seat filtering, first slot should be shown even with bookings
      expect(result["2025-06-15"]).toHaveLength(1);
      expect(result["2025-06-15"][0].time).toBe("2025-06-15T09:00:00.000Z");
    });

    it("should not filter by seats when seatsPerTimeSlot is 0", () => {
      const result = mapSlotsToDateMap({
        availableTimeSlots: [makeSlot("2025-06-15T09:00:00.000Z"), makeSlot("2025-06-15T09:30:00.000Z")],
        currentSeats: [makeCurrentSeat("2025-06-15T09:00:00.000Z", 5)],
        eventType: { onlyShowFirstAvailableSlot: true, seatsPerTimeSlot: 0 },
        formatter: utcFormatter,
      });

      // seatsPerTimeSlot=0 is falsy, so seat filtering should not apply
      expect(result["2025-06-15"]).toHaveLength(1);
      expect(result["2025-06-15"][0].time).toBe("2025-06-15T09:00:00.000Z");
    });
  });

  describe("seat capacity without onlyShowFirstAvailableSlot", () => {
    it("should still exclude fully booked slots from all displayed slots", () => {
      const result = mapSlotsToDateMap({
        availableTimeSlots: [
          makeSlot("2025-06-15T09:00:00.000Z"),
          makeSlot("2025-06-15T09:30:00.000Z"),
          makeSlot("2025-06-15T10:00:00.000Z"),
        ],
        currentSeats: [makeCurrentSeat("2025-06-15T09:00:00.000Z", 2)],
        eventType: { onlyShowFirstAvailableSlot: false, seatsPerTimeSlot: 2 },
        formatter: utcFormatter,
      });

      expect(result["2025-06-15"]).toHaveLength(2);
      expect(result["2025-06-15"].map((s) => s.time)).toEqual([
        "2025-06-15T09:30:00.000Z",
        "2025-06-15T10:00:00.000Z",
      ]);
    });
  });

  describe("timezone formatting", () => {
    it("should group slots by date in the specified timezone", () => {
      // Use America/New_York formatter (UTC-4 in summer)
      const nyFormatter = new Intl.DateTimeFormat("fr-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "America/New_York",
      });

      const result = mapSlotsToDateMap({
        availableTimeSlots: [
          // This is 11 PM on June 15 in New York (UTC-4)
          makeSlot("2025-06-16T03:00:00.000Z"),
        ],
        currentSeats: null,
        eventType: null,
        formatter: nyFormatter,
      });

      // Should appear on June 15 in New York time, not June 16
      expect(result["2025-06-15"]).toHaveLength(1);
      expect(result["2025-06-16"]).toBeUndefined();
    });
  });
});
