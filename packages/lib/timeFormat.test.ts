import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { localStorage } from "@calcom/lib/webstorage";
import { isBrowserLocale24h } from "./timeFormat";

describe("isBrowserLocale24h", () => {
  const storageKey = "timeOption.is24hClock";

  beforeEach(() => {
    localStorage.removeItem(storageKey);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.removeItem(storageKey);
    vi.restoreAllMocks();
  });

  // Test A: 12-hour detection
  it("detects a 12-hour clock from Intl resolved options", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      hour12: true,
    } as Intl.ResolvedDateTimeFormatOptions);

    expect(isBrowserLocale24h()).toBe(false);
    expect(localStorage.getItem(storageKey)).toBe("false");
  });

  // Test B: 24-hour detection
  it("detects a 24-hour clock from Intl resolved options", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      hour12: false,
    } as Intl.ResolvedDateTimeFormatOptions);

    expect(isBrowserLocale24h()).toBe(true);
    expect(localStorage.getItem(storageKey)).toBe("true");
  });

  // Test C: Cached preference
  it("uses a previously stored preference without detecting the locale", () => {
    localStorage.setItem(storageKey, "false");

    const resolvedOptionsSpy = vi.spyOn(
      Intl.DateTimeFormat.prototype,
      "resolvedOptions"
    );

    expect(isBrowserLocale24h()).toBe(false);
    expect(resolvedOptionsSpy.mock.calls).toHaveLength(0);
  });

  it("returns cached true preference without detecting the locale", () => {
    localStorage.setItem(storageKey, "true");

    const resolvedOptionsSpy = vi.spyOn(
      Intl.DateTimeFormat.prototype,
      "resolvedOptions"
    );

    expect(isBrowserLocale24h()).toBe(true);
    expect(resolvedOptionsSpy.mock.calls).toHaveLength(0);
  });

  // Test D: Locale-independent detection
  it("does not depend on formatted output text or the presence of the letter 'M'", () => {
    // In locales like Traditional Chinese (zh-TW '上午12'), Greek (el '12 π.μ.'), or Arabic (ar '12 ص'),
    // formatted output does not contain the Latin letter 'M'.
    // The previous implementation matched /M/i on .format(0), which caused false 24h detection.
    const formatSpy = vi.fn().mockReturnValue("上午12時");
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function () {
      return {
        resolvedOptions: () =>
          ({ hour12: true } as unknown as Intl.ResolvedDateTimeFormatOptions),
        format: formatSpy,
      } as unknown as Intl.DateTimeFormat;
    } as unknown as typeof Intl.DateTimeFormat);

    expect(isBrowserLocale24h()).toBe(false);
    expect(localStorage.getItem(storageKey)).toBe("false");
    // format() is not invoked because resolvedOptions().hour12 is the source of truth
    expect(formatSpy).not.toHaveBeenCalled();
  });

  it("reliably detects 24h even if formatted string happens to contain the letter 'M'", () => {
    const formatSpy = vi.fn().mockReturnValue("00:00 Madrid");
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function () {
      return {
        resolvedOptions: () =>
          ({ hour12: false } as unknown as Intl.ResolvedDateTimeFormatOptions),
        format: formatSpy,
      } as unknown as Intl.DateTimeFormat;
    } as unknown as typeof Intl.DateTimeFormat);

    expect(isBrowserLocale24h()).toBe(true);
    expect(localStorage.getItem(storageKey)).toBe("true");
    expect(formatSpy).not.toHaveBeenCalled();
  });

  it("safely falls back to 12-hour clock (false) when hour12 is undefined", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue(
      {} as unknown as Intl.ResolvedDateTimeFormatOptions
    );

    // Must not treat undefined as 24-hour preference
    expect(isBrowserLocale24h()).toBe(false);
    expect(localStorage.getItem(storageKey)).toBe("false");
  });

  // Test E: Test isolation
  it("maintains test isolation and cleans up localStorage and mocks", () => {
    expect(localStorage.getItem(storageKey)).toBeNull();
  });
});
