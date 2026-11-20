import { CalendarSubscriptionService } from "@calcom/features/calendar-subscription/lib/CalendarSubscriptionService";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/server", () => ({
  NextRequest: class MockNextRequest {
    url: string;
    method: string;
    nextUrl: { searchParams: URLSearchParams };
    private _headers: Map<string, string>;

    constructor(url: string, options: { method?: string } = {}) {
      this.url = url;
      this.method = options.method || "POST";
      this._headers = new Map();
      this.nextUrl = { searchParams: new URLSearchParams(url.split("?")[1] || "") };
    }

    headers = {
      get: (key: string): string | null => this._headers.get(key.toLowerCase()) || null,
      set: (key: string, value: string): void => {
        this._headers.set(key.toLowerCase(), value);
      },
      has: (key: string): boolean => this._headers.has(key.toLowerCase()),
    };
  },
  NextResponse: {
    json: vi.fn((body, init) => ({
      json: vi.fn().mockResolvedValue(body),
      status: init?.status || 200,
    })),
  },
}));

vi.mock("@calcom/features/calendar-subscription/lib/CalendarSubscriptionService");
vi.mock("@calcom/features/calendar-subscription/lib/cache/CalendarCacheEventService", () => ({
  CalendarCacheEventService: vi.fn(function CalendarCacheEventService() {}),
}));
vi.mock("@calcom/features/calendar-subscription/lib/sync/CalendarSyncService", () => ({
  CalendarSyncService: vi.fn(function CalendarSyncService() {}),
}));
vi.mock("@calcom/prisma", () => ({
  prisma: {},
}));

const mockCalendarSubscriptionService = vi.mocked(CalendarSubscriptionService);

describe("/api/webhooks/calendar-subscription/[provider]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe("Provider validation", () => {
    test("should accept google_calendar provider", async () => {
      const request = new NextRequest("http://localhost/api/webhooks/calendar-subscription/google_calendar", {
        method: "POST",
      });

      const mockIsCacheEnabled = vi.fn().mockResolvedValue(true);
      const mockIsSyncEnabled = vi.fn().mockResolvedValue(false);
      const mockProcessWebhook = vi.fn().mockResolvedValue(undefined);

      mockCalendarSubscriptionService.prototype.isCacheEnabled = mockIsCacheEnabled;
      mockCalendarSubscriptionService.prototype.isSyncEnabled = mockIsSyncEnabled;
      mockCalendarSubscriptionService.prototype.processWebhook = mockProcessWebhook;

      const { POST } = await import("../route");
      const response = await POST(request, {
        params: Promise.resolve({ provider: "google_calendar" }),
      });

      expect(response.status).toBe(200);
      expect(mockProcessWebhook).toHaveBeenCalledWith("google_calendar", request);
    }, 10000);

    test("should accept office365_calendar provider", async () => {
      const request = new NextRequest(
        "http://localhost/api/webhooks/calendar-subscription/office365_calendar",
        {
          method: "POST",
        }
      );

      const mockIsCacheEnabled = vi.fn().mockResolvedValue(true);
      const mockIsSyncEnabled = vi.fn().mockResolvedValue(false);
      const mockProcessWebhook = vi.fn().mockResolvedValue(undefined);

      mockCalendarSubscriptionService.prototype.isCacheEnabled = mockIsCacheEnabled;
      mockCalendarSubscriptionService.prototype.isSyncEnabled = mockIsSyncEnabled;
      mockCalendarSubscriptionService.prototype.processWebhook = mockProcessWebhook;

      const { POST } = await import("../route");
      const response = await POST(request, {
        params: Promise.resolve({ provider: "office365_calendar" }),
      });

      expect(response.status).toBe(200);
      expect(mockProcessWebhook).toHaveBeenCalledWith("office365_calendar", request);
    });

    test("should respond to office365 validationToken requests as plain text", async () => {
      const request = new NextRequest(
        "http://localhost/api/webhooks/calendar-subscription/office365_calendar?validationToken=Validation%3A%20Testing",
        {
          method: "POST",
        }
      );
      const mockProcessWebhook = vi.fn();

      mockCalendarSubscriptionService.prototype.processWebhook = mockProcessWebhook;

      const { POST } = await import("../route");
      const response = await POST(request, {
        params: Promise.resolve({ provider: "office365_calendar" }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/plain");
      await expect(response.text()).resolves.toBe("Validation: Testing");
      expect(mockCalendarSubscriptionService).not.toHaveBeenCalled();
      expect(mockProcessWebhook).not.toHaveBeenCalled();
    });

    test("should reject unsupported provider", async () => {
      const request = new NextRequest(
        "http://localhost/api/webhooks/calendar-subscription/unsupported_calendar",
        {
          method: "POST",
        }
      );

      const { POST } = await import("../route");
      const response = await POST(request, {
        params: Promise.resolve({ provider: "unsupported_calendar" }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.message).toBe("Unsupported provider");
    });
  });

  describe("Feature flag handling", () => {
    test("should return 200 when neither cache nor sync is enabled", async () => {
      const request = new NextRequest("http://localhost/api/webhooks/calendar-subscription/google_calendar", {
        method: "POST",
      });

      const mockIsCacheEnabled = vi.fn().mockResolvedValue(false);
      const mockIsSyncEnabled = vi.fn().mockResolvedValue(false);
      const mockProcessWebhook = vi.fn();

      mockCalendarSubscriptionService.prototype.isCacheEnabled = mockIsCacheEnabled;
      mockCalendarSubscriptionService.prototype.isSyncEnabled = mockIsSyncEnabled;
      mockCalendarSubscriptionService.prototype.processWebhook = mockProcessWebhook;

      const { POST } = await import("../route");
      const response = await POST(request, {
        params: Promise.resolve({ provider: "google_calendar" }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.message).toBe("No cache or sync enabled");
      expect(mockProcessWebhook).not.toHaveBeenCalled();
    });

    test("should process webhook when cache is enabled", async () => {
      const request = new NextRequest("http://localhost/api/webhooks/calendar-subscription/google_calendar", {
        method: "POST",
      });

      const mockIsCacheEnabled = vi.fn().mockResolvedValue(true);
      const mockIsSyncEnabled = vi.fn().mockResolvedValue(false);
      const mockProcessWebhook = vi.fn().mockResolvedValue(undefined);

      mockCalendarSubscriptionService.prototype.isCacheEnabled = mockIsCacheEnabled;
      mockCalendarSubscriptionService.prototype.isSyncEnabled = mockIsSyncEnabled;
      mockCalendarSubscriptionService.prototype.processWebhook = mockProcessWebhook;

      const { POST } = await import("../route");
      const response = await POST(request, {
        params: Promise.resolve({ provider: "google_calendar" }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.message).toBe("Webhook processed");
      expect(mockProcessWebhook).toHaveBeenCalledWith("google_calendar", request);
    });

    test("should process webhook when sync is enabled", async () => {
      const request = new NextRequest("http://localhost/api/webhooks/calendar-subscription/google_calendar", {
        method: "POST",
      });

      const mockIsCacheEnabled = vi.fn().mockResolvedValue(false);
      const mockIsSyncEnabled = vi.fn().mockResolvedValue(true);
      const mockProcessWebhook = vi.fn().mockResolvedValue(undefined);

      mockCalendarSubscriptionService.prototype.isCacheEnabled = mockIsCacheEnabled;
      mockCalendarSubscriptionService.prototype.isSyncEnabled = mockIsSyncEnabled;
      mockCalendarSubscriptionService.prototype.processWebhook = mockProcessWebhook;

      const { POST } = await import("../route");
      const response = await POST(request, {
        params: Promise.resolve({ provider: "google_calendar" }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.message).toBe("Webhook processed");
      expect(mockProcessWebhook).toHaveBeenCalledWith("google_calendar", request);
    });

    test("should process webhook when both cache and sync are enabled", async () => {
      const request = new NextRequest("http://localhost/api/webhooks/calendar-subscription/google_calendar", {
        method: "POST",
      });

      const mockIsCacheEnabled = vi.fn().mockResolvedValue(true);
      const mockIsSyncEnabled = vi.fn().mockResolvedValue(true);
      const mockProcessWebhook = vi.fn().mockResolvedValue(undefined);

      mockCalendarSubscriptionService.prototype.isCacheEnabled = mockIsCacheEnabled;
      mockCalendarSubscriptionService.prototype.isSyncEnabled = mockIsSyncEnabled;
      mockCalendarSubscriptionService.prototype.processWebhook = mockProcessWebhook;

      const { POST } = await import("../route");
      const response = await POST(request, {
        params: Promise.resolve({ provider: "google_calendar" }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.message).toBe("Webhook processed");
      expect(mockProcessWebhook).toHaveBeenCalledWith("google_calendar", request);
    });
  });

  describe("Error handling", () => {
    test("should handle webhook processing errors gracefully", async () => {
      const request = new NextRequest("http://localhost/api/webhooks/calendar-subscription/google_calendar", {
        method: "POST",
      });

      const mockError = new Error("Webhook validation failed");
      const mockIsCacheEnabled = vi.fn().mockResolvedValue(true);
      const mockIsSyncEnabled = vi.fn().mockResolvedValue(false);
      const mockProcessWebhook = vi.fn().mockRejectedValue(mockError);

      mockCalendarSubscriptionService.prototype.isCacheEnabled = mockIsCacheEnabled;
      mockCalendarSubscriptionService.prototype.isSyncEnabled = mockIsSyncEnabled;
      mockCalendarSubscriptionService.prototype.processWebhook = mockProcessWebhook;

      const { POST } = await import("../route");
      const response = await POST(request, {
        params: Promise.resolve({ provider: "google_calendar" }),
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.message).toBe("Webhook validation failed");
    });

    test("should handle non-Error exceptions", async () => {
      const request = new NextRequest("http://localhost/api/webhooks/calendar-subscription/google_calendar", {
        method: "POST",
      });

      const mockIsCacheEnabled = vi.fn().mockResolvedValue(true);
      const mockIsSyncEnabled = vi.fn().mockResolvedValue(false);
      const mockProcessWebhook = vi.fn().mockRejectedValue("String error");

      mockCalendarSubscriptionService.prototype.isCacheEnabled = mockIsCacheEnabled;
      mockCalendarSubscriptionService.prototype.isSyncEnabled = mockIsSyncEnabled;
      mockCalendarSubscriptionService.prototype.processWebhook = mockProcessWebhook;

      const { POST } = await import("../route");
      const response = await POST(request, {
        params: Promise.resolve({ provider: "google_calendar" }),
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.message).toBe("Unknown error");
    });

    test("should handle feature flag check errors", async () => {
      const request = new NextRequest("http://localhost/api/webhooks/calendar-subscription/google_calendar", {
        method: "POST",
      });

      const mockError = new Error("Feature flag service unavailable");
      const mockIsCacheEnabled = vi.fn().mockRejectedValue(mockError);
      const mockIsSyncEnabled = vi.fn().mockResolvedValue(false);

      mockCalendarSubscriptionService.prototype.isCacheEnabled = mockIsCacheEnabled;
      mockCalendarSubscriptionService.prototype.isSyncEnabled = mockIsSyncEnabled;

      const { POST } = await import("../route");
      const response = await POST(request, {
        params: Promise.resolve({ provider: "google_calendar" }),
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.message).toBe("Feature flag service unavailable");
    });
  });

  describe("Service instantiation", () => {
    test("should instantiate all services with correct dependencies", async () => {
      const request = new NextRequest("http://localhost/api/webhooks/calendar-subscription/google_calendar", {
        method: "POST",
      });

      const mockIsCacheEnabled = vi.fn().mockResolvedValue(true);
      const mockIsSyncEnabled = vi.fn().mockResolvedValue(false);
      const mockProcessWebhook = vi.fn().mockResolvedValue(undefined);

      mockCalendarSubscriptionService.prototype.isCacheEnabled = mockIsCacheEnabled;
      mockCalendarSubscriptionService.prototype.isSyncEnabled = mockIsSyncEnabled;
      mockCalendarSubscriptionService.prototype.processWebhook = mockProcessWebhook;

      const { POST } = await import("../route");
      await POST(request, {
        params: Promise.resolve({ provider: "google_calendar" }),
      });

      expect(mockCalendarSubscriptionService).toHaveBeenCalledWith({
        adapterFactory: expect.any(Object),
        selectedCalendarRepository: expect.any(Object),
        featureRepository: expect.any(Object),
        teamFeatureRepository: expect.any(Object),
        userFeatureRepository: expect.any(Object),
        calendarSyncService: expect.any(Object),
        calendarCacheEventService: expect.any(Object),
      });
    });
  });
});
