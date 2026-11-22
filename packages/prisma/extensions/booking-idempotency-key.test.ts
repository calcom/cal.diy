import { describe, it, expect, vi } from "vitest";

import { BookingStatus } from "../enums";
import { generateIdempotencyKey } from "./booking-idempotency-key";

describe("Booking Idempotency Key Extension", () => {
  const startTime = new Date("2026-12-01T10:00:00.000Z");
  const endTime = new Date("2026-12-01T10:30:00.000Z");
  const userId = 42;

  it("generateIdempotencyKey generates deterministic UUIDv5 key for same inputs", () => {
    const key1 = generateIdempotencyKey({
      startTime,
      endTime,
      userId,
    });
    const key2 = generateIdempotencyKey({
      startTime,
      endTime,
      userId,
    });

    expect(key1).toBeDefined();
    expect(key1).toBe(key2);
  });

  it("generateIdempotencyKey produces identical keys for equivalent Date objects and ISO strings", () => {
    const keyDate = generateIdempotencyKey({
      startTime: new Date("2026-12-01T10:00:00.000Z"),
      endTime: new Date("2026-12-01T10:30:00.000Z"),
      userId,
    });
    const keyString = generateIdempotencyKey({
      startTime: "2026-12-01T10:00:00.000Z",
      endTime: "2026-12-01T10:30:00.000Z",
      userId,
    });

    expect(keyString).toBe(keyDate);
  });

  it("generateIdempotencyKey produces distinct keys for different start times or users", () => {
    const keyUser1 = generateIdempotencyKey({
      startTime,
      endTime,
      userId: 1,
    });
    const keyUser2 = generateIdempotencyKey({
      startTime,
      endTime,
      userId: 2,
    });
    const keyDifferentTime = generateIdempotencyKey({
      startTime: new Date("2026-12-01T11:00:00.000Z"),
      endTime: new Date("2026-12-01T11:30:00.000Z"),
      userId: 1,
    });

    expect(keyUser1).not.toBe(keyUser2);
    expect(keyUser1).not.toBe(keyDifferentTime);
  });

  it("generateIdempotencyKey incorporates reassignedById when provided", () => {
    const keyWithoutReassign = generateIdempotencyKey({
      startTime,
      endTime,
      userId,
      reassignedById: null,
    });
    const keyWithReassign = generateIdempotencyKey({
      startTime,
      endTime,
      userId,
      reassignedById: 99,
    });

    expect(keyWithReassign).not.toBe(keyWithoutReassign);
  });
});
