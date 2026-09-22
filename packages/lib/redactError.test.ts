import { describe, expect, it, vi } from "vitest";

const { mockLogDebug, mockLogError, envState } = vi.hoisted(() => ({
  mockLogDebug: vi.fn(),
  mockLogError: vi.fn(),
  envState: { isProduction: true },
}));

vi.mock("@calcom/lib/logger", () => ({
  default: {
    getSubLogger: () => ({
      debug: mockLogDebug,
      error: mockLogError,
    }),
  },
}));

vi.mock("./constants", () => ({
  get IS_PRODUCTION() {
    return envState.isProduction;
  },
}));

import { redactError } from "./redactError";

describe("redactError", () => {
  it("should return non-Error values unchanged", () => {
    envState.isProduction = true;
    expect(redactError(null)).toBeNull();
    expect(redactError(undefined)).toBeUndefined();
    expect(redactError("plain string error")).toBe("plain string error");
    expect(redactError(404)).toBe(404);
    expect(redactError({ foo: "bar" })).toEqual({ foo: "bar" });
  });

  it("should not redact standard non-database Errors in production", () => {
    envState.isProduction = true;
    const standardError = new Error("Something went wrong");
    const result = redactError(standardError);
    expect(result).toBe(standardError);
    expect((result as Error).message).toBe("Something went wrong");
  });

  it("should not redact standard TypeErrors or RangeErrors in production", () => {
    envState.isProduction = true;
    const typeError = new TypeError("Cannot read property of undefined");
    const result = redactError(typeError);
    expect(result).toBe(typeError);
    expect((result as Error).message).toBe("Cannot read property of undefined");
  });

  it("should redact Prisma errors matching name in production and log safeStringify", () => {
    envState.isProduction = true;
    mockLogError.mockClear();

    const prismaError = new Error("Unique constraint failed on the fields: (`email`)");
    prismaError.name = "PrismaClientKnownRequestError";

    const result = redactError(prismaError);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("An error occurred while querying the database.");

    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(mockLogError).toHaveBeenCalledWith("Error: ", expect.stringContaining("Unique constraint failed"));
  });

  it("should redact Prisma initialization and validation errors by name", () => {
    envState.isProduction = true;
    mockLogError.mockClear();

    const initError = new Error("Can't reach database server at localhost:5432");
    initError.name = "PrismaClientInitializationError";

    const result = redactError(initError);
    expect((result as Error).message).toBe("An error occurred while querying the database.");
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  it("should redact errors carrying a Prisma error code even if name is generic Error", () => {
    envState.isProduction = true;
    mockLogError.mockClear();

    const codeError = Object.assign(new Error("Record to update not found"), {
      code: "P2025",
    });

    const result = redactError(codeError);
    expect((result as Error).message).toBe("An error occurred while querying the database.");
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  it("should not redact Prisma errors when IS_PRODUCTION is false", () => {
    envState.isProduction = false;
    mockLogError.mockClear();

    const prismaError = new Error("Database timeout error");
    prismaError.name = "PrismaClientKnownRequestError";

    const result = redactError(prismaError);
    expect(result).toBe(prismaError);
    expect((result as Error).message).toBe("Database timeout error");
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it("should safely handle errors with circular references without throwing", () => {
    envState.isProduction = true;
    mockLogError.mockClear();

    const circularError = new Error("Prisma circular reference test");
    circularError.name = "PrismaClientKnownRequestError";
    (circularError as unknown as Record<string, unknown>).self = circularError;

    expect(() => redactError(circularError)).not.toThrow();
    const result = redactError(circularError);
    expect((result as Error).message).toBe("An error occurred while querying the database.");
  });

  describe("non-Prisma error codes", () => {
    it.each([
      ["PARSE_ERROR"],
      ["PERMISSION_DENIED"],
      ["PAYLOAD_TOO_LARGE"],
      ["P"],
      ["P123"],
      ["P12345"],
      ["ECONNREFUSED"],
    ])("should not redact an error whose code is %s", (code) => {
      envState.isProduction = true;
      const error = Object.assign(new Error("Upstream call failed"), { code });

      expect(redactError(error)).toBe(error);
    });

    it.each([["P1001"], ["P2002"], ["P2025"], ["P6100"]])(
      "should redact an error whose code is %s in production",
      (code) => {
        envState.isProduction = true;
        const error = Object.assign(new Error("Record not found"), { code });
        const result = redactError(error);

        expect(result).not.toBe(error);
        expect((result as Error).message).toBe("An error occurred while querying the database.");
      }
    );
  });
});
