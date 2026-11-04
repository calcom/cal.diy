import { describe, expect, it } from "vitest";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode, getErrorFromUnknown, handleErrorsJson, handleErrorsRaw } from "./errors";

describe("handleErrorsJson", () => {
  it("should parse a successful JSON response", async () => {
    const response = new Response(JSON.stringify({ data: "test" }), { status: 200 });
    const result = await handleErrorsJson<{ data: string }>(response);
    expect(result).toEqual({ data: "test" });
  });

  it("should handle 204 no content", async () => {
    const response = new Response(null, { status: 204 });
    const result = await handleErrorsJson(response);
    expect(result).toEqual({});
  });

  it("should throw on error response with JSON body", async () => {
    const response = new Response(JSON.stringify({ message: "Resource not found" }), { status: 404 });
    const err = await (handleErrorsJson(response).catch((e) => e) as Promise<ErrorWithCode>);
    expect(err).toBeInstanceOf(ErrorWithCode);
    expect(err.code).toBe(ErrorCode.NotFound);
    expect(err.message).toBe("HTTP error 404: Resource not found");
  });

  it("should throw on error response with non-JSON body", async () => {
    const response = new Response("Internal Server Error", { status: 500 });
    const err = await (handleErrorsJson(response).catch((e) => e) as Promise<ErrorWithCode>);
    expect(err).toBeInstanceOf(ErrorWithCode);
    expect(err.code).toBe(ErrorCode.InternalServerError);
    expect(err.message).toBe("HTTP error 500: Internal Server Error");
  });

  it("should throw on 400 with BadRequest error code", async () => {
    const response = new Response(JSON.stringify({ message: "Invalid input" }), { status: 400 });
    const err = await (handleErrorsJson(response).catch((e) => e) as Promise<ErrorWithCode>);
    expect(err.code).toBe(ErrorCode.BadRequest);
  });

  it("should throw on 401 with Unauthorized error code", async () => {
    const response = new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
    const err = await (handleErrorsJson(response).catch((e) => e) as Promise<ErrorWithCode>);
    expect(err.code).toBe(ErrorCode.Unauthorized);
  });

  it("should throw on 403 with Forbidden error code", async () => {
    const response = new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 });
    const err = await (handleErrorsJson(response).catch((e) => e) as Promise<ErrorWithCode>);
    expect(err.code).toBe(ErrorCode.Forbidden);
  });

  it("should throw when JSON parsing fails on success response", async () => {
    const response = new Response("not json", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
    await expect(handleErrorsJson(response)).rejects.toThrow("Failed to parse response as JSON");
  });

  it("should handle gzip-encoded response", async () => {
    const response = new Response(JSON.stringify({ data: "compressed" }), {
      status: 200,
      headers: { "content-encoding": "gzip" },
    });
    const result = await handleErrorsJson<{ data: string }>(response);
    expect(result).toEqual({ data: "compressed" });
  });

  it("should throw on gzip-encoded error response", async () => {
    const response = new Response(JSON.stringify({ message: "Not Found" }), {
      status: 404,
      headers: { "content-encoding": "gzip" },
    });
    const err = await (handleErrorsJson(response).catch((e) => e) as Promise<ErrorWithCode>);
    expect(err.code).toBe(ErrorCode.NotFound);
    expect(err.message).toBe("HTTP error 404: Not Found");
  });
});

describe("handleErrorsRaw", () => {
  it("should return text for a successful response", async () => {
    const response = new Response("raw text data", { status: 200 });
    const result = await handleErrorsRaw(response);
    expect(result).toBe("raw text data");
  });

  it("should handle 204 no content", async () => {
    const response = new Response(null, { status: 204 });
    const result = await handleErrorsRaw(response);
    expect(result).toBe("{}");
  });

  it("should throw on error response", async () => {
    const response = new Response("Server Error", { status: 500 });
    await expect(handleErrorsRaw(response)).rejects.toThrow("HTTP error 500: Server Error");
  });
});

describe("getErrorFromUnknown", () => {
  it("should return the same Error instance", () => {
    const error = new Error("test error");
    const result = getErrorFromUnknown(error);
    expect(result).toBe(error);
    expect(result.message).toBe("test error");
  });

  it("should convert a string to an Error", () => {
    const result = getErrorFromUnknown("something went wrong");
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("something went wrong");
  });

  it("should handle unknown types gracefully", () => {
    const result = getErrorFromUnknown(42);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain("number");
  });

  it("should convert null to a descriptive error", () => {
    const result = getErrorFromUnknown(null);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain("object");
  });
});
