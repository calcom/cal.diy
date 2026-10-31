import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkCfTurnstileToken, INVALID_CLOUDFLARE_TOKEN_ERROR } from "./checkCfTurnstileToken";

describe("checkCfTurnstileToken", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("should return success if TURNSTILE_SECRET_ID is not set", async () => {
    delete process.env.CLOUDFLARE_TURNSTILE_SECRET;
    const res = await checkCfTurnstileToken({ token: "any-token", remoteIp: "127.0.0.1" });
    expect(res).toEqual({ success: true });
  });

  it("should return success if NEXT_PUBLIC_IS_E2E is set", async () => {
    process.env.CLOUDFLARE_TURNSTILE_SECRET = "secret-key";
    process.env.NEXT_PUBLIC_IS_E2E = "1";
    const res = await checkCfTurnstileToken({ token: "any-token", remoteIp: "127.0.0.1" });
    expect(res).toEqual({ success: true });
  });

  it("should throw 401 HttpError if token is missing", async () => {
    process.env.CLOUDFLARE_TURNSTILE_SECRET = "secret-key";
    delete process.env.NEXT_PUBLIC_IS_E2E;

    await expect(checkCfTurnstileToken({ token: "", remoteIp: "127.0.0.1" })).rejects.toThrow(
      "No cloudflare token - please try again"
    );
  });

  it("should return data on successful turnstile verification", async () => {
    process.env.CLOUDFLARE_TURNSTILE_SECRET = "secret-key";
    delete process.env.NEXT_PUBLIC_IS_E2E;

    const mockResponse = new Response(
      JSON.stringify({ success: true, challenge_ts: "2026-09-28T12:00:00Z" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    vi.stubGlobal("fetch", mockFetch);

    const result = await checkCfTurnstileToken({ token: "valid-token", remoteIp: "1.2.3.4" });
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("should throw 401 HttpError when turnstile verification returns success: false", async () => {
    process.env.CLOUDFLARE_TURNSTILE_SECRET = "secret-key";
    delete process.env.NEXT_PUBLIC_IS_E2E;

    const mockResponse = new Response(
      JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    await expect(checkCfTurnstileToken({ token: "bad-token", remoteIp: "1.2.3.4" })).rejects.toThrow(
      INVALID_CLOUDFLARE_TOKEN_ERROR
    );
  });
});
