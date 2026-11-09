import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getRequiresConfirmationFlags } from "./getRequiresConfirmationFlags";

vi.mock("@calcom/features/watchlist/lib/freeEmailDomainCheck/checkIfFreeEmailDomain", () => ({
  checkIfFreeEmailDomain: vi.fn().mockResolvedValue(false),
}));

const NOW = new Date("2026-01-15T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;

const getFlags = (noticeMs: number) =>
  getRequiresConfirmationFlags({
    eventType: {
      requiresConfirmation: true,
      requiresConfirmationForFreeEmail: false,
      metadata: { requiresConfirmationThreshold: { time: 2, unit: "hours" } },
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
});
