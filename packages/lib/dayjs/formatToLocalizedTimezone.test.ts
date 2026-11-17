import dayjs from "@calcom/dayjs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { formatToLocalizedTimezone } from "./index";

beforeAll(() => {
  vi.setSystemTime(dayjs.utc("2024-06-15T12:00:00Z").toDate());
});

describe("formatToLocalizedTimezone", () => {
  it("returns a localized timezone string for a Date object with explicit timezone", () => {
    const date = new Date("2024-06-15T12:00:00Z");
    const result = formatToLocalizedTimezone(date, "en", "America/New_York");
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
    // Should contain recognizable timezone name like "Eastern Daylight Time"
    expect(result!.length).toBeGreaterThan(0);
  });

  it("returns a localized timezone string for a Dayjs object with explicit timezone", () => {
    const date = dayjs.utc("2024-06-15T12:00:00Z");
    const result = formatToLocalizedTimezone(date, "en", "America/New_York");
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
    expect(result!.length).toBeGreaterThan(0);
  });

  it("returns consistent results for Date and Dayjs objects with same timezone", () => {
    const jsDate = new Date("2024-06-15T12:00:00Z");
    const djsDate = dayjs.utc("2024-06-15T12:00:00Z");
    const resultDate = formatToLocalizedTimezone(jsDate, "en", "America/New_York");
    const resultDayjs = formatToLocalizedTimezone(djsDate, "en", "America/New_York");
    expect(resultDate).toBe(resultDayjs);
  });

  it("returns different results for different timezones", () => {
    const date = new Date("2024-06-15T12:00:00Z");
    const nyResult = formatToLocalizedTimezone(date, "en", "America/New_York");
    const tokyoResult = formatToLocalizedTimezone(date, "en", "Asia/Tokyo");
    expect(nyResult).not.toBe(tokyoResult);
  });

  it("returns a short timezone name when timeZoneName is 'short'", () => {
    const date = new Date("2024-06-15T12:00:00Z");
    const longResult = formatToLocalizedTimezone(date, "en", "America/New_York", "long");
    const shortResult = formatToLocalizedTimezone(date, "en", "America/New_York", "short");
    expect(shortResult).toBeDefined();
    expect(longResult).toBeDefined();
    // Short name should be shorter than or equal to long name
    expect(shortResult!.length).toBeLessThanOrEqual(longResult!.length);
  });

  it("defaults to long timezone name when timeZoneName is not provided", () => {
    const date = new Date("2024-06-15T12:00:00Z");
    const defaultResult = formatToLocalizedTimezone(date, "en", "America/New_York");
    const longResult = formatToLocalizedTimezone(date, "en", "America/New_York", "long");
    expect(defaultResult).toBe(longResult);
  });

  it("works with undefined locale (falls back to environment default)", () => {
    const date = new Date("2024-06-15T12:00:00Z");
    const result = formatToLocalizedTimezone(date, undefined, "America/New_York");
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
    expect(result!.length).toBeGreaterThan(0);
  });

  it("handles UTC timezone", () => {
    const date = new Date("2024-06-15T12:00:00Z");
    const result = formatToLocalizedTimezone(date, "en", "UTC");
    expect(result).toBeDefined();
    expect(result).toContain("Coordinated Universal Time");
  });

  it("handles Europe/London timezone", () => {
    const date = new Date("2024-06-15T12:00:00Z");
    const result = formatToLocalizedTimezone(date, "en", "Europe/London");
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
    expect(result!.length).toBeGreaterThan(0);
  });

  it("handles Pacific/Auckland timezone", () => {
    const date = new Date("2024-06-15T12:00:00Z");
    const result = formatToLocalizedTimezone(date, "en", "Pacific/Auckland");
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
    expect(result!.length).toBeGreaterThan(0);
  });
});
