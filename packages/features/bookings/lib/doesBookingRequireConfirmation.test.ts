import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { doesBookingRequireConfirmation } from "./doesBookingRequireConfirmation";

const NOW = new Date("2026-01-15T10:00:00.000Z");

const bookingStartingIn = (ms: number, threshold: { time: number; unit: "minutes" | "hours" | "days" }) => ({
  booking: {
    startTime: new Date(NOW.getTime() + ms),
    eventType: {
      requiresConfirmation: true,
      metadata: { requiresConfirmationThreshold: threshold },
    },
  },
});

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("doesBookingRequireConfirmation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires confirmation when booked with less notice than the threshold", () => {
    expect(
      doesBookingRequireConfirmation(bookingStartingIn(HOUR + 59 * MINUTE, { time: 2, unit: "hours" }))
    ).toBe(true);
  });

  it("does not require confirmation when the notice equals the threshold", () => {
    expect(doesBookingRequireConfirmation(bookingStartingIn(2 * HOUR, { time: 2, unit: "hours" }))).toBe(
      false
    );
  });

  it("does not require confirmation when the notice is a partial unit above the threshold", () => {
    expect(
      doesBookingRequireConfirmation(bookingStartingIn(2 * HOUR + 30 * MINUTE, { time: 2, unit: "hours" }))
    ).toBe(false);
    expect(
      doesBookingRequireConfirmation(bookingStartingIn(DAY + 23 * HOUR, { time: 1, unit: "days" }))
    ).toBe(false);
    expect(
      doesBookingRequireConfirmation(
        bookingStartingIn(30 * MINUTE + 30 * 1000, { time: 30, unit: "minutes" })
      )
    ).toBe(false);
  });

  it("does not require confirmation when well beyond the threshold", () => {
    expect(doesBookingRequireConfirmation(bookingStartingIn(5 * DAY, { time: 2, unit: "hours" }))).toBe(
      false
    );
  });

  it("falls back to the event type setting when there is no threshold", () => {
    expect(
      doesBookingRequireConfirmation({
        booking: {
          startTime: new Date(NOW.getTime() + 5 * DAY),
          eventType: { requiresConfirmation: true, metadata: {} },
        },
      })
    ).toBe(true);
  });

  it("handles a fractional threshold without truncating the notice", () => {
    expect(
      doesBookingRequireConfirmation(bookingStartingIn(2 * HOUR + 15 * MINUTE, { time: 2.5, unit: "hours" }))
    ).toBe(true);
    expect(
      doesBookingRequireConfirmation(bookingStartingIn(2 * HOUR + 45 * MINUTE, { time: 2.5, unit: "hours" }))
    ).toBe(false);
  });

  it("measures the notice from when the booking was made, not from when payment completes", () => {
    const booking = bookingStartingIn(HOUR + 55 * MINUTE, { time: 2, unit: "hours" }).booking;
    // Booked 10 minutes ago with 2h05m notice; payment only completes now.
    expect(
      doesBookingRequireConfirmation({
        booking: { ...booking, createdAt: new Date(NOW.getTime() - 10 * MINUTE) },
      })
    ).toBe(false);
    // Booked 1 minute ago with 1h56m notice.
    expect(
      doesBookingRequireConfirmation({
        booking: { ...booking, createdAt: new Date(NOW.getTime() - MINUTE) },
      })
    ).toBe(true);
  });
});
