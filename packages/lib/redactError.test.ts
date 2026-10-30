import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("redactError", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should return non-Error values as-is", async () => {
    const { redactError } = await import("./redactError");
    expect(redactError("string error")).toBe("string error");
    expect(redactError(null)).toBe(null);
    expect(redactError({ foo: "bar" })).toEqual({ foo: "bar" });
  });

  it("should not redact regular errors even in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CALCOM_ENV", "production");
    const { redactError } = await import("./redactError");

    const error = new Error("Regular validation failure");
    const result = redactError(error);

    expect(result).toBe(error);
    expect((result as Error).message).toBe("Regular validation failure");
  });

  it("should not redact Prisma errors when not in production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CALCOM_ENV", "development");
    const { redactError } = await import("./redactError");

    const prismaError = new Error("Unique constraint failed on the fields: (`email`)") as Error & {
      name: string;
      code: string;
    };
    prismaError.name = "PrismaClientKnownRequestError";
    prismaError.code = "P2002";

    const result = redactError(prismaError);

    expect(result).toBe(prismaError);
    expect((result as Error).message).toBe("Unique constraint failed on the fields: (`email`)");
    expect((result as Error & { code: string }).code).toBe("P2002");
  });

  it("should redact Prisma error message but preserve code in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CALCOM_ENV", "production");
    const { redactError } = await import("./redactError");

    const prismaError = new Error(
      "Unique constraint failed on the constraint: Booking_idempotencyKey_key"
    ) as Error & { name: string; code: string; meta: Record<string, unknown> };
    prismaError.name = "PrismaClientKnownRequestError";
    prismaError.code = "P2002";
    prismaError.meta = { target: ["Booking_idempotencyKey_key"] };

    const result = redactError(prismaError) as Error & { code?: string; meta?: unknown };

    expect(result).not.toBe(prismaError);
    expect(result.message).toBe("An error occurred while querying the database.");
    expect(result.code).toBe("P2002");
    expect(result.meta).toBeUndefined();
  });

  it("should identify Prisma error by code starting with P in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CALCOM_ENV", "production");
    const { redactError } = await import("./redactError");

    const errorWithPrismaCode = new Error("Database query failed") as Error & { code: string };
    errorWithPrismaCode.code = "P2025";

    const result = redactError(errorWithPrismaCode) as Error & { code?: string };

    expect(result.message).toBe("An error occurred while querying the database.");
    expect(result.code).toBe("P2025");
  });

  it("should handle Prisma error without code in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CALCOM_ENV", "production");
    const { redactError } = await import("./redactError");

    const prismaError = new Error("General prisma failure");
    prismaError.name = "PrismaClientUnknownRequestError";

    const result = redactError(prismaError) as Error & { code?: string };

    expect(result.message).toBe("An error occurred while querying the database.");
    expect(result.code).toBeUndefined();
  });
});
