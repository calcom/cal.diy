import { afterEach, describe, expect, it, vi } from "vitest";
import { isBrowserLocale24h, setIs24hClockInLocalStorage } from "./timeFormat";

describe("isBrowserLocale24h", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("should return false for 12-hour locales with Latin AM/PM (en-US)", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function () {
      return {
        resolvedOptions: () => ({ hour12: true }),
        format: () => "9 AM",
      } as unknown as Intl.DateTimeFormat;
    } as unknown as typeof Intl.DateTimeFormat);

    expect(isBrowserLocale24h()).toBe(false);
  });

  it("should return false for 12-hour locales without Latin AM/PM (ar-EG)", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function () {
      return {
        resolvedOptions: () => ({ hour12: true }),
        format: () => "٩ ص",
      } as unknown as Intl.DateTimeFormat;
    } as unknown as typeof Intl.DateTimeFormat);

    expect(isBrowserLocale24h()).toBe(false);
  });

  it("should return true for 24-hour locales (en-GB)", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function () {
      return {
        resolvedOptions: () => ({ hour12: false }),
        format: () => "09:00",
      } as unknown as Intl.DateTimeFormat;
    } as unknown as typeof Intl.DateTimeFormat);

    expect(isBrowserLocale24h()).toBe(true);
  });

  it("should return early if local storage has preference", () => {
    setIs24hClockInLocalStorage(true);
    expect(isBrowserLocale24h()).toBe(true);

    setIs24hClockInLocalStorage(false);
    expect(isBrowserLocale24h()).toBe(false);
  });
});
