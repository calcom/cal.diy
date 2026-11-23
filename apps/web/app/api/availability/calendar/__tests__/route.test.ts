import { describe, expect, it, vi } from "vitest";

import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";

import { WEBAPP_URL } from "@calcom/lib/constants";

import { assertSameOrigin } from "../assertSameOrigin";
import { DELETE, POST } from "../route";

vi.mock("@calcom/prisma", () => ({ default: prismaMock }));

vi.mock("@calcom/features/auth/lib/getServerSession", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: vi.fn(),
}));

vi.mock("@calcom/features/selectedCalendar/repositories/SelectedCalendarRepository", () => ({
  SelectedCalendarRepository: { upsert: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
}));

vi.mock("@calcom/features/calendars/lib/CalendarManager", () => ({
  getCalendarCredentials: vi.fn(),
  getConnectedCalendars: vi.fn(),
}));

const sameOrigin = new URL(WEBAPP_URL).origin;
const evilOrigin = "https://evil.example";
const requestBody = JSON.stringify({ integration: "cal_google", externalId: "id", credentialId: 1 });

describe("assertSameOrigin", () => {
  it("allows requests from the web app origin", () => {
    const req = new Request(`${WEBAPP_URL}/api/availability/calendar`, {
      method: "POST",
      headers: { origin: sameOrigin },
    });
    expect(() => assertSameOrigin(req)).not.toThrow();
  });

  it("rejects cross-origin requests with 403", () => {
    const req = new Request(`${WEBAPP_URL}/api/availability/calendar`, {
      method: "POST",
      headers: { origin: evilOrigin },
    });
    expect(() => assertSameOrigin(req)).toThrowError(expect.objectContaining({ statusCode: 403 }));
  });

  it("rejects a null Origin (sandboxed iframe)", () => {
    const req = new Request(`${WEBAPP_URL}/api/availability/calendar`, {
      method: "POST",
      headers: { origin: "null" },
    });
    expect(() => assertSameOrigin(req)).toThrowError(expect.objectContaining({ statusCode: 403 }));
  });

  it("allows requests without an Origin header (non-browser clients)", () => {
    const req = new Request(`${WEBAPP_URL}/api/availability/calendar`, { method: "POST" });
    expect(() => assertSameOrigin(req)).not.toThrow();
  });
});

describe("POST/DELETE /api/availability/calendar (CSRF)", () => {
  it("rejects a cross-origin POST before touching session or data", async () => {
    const req = new Request(`${WEBAPP_URL}/api/availability/calendar`, {
      method: "POST",
      headers: { origin: evilOrigin, "content-type": "text/plain" },
      body: requestBody,
    });
    const response = await POST(req, { params: Promise.resolve({}) });
    expect(response.status).toBe(403);
  });

  it("rejects a cross-origin DELETE before touching session or data", async () => {
    const req = new Request(
      `${WEBAPP_URL}/api/availability/calendar?integration=cal_google&externalId=id`,
      {
        method: "DELETE",
        headers: { origin: evilOrigin },
      }
    );
    const response = await DELETE(req, { params: Promise.resolve({}) });
    expect(response.status).toBe(403);
  });
});
