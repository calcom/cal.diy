import { describe, expect, it } from "vitest";
import { formatDateFieldValue, parseDateFieldBound, parseDateFieldValue } from "./dateField";

const day = (year: number, month: number, date: number) => new Date(year, month - 1, date);

describe("parseDateFieldValue", () => {
  it("parses a stored yyyy-MM-dd value as a local day", () => {
    expect(parseDateFieldValue("2026-11-08")).toEqual(day(2026, 11, 8));
  });

  it("rejects empty, malformed and overflowing values", () => {
    expect(parseDateFieldValue("")).toBeNull();
    expect(parseDateFieldValue(undefined)).toBeNull();
    expect(parseDateFieldValue("not a date")).toBeNull();
    expect(parseDateFieldValue("2026-02-31")).toBeNull();
  });

  it("rejects every non-ISO format, even those Date() would accept", () => {
    expect(parseDateFieldValue("150380")).toBeNull();
    expect(parseDateFieldValue("15031980")).toBeNull();
    expect(parseDateFieldValue("15/03/1980")).toBeNull();
    expect(parseDateFieldValue("03/15/1980")).toBeNull();
    expect(parseDateFieldValue("1980-03-15T00:00:00Z")).toBeNull();
  });

  it("accepts an ISO date surrounded by spaces", () => {
    expect(parseDateFieldValue(" 1980-03-15 ")).toEqual(day(1980, 3, 15));
  });
});

describe("parseDateFieldBound", () => {
  const now = new Date(2026, 10, 8, 15, 30);

  it("resolves today and relative offsets in days", () => {
    expect(parseDateFieldBound("today", now)).toEqual(day(2026, 11, 8));
    expect(parseDateFieldBound("today+7d", now)).toEqual(day(2026, 11, 15));
    expect(parseDateFieldBound("today-30d", now)).toEqual(day(2026, 10, 9));
  });

  it("accepts an ISO date and ignores empty or invalid bounds", () => {
    expect(parseDateFieldBound("2026-12-31", now)).toEqual(day(2026, 12, 31));
    expect(parseDateFieldBound("", now)).toBeNull();
    expect(parseDateFieldBound("tomorrow", now)).toBeNull();
  });
});

describe("formatDateFieldValue", () => {
  it("formats a local day as yyyy-MM-dd", () => {
    expect(formatDateFieldValue(day(2026, 1, 5))).toBe("2026-01-05");
  });
});
