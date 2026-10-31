import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockHandleCancelBooking = vi.fn().mockResolvedValue({ success: true });
const mockValidateCsrfToken = vi.fn().mockResolvedValue(null);
const mockGetServerSession = vi.fn().mockResolvedValue({ user: { id: 1 } });
const mockCheckRateLimit = vi.fn().mockResolvedValue(undefined);

vi.mock("app/api/defaultResponderForAppDir", () => ({
  defaultResponderForAppDir:
    (handler: (req: NextRequest) => Promise<Response>) =>
    (req: NextRequest, _context: { params: Promise<Record<string, string>> }) =>
      handler(req),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: vi.fn().mockResolvedValue({ getAll: () => [] }),
}));

vi.mock("@calcom/features/auth/lib/getServerSession", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

vi.mock("@calcom/features/bookings/lib/handleCancelBooking", () => ({
  default: (...args: unknown[]) => mockHandleCancelBooking(...args),
}));

vi.mock("@calcom/lib/checkRateLimitAndThrowError", () => ({
  checkRateLimitAndThrowError: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("@calcom/lib/server/PiiHasher", () => ({
  piiHasher: { hash: vi.fn().mockReturnValue("hashed-ip") },
}));

vi.mock("@calcom/web/lib/validateCsrfToken", () => ({
  validateCsrfToken: (...args: unknown[]) => mockValidateCsrfToken(...args),
}));

vi.mock("@lib/buildLegacyCtx", () => ({
  buildLegacyRequest: vi.fn().mockReturnValue({}),
}));

import { POST } from "../route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const VALID_CSRF = "a".repeat(64);

beforeEach(() => {
  mockHandleCancelBooking.mockClear();
  mockHandleCancelBooking.mockResolvedValue({ success: true });
});

describe("web cancel route", () => {
  it("rejects a payload with only the sequential id", async () => {
    const res = await POST(makeRequest({ id: 101, csrfToken: VALID_CSRF }));
    expect(res.status).toBe(400);
    expect(mockHandleCancelBooking).not.toHaveBeenCalled();
  });

  it("strips id from uid+id payloads so lookup is never by id", async () => {
    const res = await POST(
      makeRequest({ uid: "high-entropy-uid", id: 101, csrfToken: VALID_CSRF })
    );
    expect(res.status).toBe(200);
    expect(mockHandleCancelBooking).toHaveBeenCalledTimes(1);
    const { bookingData } = mockHandleCancelBooking.mock.calls[0][0];
    expect(bookingData).not.toHaveProperty("id");
    expect(bookingData.uid).toBe("high-entropy-uid");
  });

  it("passes uid-only bookingData to handleCancelBooking", async () => {
    const res = await POST(
      makeRequest({ uid: "high-entropy-uid", csrfToken: VALID_CSRF })
    );
    expect(res.status).toBe(200);
    expect(mockHandleCancelBooking).toHaveBeenCalledTimes(1);
    const { bookingData } = mockHandleCancelBooking.mock.calls[0][0];
    expect(bookingData.uid).toBe("high-entropy-uid");
    expect(bookingData).not.toHaveProperty("id");
  });

  it("still rejects invalid JSON bodies", async () => {
    const req = new Request("http://localhost/api/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockHandleCancelBooking).not.toHaveBeenCalled();
  });
});
