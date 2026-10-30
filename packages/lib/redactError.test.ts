import { describe, expect, it, vi } from "vitest";

import type { RedactedPrismaError } from "./redactError";

class MockPrismaKnownRequestError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "PrismaClientKnownRequestError";
    this.code = code;
  }
}

describe("redactError", () => {
  it("returns non-Error values as-is", async () => {
    const { redactError } = await import("./redactError");
    expect(redactError("string-error")).toBe("string-error");
    expect(redactError(null)).toBeNull();
    expect(redactError(undefined)).toBeUndefined();
  });

  it("returns generic non-Prisma errors without modification", async () => {
    const { redactError } = await import("./redactError");
    const error = new Error("Standard application error");
    expect(redactError(error)).toBe(error);
  });

  it("preserves Prisma P2002 unique constraint code while hiding schema details in production (#30375)", async () => {
    vi.resetModules();
    vi.doMock("./constants", () => ({
      IS_PRODUCTION: true,
    }));

    const { redactError } = await import("./redactError");

    const prismaError = new MockPrismaKnownRequestError(
      "Unique constraint failed on the fields: (`Booking_idempotencyKey_key`) in table `Booking`",
      "P2002"
    );

    const redacted = redactError(prismaError) as RedactedPrismaError;

    expect(redacted.message).toBe("An error occurred while querying the database.");
    expect(redacted.message).not.toContain("Booking_idempotencyKey_key");
    expect(redacted.message).not.toContain("Booking");
    expect(redacted.code).toBe("P2002");
  });

  it("preserves other Prisma error codes (e.g. P2025) without exposing internal query details in production", async () => {
    vi.resetModules();
    vi.doMock("./constants", () => ({
      IS_PRODUCTION: true,
    }));

    const { redactError } = await import("./redactError");

    const prismaError = new MockPrismaKnownRequestError(
      "An operation failed because it depends on one or more records that were required but not found. Record to update not found on `Schedule`.",
      "P2025"
    );

    const redacted = redactError(prismaError) as RedactedPrismaError;

    expect(redacted.message).toBe("An error occurred while querying the database.");
    expect(redacted.message).not.toContain("Schedule");
    expect(redacted.code).toBe("P2025");
  });
});
