import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the webstorage module
vi.mock("@calcom/lib/webstorage", () => {
  const store = new Map<string, string>();
  return {
    localStorage: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
      removeItem: vi.fn((key: string) => { store.delete(key); }),
      clear: vi.fn(() => { store.clear(); }),
    },
  };
});

import { isBrowserLocale24h, getIs24hClockFromLocalStorage, setIs24hClockInLocalStorage } from "./timeFormat";
import { localStorage } from "@calcom/lib/webstorage";

describe("timeFormat utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("isBrowserLocale24h", () => {
    it("should return cached value from localStorage when set to true", () => {
      setIs24hClockInLocalStorage(true);
      expect(isBrowserLocale24h()).toBe(true);
    });

    it("should return cached value from localStorage when set to false", () => {
      setIs24hClockInLocalStorage(false);
      expect(isBrowserLocale24h()).toBe(false);
    });

    it("should detect 12-hour locale (en-US) correctly", () => {
      const originalDateTimeFormat = global.Intl.DateTimeFormat;
      global.Intl.DateTimeFormat = class MockDateTimeFormat {
        constructor(_locale: any, _options: any) {}
        resolvedOptions() { return { locale: "en-US", hour12: true }; }
        format() { return "12 AM"; }
      } as any;

      localStorage.clear();
      expect(isBrowserLocale24h()).toBe(false);

      global.Intl.DateTimeFormat = originalDateTimeFormat;
    });

    it("should detect 24-hour locale (de-DE) correctly", () => {
      const originalDateTimeFormat = global.Intl.DateTimeFormat;
      global.Intl.DateTimeFormat = class MockDateTimeFormat {
        constructor(_locale: any, _options: any) {}
        resolvedOptions() { return { locale: "de-DE", hour12: false }; }
        format() { return "00:00"; }
      } as any;

      localStorage.clear();
      expect(isBrowserLocale24h()).toBe(true);

      global.Intl.DateTimeFormat = originalDateTimeFormat;
    });

    it("should detect Arabic locale (ar-EG) as 12-hour despite non-Latin AM/PM", () => {
      const originalDateTimeFormat = global.Intl.DateTimeFormat;
      global.Intl.DateTimeFormat = class MockDateTimeFormat {
        constructor(_locale: any, _options: any) {}
        resolvedOptions() { return { locale: "ar-EG", hour12: true }; }
        format() { return "١٢ ص"; } // Arabic AM marker, no Latin "M"
      } as any;

      localStorage.clear();
      expect(isBrowserLocale24h()).toBe(false); // Should be 12-hour, not 24-hour

      global.Intl.DateTimeFormat = originalDateTimeFormat;
    });

    it("should detect Greek locale (el-GR) as 12-hour despite non-Latin AM/PM", () => {
      const originalDateTimeFormat = global.Intl.DateTimeFormat;
      global.Intl.DateTimeFormat = class MockDateTimeFormat {
        constructor(_locale: any, _options: any) {}
        resolvedOptions() { return { locale: "el-GR", hour12: true }; }
        format() { return "12 π.μ."; } // Greek AM marker, no Latin "M"
      } as any;

      localStorage.clear();
      expect(isBrowserLocale24h()).toBe(false);

      global.Intl.DateTimeFormat = originalDateTimeFormat;
    });

    it("should detect Chinese Traditional (zh-TW) as 12-hour despite non-Latin AM/PM", () => {
      const originalDateTimeFormat = global.Intl.DateTimeFormat;
      global.Intl.DateTimeFormat = class MockDateTimeFormat {
        constructor(_locale: any, _options: any) {}
        resolvedOptions() { return { locale: "zh-TW", hour12: true }; }
        format() { return "上午12"; } // Chinese AM marker, no Latin "M"
      } as any;

      localStorage.clear();
      expect(isBrowserLocale24h()).toBe(false);

      global.Intl.DateTimeFormat = originalDateTimeFormat;
    });
  });

  describe("localStorage helpers", () => {
    it("should store and retrieve 24h preference", () => {
      setIs24hClockInLocalStorage(true);
      expect(getIs24hClockFromLocalStorage()).toBe(true);

      setIs24hClockInLocalStorage(false);
      expect(getIs24hClockFromLocalStorage()).toBe(false);
    });

    it("should return null when not set", () => {
      localStorage.clear();
      expect(getIs24hClockFromLocalStorage()).toBeNull();
    });
  });
});