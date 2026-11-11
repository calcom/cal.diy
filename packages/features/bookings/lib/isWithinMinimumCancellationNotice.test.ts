import { describe, expect, it } from "vitest";

import { isWithinMinimumCancellationNotice } from "./isWithinMinimumCancellationNotice";

describe("isWithinMinimumCancellationNotice", () => {
  it("should return false when minimumCancellationNotice is null or undefined or <= 0", () => {
    const futureDate = new Date(Date.now() + 30 * 60 * 1000);
    expect(isWithinMinimumCancellationNotice(futureDate, null)).toBe(false);
    expect(isWithinMinimumCancellationNotice(futureDate, 0)).toBe(false);
    expect(isWithinMinimumCancellationNotice(futureDate, -10)).toBe(false);
  });

  it("should return false when bookingStartTime is null", () => {
    expect(isWithinMinimumCancellationNotice(null, 60)).toBe(false);
  });

  it("should return false when cancellation is requested well before the cutoff", () => {
    // Event is in 2 hours, cutoff is 60 minutes
    const futureDate = new Date(Date.now() + 120 * 60 * 1000);
    expect(isWithinMinimumCancellationNotice(futureDate, 60)).toBe(false);
  });

  it("should return true when cancellation is requested inside the cutoff window", () => {
    // Event is in 30 minutes, cutoff is 60 minutes
    const soonDate = new Date(Date.now() + 30 * 60 * 1000);
    expect(isWithinMinimumCancellationNotice(soonDate, 60)).toBe(true);
  });

  it("should return true when the event has already started", () => {
    // Event started 5 minutes ago, cutoff is 60 minutes
    const ongoingDate = new Date(Date.now() - 5 * 60 * 1000);
    expect(isWithinMinimumCancellationNotice(ongoingDate, 60)).toBe(true);
  });
});
