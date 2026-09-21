import { ErrorCode } from "@calcom/lib/errorCodes";
import type { NextApiRequest, NextApiResponse } from "next";
import { describe, expect, it, vi } from "vitest";
import { defaultResponder } from "./defaultResponder";

/**
 * Creates a mock TRPC-like error for testing purposes.
 * This avoids importing from @trpc/server in the lib package.
 */
function createMockTRPCError(code: string): Error {
  const error = new Error(`TRPC Error: ${code}`);
  error.name = "TRPCError";
  (error as Error & { code: string }).code = code;
  return error;
}

describe("defaultResponder", () => {
  it("should call res.json when response is still writable and result is not null", async () => {
    const f = vi.fn().mockResolvedValue({});
    const req = {} as NextApiRequest;
    const res = {
      json: vi.fn(),
      writableEnded: false,
      setHeader: vi.fn(),
    } as unknown as NextApiResponse;
    await defaultResponder(f)(req, res);
    expect(res.json).toHaveBeenCalled();
  });

  it("should not call res.json when response is not writable", async () => {
    const f = vi.fn().mockResolvedValue({});
    const req = {} as NextApiRequest;
    const res = {
      json: vi.fn(),
      writableEnded: true,
      setHeader: vi.fn(),
    } as unknown as NextApiResponse;
    await defaultResponder(f)(req, res);
    expect(res.json).not.toHaveBeenCalled();
  });
  it("should respond with status code 409 for NoAvailableUsersFound", async () => {
    const f = vi.fn().mockRejectedValue(new Error(ErrorCode.NoAvailableUsersFound));
    const req = {} as NextApiRequest;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      setHeader: vi.fn(),
    } as unknown as NextApiResponse;
    await defaultResponder(f)(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
  it("Rate limit should respond with a 429 status code", async () => {
    const f = vi.fn().mockRejectedValue(createMockTRPCError("TOO_MANY_REQUESTS"));
    const req = {} as NextApiRequest;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      setHeader: vi.fn(),
    } as unknown as NextApiResponse;
    await defaultResponder(f)(req, res);
    expect(res.status).toHaveBeenCalledWith(429);
  });
});
