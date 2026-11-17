import { describe, expect, it, vi } from "vitest";

vi.mock("./constants", () => ({
  IS_PRODUCTION: true,
}));

import { redactError } from "./redactError";

describe("redactError", () => {
  it("returns non-error values untouched", () => {
    expect(redactError(null)).toBe(null);
    expect(redactError(undefined)).toBe(undefined);
    expect(redactError("string")).toBe("string");
    expect(redactError(123)).toBe(123);
  });

  it("returns normal errors as is", () => {
    const error = new Error("Regular application error");
    expect(redactError(error)).toBe(error);
  });

  it("preserves Prisma error code when redacting in production", () => {
    class PrismaClientKnownRequestError extends Error {
      code: string;
      constructor(message: string, code: string) {
        super(message);
        this.name = "PrismaClientKnownRequestError";
        this.code = code;
      }
    }

    const prismaError = new PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`idempotencyKey`)",
      "P2002",
    );

    const redacted = redactError(prismaError) as Error & { code?: string };
    expect(redacted).toBeInstanceOf(Error);
    expect(redacted).not.toBe(prismaError);
    expect(redacted.message).toBe(
      "An error occurred while querying the database.",
    );
    expect(redacted.code).toBe("P2002");
  });
});
