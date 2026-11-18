import process from "node:process";
import { EventTypeMetaDataSchema } from "@calcom/prisma/zod-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getRequiresConfirmationFlags } from "./getRequiresConfirmationFlags";

vi.mock("@calcom/features/watchlist/lib/freeEmailDomainCheck/checkIfFreeEmailDomain", () => ({
  checkIfFreeEmailDomain: vi.fn().mockResolvedValue(false),
}));

const NOW: Date = new Date("2026-01-15T10:00:00.000Z");
const HOUR: number = 60 * 60 * 1000;

const withProcessTimeZone = async (timeZone: string, run: () => Promise<void>): Promise<void> => {
  const originalTimeZone = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    await run();
  } finally {
    if (originalTimeZone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimeZone;
    }
  }
};

const getFlagsForStart = (
  bookingStartTime: string,
  metadata: unknown
): ReturnType<typeof getRequiresConfirmationFlags> =>
  getRequiresConfirmationFlags({
    eventType: {
      requiresConfirmation: true,
      requiresConfirmationForFreeEmail: false,
      metadata: EventTypeMetaDataSchema.parse(metadata),
    },
    bookingStartTime,
    userId: undefined,
    paymentAppData: { price: 0 },
    originalRescheduledBookingOrganizerId: undefined,
    bookerEmail: "booker@example.com",
  });

const getFlags = (
  noticeMs: number,
  thresholdTime: number = 2
): ReturnType<typeof getRequiresConfirmationFlags> =>
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

  it("reads a start time without an offset in the server time zone, like the stored start", async () => {
    await withProcessTimeZone("Europe/Berlin", async () => {
      // 12:30 Berlin time is 11:30Z: 1.5 hours of notice, below the 2-hour threshold.
      const flags = await getFlagsForStart("2026-01-15T12:30:00", {
        requiresConfirmationThreshold: { time: 2, unit: "hours" },
      });
      expect(flags.isConfirmedByDefault).toBe(false);
    });
  });

  it("measures a 24-hour threshold as elapsed time across a DST change", async () => {
    await withProcessTimeZone("America/New_York", async () => {
      vi.setSystemTime(new Date("2026-03-07T12:00:00.000Z"));
      const metadata = { requiresConfirmationThreshold: { time: 24, unit: "hours" } };
      // 23.5 hours of notice across the US spring-forward change still requires confirmation.
      expect((await getFlagsForStart("2026-03-08T11:30:00.000Z", metadata)).isConfirmedByDefault).toBe(false);
      expect((await getFlagsForStart("2026-03-08T12:00:00.000Z", metadata)).isConfirmedByDefault).toBe(true);
    });
  });
});
