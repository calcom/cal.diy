import { NextRequest } from "next/server";
import { describe, test, expect, vi, beforeEach } from "vitest";

import { CalendarSubscriptionService } from "@calcom/features/calendar-subscription/lib/CalendarSubscriptionService";

vi.mock("next/server", () => ({
  NextRequest: class MockNextRequest {
    url: string;
    method: string;
    nextUrl: { searchParams: URLSearchParams };
    private _headers: Map<string, string>;

    constructor(url: string, options: { method?: string } = {}) {
      this.url = url;
      this.method = options.method || "GET";
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
vi.mock("@calcom/features/calendar-subscription/lib/cache/CalendarCacheEventService");
vi.mock("@calcom/features/calendar-subscription/lib/sync/CalendarSyncService");
vi.mock("@calcom/prisma", () => ({
  prisma: {},
}));

const mockCalendarSubscriptionService = vi.mocked(CalendarSubscriptionService);

describe("/api/cron/calendar-subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv("CRON_API_KEY", "test-cron-key");
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
  });

  describe("Authentication", () => {
    test("should return 403 when no API key is provided", async () => {
      const request = new NextRequest("http://localhost/api/cron/calendar-subscriptions");

      const { GET } = await import("../route");
      const response = await GET(request, { params: Promise.resolve({}) });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.message).toBe("Forbidden");
    }, 10000);

    test("should return 403 when invalid API key is provided", async () => {
      const request = new NextRequest("http://localhost/api/cron/calendar-subscriptions");
      request.headers.set("authorization", "invalid-key");

      const { GET } = await import("../route");
      const response = await GET(request, { params: Promise.resolve({}) });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.message).toBe("Forbidden");
    });

    test("should return 403 when both CRON_API_KEY and CRON_SECRET are unset", async () => {
      vi.stubEnv("CRON_API_KEY", "");
      vi.stubEnv("CRON_SECRET", "");
      const request = new NextRequest("http://localhost/api/cron/calendar-subscriptions");
      request.headers.set("authorization", "Bearer undefined");

      const { GET } = await import("../route");
      const response = await GET(request, { params: Promise.resolve({}) });

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.message).toBe("Forbidden");
    });

    test("should accept valid API key", async () => {
      const request = new NextRequest("http://localhost/api/cron/calendar-subscriptions");
      request.headers.set("authorization", "test-cron-key");

      const mockIsCacheEnabled = vi.fn().mockResolvedValue(true);
      const mockIsSyncEnabled = vi.fn().mockResolvedValue(true);
      const mockCheckForNewSubscriptions = vi.fn().mockResolvedValue(undefined);

      mockCalendarSubscriptionService.prototype.isCacheEnabled = mockIsCacheEnabled;
      mockCalendarSubscriptionService.prototype.isSyncEnabled = mockIsSyncEnabled;
      mockCalendarSubscriptionService.prototype.checkForNewSubscriptions = mockCheckForNewSubscriptions;

      const { GET } = await import("../route");
      const response = await GET(request, { params: Promise.resolve({}) });

      expect(response.status).toBe(200);
    });
  });

  describe("Feature flag checks", () => {
    test("should return early when cache AND sync are disabled", async () => {
      const request = new NextRequest("http://localhost/api/cron/calendar-subscriptions");
      request.headers.set("authorization", "test-cron-key");

      const mockIsCacheEnabled = vi.fn().mockResolvedValue(false);
      const mockIsSyncEnabled = vi.fn().mockResolvedValue(false);
      const mockCheckForNewSubscriptions = vi.fn();

      mockCalendarSubscriptionService.prototype.isCacheEnabled = mockIsCacheEnabled;
      mockCalendarSubscriptionService.prototype.isSyncEnabled = mockIsSyncEnabled;
      mockCalendarSubscriptionService.prototype.checkForNewSubscriptions = mockCheckForNewSubscriptions;

      const { GET } = await import("../route");
      const response = await GET(request, { params: Promise.resolve({}) });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(mockCheckForNewSubscriptions).not.toHaveBeenCalled();
    });

    test("should proceed when both cache and sync are enabled", async () => {
      const request = new NextRequest("http://localhost/api/cron/calendar-subscriptions");
      request.headers.set("authorization", "test-cron-key");

      const mockIsCacheEnabled = vi.fn().mockResolvedValue(true);
      const mockIsSyncEnabled = vi.fn().mockResolvedValue(true);
      const mockCheckForNewSubscriptions = vi.fn().mockResolvedValue(undefined);

      mockCalendarSubscriptionService.prototype.isCacheEnabled = mockIsCacheEnabled;
      mockCalendarSubscriptionService.prototype.isSyncEnabled = mockIsSyncEnabled;
      mockCalendarSubscriptionService.prototype.checkForNewSubscriptions = mockCheckForNewSubscriptions;

      const { GET } = await import("../route");
      const response = await GET(request, { params: Promise.resolve({}) });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(mockCheckForNewSubscriptions).toHaveBeenCalledOnce();
    });
  });

  describe("Subscription checking functionality", () => {
    test("should successfully check for new subscriptions", async () => {
      const request = new NextRequest("http://localhost/api/cron/calendar-subscriptions");
      request.headers.set("authorization", "test-cron-key");

      const mockIsCacheEnabled = vi.fn().mockResolvedValue(true);
      const mockIsSyncEnabled = vi.fn().mockResolvedValue(true);
      const mockCheckForNewSubscriptions = vi.fn().mockResolvedValue(undefined);

      mockCalendarSubscriptionService.prototype.isCacheEnabled = mockIsCacheEnabled;
      mockCalendarSubscriptionService.prototype.isSyncEnabled = mockIsSyncEnabled;
      mockCalendarSubscriptionService.prototype.checkForNewSubscriptions = mockCheckForNewSubscriptions;

      const { GET } = await import("../route");
      const response = await GET(request, { params: Promise.resolve({}) });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(mockCheckForNewSubscriptions).toHaveBeenCalledOnce();
    });

    test("should handle subscription checking errors gracefully", async () => {
      const request = new NextRequest("http://localhost/api/cron/calendar-subscriptions");
      request.headers.set("authorization", "test-cron-key");

      const mockError = new Error("Subscription service unavailable");
      const mockIsCacheEnabled = vi.fn().mockResolvedValue(true);
      const mockIsSyncEnabled = vi.fn().mockResolvedValue(true);
      const mockCheckForNewSubscriptions = vi.fn().mockRejectedValue(mockError);

      mockCalendarSubscriptionService.prototype.isCacheEnabled = mockIsCacheEnabled;
      mockCalendarSubscriptionService.prototype.isSyncEnabled = mockIsSyncEnabled;
      mockCalendarSubscriptionService.prototype.checkForNewSubscriptions = mockCheckForNewSubscriptions;

      const { GET } = await import("../route");
      const response = await GET(request, { params: Promise.resolve({}) });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.message).toBe("Subscription service unavailable");
    });

    test("should handle non-Error exceptions", async () => {
      const request = new NextRequest("http://localhost/api/cron/calendar-subscriptions");
      request.headers.set("authorization", "test-cron-key");

      const mockIsCacheEnabled = vi.fn().mockResolvedValue(true);
      const mockIsSyncEnabled = vi.fn().mockResolvedValue(true);
      const mockCheckForNewSubscriptions = vi.fn().mockRejectedValue("String error");

      mockCalendarSubscriptionService.prototype.isCacheEnabled = mockIsCacheEnabled;
      mockCalendarSubscriptionService.prototype.isSyncEnabled = mockIsSyncEnabled;
      mockCalendarSubscriptionService.prototype.checkForNewSubscriptions = mockCheckForNewSubscriptions;

      const { GET } = await import("../route");
      const response = await GET(request, { params: Promise.resolve({}) });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.message).toBe("Unknown error");
    });
  });

  describe("Service instantiation", () => {
    test("should instantiate all services with correct dependencies", async () => {
      const request = new NextRequest("http://localhost/api/cron/calendar-subscriptions");
      request.headers.set("authorization", "test-cron-key");

      const mockIsCacheEnabled = vi.fn().mockResolvedValue(true);
      const mockIsSyncEnabled = vi.fn().mockResolvedValue(true);
      const mockCheckForNewSubscriptions = vi.fn().mockResolvedValue(undefined);

      mockCalendarSubscriptionService.prototype.isCacheEnabled = mockIsCacheEnabled;
      mockCalendarSubscriptionService.prototype.isSyncEnabled = mockIsSyncEnabled;
      mockCalendarSubscriptionService.prototype.checkForNewSubscriptions = mockCheckForNewSubscriptions;

      const { GET } = await import("../route");
      await GET(request, { params: Promise.resolve({}) });

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
