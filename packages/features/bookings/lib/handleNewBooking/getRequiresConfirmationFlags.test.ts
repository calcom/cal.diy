import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getRequiresConfirmationFlags } from "./getRequiresConfirmationFlags";

vi.mock("@calcom/features/watchlist/lib/freeEmailDomainCheck/checkIfFreeEmailDomain", () => ({
  checkIfFreeEmailDomain: vi.fn().mockResolvedValue(false),
}));

const NOW = new Date("2026-01-15T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;

const getFlags = (noticeMs: number, thresholdTime = 2) =>
  getRequiresConfirmationFlags({
    eventType: {
      requiresConfirmation: true,
      requiresConfirmationForFreeEmail: false,
      metadata: { requiresConfirmationThreshold: { time: thresholdTime, unit: "hours" } },
    },
    bookingStartTime: new Date(NOW.getTime() + noticeMs).toISOString(),
    userId: undefined,
    paymentAppData: { price: 0 },
    originalRescheduledBookingOrganizerId: undefined,
    bookerEmail: "booker@example.com",
  });

describe("getRequiresConfirmationFlags - requiresConfirmationThreshold", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires confirmation when booked with less than the threshold notice", async () => {
    const flags = await getFlags(HOUR + 59 * 60 * 1000);
    expect(flags.isConfirmedByDefault).toBe(false);
  });

  it("confirms by default when the notice is exactly the threshold", async () => {
    const flags = await getFlags(2 * HOUR);
    expect(flags.isConfirmedByDefault).toBe(true);
  });

  it("confirms by default when the notice is a partial unit above the threshold", async () => {
    const flags = await getFlags(2 * HOUR + 30 * 60 * 1000);
    expect(flags.isConfirmedByDefault).toBe(true);
  });

  it("handles a fractional threshold without truncating the notice", async () => {
    expect((await getFlags(2 * HOUR + 15 * 60 * 1000, 2.5)).isConfirmedByDefault).toBe(false);
    expect((await getFlags(2 * HOUR + 45 * 60 * 1000, 2.5)).isConfirmedByDefault).toBe(true);
  });

  it("keeps the milliseconds of the start time", async () => {
    vi.setSystemTime(new Date(NOW.getTime() + 500));
    // 2 hours and 400ms of notice is at least the 2-hour threshold.
    const flags = await getFlags(2 * HOUR + 900);
    expect(flags.isConfirmedByDefault).toBe(true);
  });

  it("measures day thresholds as elapsed time when a DST change falls inside the notice", async () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = "America/New_York";
    vi.setSystemTime(new Date("2026-03-07T12:00:00.000Z"));
    try {
      // 35.5 hours of notice across the US spring-forward change is below a 1.5-day threshold.
      const flags = await getRequiresConfirmationFlags({
        eventType: {
          requiresConfirmation: true,
          requiresConfirmationForFreeEmail: false,
          metadata: { requiresConfirmationThreshold: { time: 1.5, unit: "days" } },
        },
        bookingStartTime: "2026-03-08T23:30:00.000Z",
        userId: undefined,
        paymentAppData: { price: 0 },
        originalRescheduledBookingOrganizerId: undefined,
        bookerEmail: "booker@example.com",
      });
      expect(flags.isConfirmedByDefault).toBe(false);
    } finally {
      process.env.TZ = originalTimeZone;
    }
  });
});
