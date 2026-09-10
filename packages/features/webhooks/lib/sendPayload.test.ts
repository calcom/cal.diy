import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { WebhookVersion } from "./interface/IWebhookRepository";
import sendPayload from "./sendPayload";

describe("sendPayload", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  describe("X-Cal-Webhook-Version header", () => {
    it("should include X-Cal-Webhook-Version header with the webhook version", async () => {
      const webhook = {
        subscriberUrl: "https://example.com/webhook",
        appId: null,
        payloadTemplate: null,
        version: WebhookVersion.V_2021_10_20,
      };

      await sendPayload("test-secret", "BOOKING_CREATED", new Date().toISOString(), webhook, {
        title: "Test Booking",
        startTime: "2024-01-01T10:00:00Z",
        endTime: "2024-01-01T11:00:00Z",
        organizer: {
          email: "organizer@example.com",
          name: "Organizer",
          timeZone: "UTC",
          language: { locale: "en" },
        },
        attendees: [],
        type: "test-event",
        description: "",
      } as unknown as Parameters<typeof sendPayload>[4]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe("https://example.com/webhook");
      expect(options.headers).toHaveProperty("X-Cal-Webhook-Version", "2021-10-20");
    });

    it("should include X-Cal-Signature-256 header alongside version header", async () => {
      const webhook = {
        subscriberUrl: "https://example.com/webhook",
        appId: null,
        payloadTemplate: null,
        version: WebhookVersion.V_2021_10_20,
      };

      await sendPayload("test-secret", "BOOKING_CREATED", new Date().toISOString(), webhook, {
        title: "Test Booking",
        startTime: "2024-01-01T10:00:00Z",
        endTime: "2024-01-01T11:00:00Z",
        organizer: {
          email: "organizer@example.com",
          name: "Organizer",
          timeZone: "UTC",
          language: { locale: "en" },
        },
        attendees: [],
        type: "test-event",
        description: "",
      } as unknown as Parameters<typeof sendPayload>[4]);

      const [, options] = mockFetch.mock.calls[0];

      expect(options.headers).toHaveProperty("X-Cal-Signature-256");
      expect(options.headers).toHaveProperty("X-Cal-Webhook-Version");
      expect(options.headers).toHaveProperty("Content-Type", "application/json");
    });

    it("should send correct version for different webhook versions", async () => {
      // Test with the current version
      const webhook = {
        subscriberUrl: "https://example.com/webhook",
        appId: null,
        payloadTemplate: null,
        version: WebhookVersion.V_2021_10_20,
      };

      await sendPayload("test-secret", "BOOKING_CREATED", new Date().toISOString(), webhook, {
        title: "Test",
        startTime: "2024-01-01T10:00:00Z",
        endTime: "2024-01-01T11:00:00Z",
        organizer: {
          email: "test@example.com",
          name: "Test",
          timeZone: "UTC",
          language: { locale: "en" },
        },
        attendees: [],
        type: "test",
        description: "",
      } as unknown as Parameters<typeof sendPayload>[4]);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["X-Cal-Webhook-Version"]).toBe("2021-10-20");
    });
  });

  describe("videoCallData public URL rewriting", () => {  
  it("should rewrite daily_video videoCallData.url to the public Cal.com video link", async () => {  
    const webhook = {  
      subscriberUrl: "https://example.com/webhook",  
      appId: null,  
      payloadTemplate: null,  
      version: WebhookVersion.V_2021_10_20,  
    };  
  
    await sendPayload("test-secret", "BOOKING_CREATED", new Date().toISOString(), webhook, {  
      uid: "abc123",  
      title: "Test Booking",  
      startTime: "2024-01-01T10:00:00Z",  
      endTime: "2024-01-01T11:00:00Z",  
      organizer: {  
        email: "organizer@example.com",  
        name: "Organizer",  
        timeZone: "UTC",  
        language: { locale: "en" },  
      },  
      attendees: [],  
      type: "test-event",  
      description: "",  
      videoCallData: {  
        type: "daily_video",  
        id: "abc123",  
        password: "mock-token",  
        url: "https://meetco.daily.co/abc123",  
      },  
    } as unknown as Parameters<typeof sendPayload>[4]);  
  
    expect(mockFetch).toHaveBeenCalledTimes(1);  
    const [, options] = mockFetch.mock.calls[0];  
    const body = JSON.parse(options.body);  
  
    expect(body.payload.videoCallData.url).not.toContain("daily.co");  
    expect(body.payload.videoCallData.url).toMatch(/\/video\/abc123$/);  
    expect(body.payload.videoCallData.type).toBe("daily_video");  
    expect(body.payload.videoCallData.id).toBe("abc123");  
    expect(body.payload.videoCallData.password).toBe("mock-token");  
  });  
  
  it("should NOT rewrite non daily videoCallData.url", async () => {  
    const webhook = {  
      subscriberUrl: "https://example.com/webhook",  
      appId: null,  
      payloadTemplate: null,  
      version: WebhookVersion.V_2021_10_20,  
    };  
  
    const zoomUrl = "https://zoom.us/j/123456789";  
  
    await sendPayload("test-secret", "BOOKING_CREATED", new Date().toISOString(), webhook, {  
      uid: "zoom-uid",  
      title: "Test Booking",  
      startTime: "2024-01-01T10:00:00Z",  
      endTime: "2024-01-01T11:00:00Z",  
      organizer: {  
        email: "organizer@example.com",  
        name: "Organizer",  
        timeZone: "UTC",  
        language: { locale: "en" },  
      },  
      attendees: [],  
      type: "test-event",  
      description: "",  
      videoCallData: {  
        type: "zoom_video",  
        id: "123456789",  
        password: "zoom-pass",  
        url: zoomUrl,  
      },  
    } as unknown as Parameters<typeof sendPayload>[4]);  
  
    const [, options] = mockFetch.mock.calls[0];  
    const body = JSON.parse(options.body);  
  
    expect(body.payload.videoCallData.url).toBe(zoomUrl);  
  });  
  
  it("should leave payload untouched when videoCallData is absent", async () => {  
    const webhook = {  
      subscriberUrl: "https://example.com/webhook",  
      appId: null,  
      payloadTemplate: null,  
      version: WebhookVersion.V_2021_10_20,  
    };  
  
    await sendPayload("test-secret", "BOOKING_CREATED", new Date().toISOString(), webhook, {  
      uid: "no-video-uid",  
      title: "Test Booking",  
      startTime: "2024-01-01T10:00:00Z",  
      endTime: "2024-01-01T11:00:00Z",  
      organizer: {  
        email: "organizer@example.com",  
        name: "Organizer",  
        timeZone: "UTC",  
        language: { locale: "en" },  
      },  
      attendees: [],  
      type: "test-event",  
      description: "",  
    } as unknown as Parameters<typeof sendPayload>[4]);  
  
    const [, options] = mockFetch.mock.calls[0];  
    const body = JSON.parse(options.body);  
  
    expect(body.payload.videoCallData).toBeUndefined();  
  });  
  
  it("should not throw and not rewrite when getVideoCallUrlFromCalEvent returns the same URL already", async () => {  
    const webhook = {  
      subscriberUrl: "https://example.com/webhook",  
      appId: null,  
      payloadTemplate: null,  
      version: WebhookVersion.V_2021_10_20,  
    };  
  
    const alreadyPublicUrl = `${process.env.NEXT_PUBLIC_WEBAPP_URL ?? "http://localhost:3000"}/video/already-public-uid`;  
  
    await sendPayload("test-secret", "BOOKING_CREATED", new Date().toISOString(), webhook, {  
      uid: "already-public-uid",  
      title: "Test Booking",  
      startTime: "2024-01-01T10:00:00Z",  
      endTime: "2024-01-01T11:00:00Z",  
      organizer: {  
        email: "organizer@example.com",  
        name: "Organizer",  
        timeZone: "UTC",  
        language: { locale: "en" },  
      },  
      attendees: [],  
      type: "test-event",  
      description: "",  
      videoCallData: {  
        type: "daily_video",  
        id: "already-public-uid",  
        password: "mock-token",  
        url: alreadyPublicUrl,  
      },  
    } as unknown as Parameters<typeof sendPayload>[4]);  
  
    const [, options] = mockFetch.mock.calls[0];  
    const body = JSON.parse(options.body);  
  
    expect(body.payload.videoCallData.url).toBe(alreadyPublicUrl);  
  });  
});
});