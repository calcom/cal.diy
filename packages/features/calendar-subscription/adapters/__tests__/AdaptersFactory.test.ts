import { beforeEach, describe, expect, test } from "vitest";
import { DefaultAdapterFactory } from "../AdaptersFactory";
import { GoogleCalendarSubscriptionAdapter } from "../GoogleCalendarSubscription.adapter";
import { Office365CalendarSubscriptionAdapter } from "../Office365CalendarSubscription.adapter";

describe("DefaultAdapterFactory", () => {
  let factory: DefaultAdapterFactory;

  beforeEach(() => {
    factory = new DefaultAdapterFactory();
  });

  describe("get", () => {
    test("should return GoogleCalendarSubscriptionAdapter for google_calendar", () => {
      const adapter = factory.get("google_calendar");

      expect(adapter).toBeInstanceOf(GoogleCalendarSubscriptionAdapter);
    });

    test("should return Office365CalendarSubscriptionAdapter for office365_calendar", () => {
      const adapter = factory.get("office365_calendar");

      expect(adapter).toBeInstanceOf(Office365CalendarSubscriptionAdapter);
    });

    test("should return the same instance for multiple calls (singleton)", () => {
      const adapter1 = factory.get("google_calendar");
      const adapter2 = factory.get("google_calendar");

      expect(adapter1).toBe(adapter2);
    });

    test("should throw error for unsupported provider", () => {
      expect(() => {
        factory.get("unsupported_calendar" as never);
      }).toThrow("No adapter found for provider unsupported_calendar");
    });
  });

  describe("getProviders", () => {
    test("should return all available providers", () => {
      const providers = factory.getProviders();

      expect(providers).toEqual(["google_calendar"]);
    });

    test("should return array with correct length", () => {
      const providers = factory.getProviders();

      expect(providers).toHaveLength(1);
    });
  });
});
