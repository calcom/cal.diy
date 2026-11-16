import { ErrorWithCode } from "@calcom/lib/errors";
import { describe, expect, it } from "vitest";
import { clampDateRange, isValidCalendarDate, slotRequestSchema } from "./slotRequestSchema";

const validRequest = {
  understood: true,
  dateFrom: "2026-10-13",
  dateTo: "2026-10-17",
  timeWindows: [{ from: "13:00", to: "17:00" }],
  weekdays: [2, 4],
  preference: "spread",
};

describe("isValidCalendarDate", () => {
  it.each(["2026-10-08", "2028-02-29", "2026-12-31"])("accepts %s", (value) => {
    expect(isValidCalendarDate(value)).toBe(true);
  });

  it.each([
    "2026-02-30",
    "2027-02-29",
    "2026-13-01",
    "2026-10-8",
    "2026/10/08",
    "tomorrow",
    "",
  ])("rejects %j", (value) => {
    expect(isValidCalendarDate(value)).toBe(false);
  });
});

describe("slotRequestSchema", () => {
  it("parses a fully specified request", () => {
    expect(slotRequestSchema.parse(validRequest)).toEqual(validRequest);
  });

  it("applies defaults for optional filters", () => {
    expect(
      slotRequestSchema.parse({ understood: true, dateFrom: "2026-10-13", dateTo: "2026-10-13" })
    ).toEqual({
      understood: true,
      dateFrom: "2026-10-13",
      dateTo: "2026-10-13",
      timeWindows: [],
      weekdays: [],
      preference: "earliest",
    });
  });

  it("parses a not-understood request and drops any other keys", () => {
    expect(slotRequestSchema.parse({ understood: false, dateFrom: "2026-10-13" })).toEqual({
      understood: false,
    });
  });

  it("strips unknown keys from an understood request", () => {
    const result = slotRequestSchema.parse({ ...validRequest, slots: ["2026-10-13T09:00:00Z"] });

    expect(result).not.toHaveProperty("slots");
  });

  it("accepts a time window that crosses midnight", () => {
    const result = slotRequestSchema.safeParse({
      ...validRequest,
      timeWindows: [{ from: "22:00", to: "01:00" }],
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["missing understood flag", { dateFrom: "2026-10-13", dateTo: "2026-10-13" }],
    ["understood without dates", { understood: true }],
    ["an invalid calendar date", { ...validRequest, dateFrom: "2026-02-30" }],
    ["a natural-language date", { ...validRequest, dateFrom: "next tuesday" }],
    ["dateFrom after dateTo", { ...validRequest, dateFrom: "2026-10-18" }],
    ["an out-of-range hour", { ...validRequest, timeWindows: [{ from: "24:00", to: "25:00" }] }],
    ["a single-digit hour", { ...validRequest, timeWindows: [{ from: "9:00", to: "12:00" }] }],
    ["an empty time window", { ...validRequest, timeWindows: [{ from: "09:00", to: "09:00" }] }],
    [
      "too many time windows",
      {
        ...validRequest,
        timeWindows: [
          { from: "08:00", to: "09:00" },
          { from: "10:00", to: "11:00" },
          { from: "12:00", to: "13:00" },
          { from: "14:00", to: "15:00" },
          { from: "16:00", to: "17:00" },
        ],
      },
    ],
    ["a weekday above 6", { ...validRequest, weekdays: [7] }],
    ["a negative weekday", { ...validRequest, weekdays: [-1] }],
    ["a fractional weekday", { ...validRequest, weekdays: [1.5] }],
    ["an unknown preference", { ...validRequest, preference: "cheapest" }],
  ])("rejects %s", (_, input) => {
    expect(slotRequestSchema.safeParse(input).success).toBe(false);
  });
});

describe("clampDateRange", () => {
  const today = "2026-10-08";

  it("keeps a range that is already within limits", () => {
    expect(clampDateRange({ dateFrom: "2026-10-13", dateTo: "2026-10-17" }, today)).toEqual({
      dateFrom: "2026-10-13",
      dateTo: "2026-10-17",
    });
  });

  it("moves a start date in the past to today", () => {
    expect(clampDateRange({ dateFrom: "2026-10-01", dateTo: "2026-10-10" }, today)).toEqual({
      dateFrom: "2026-10-08",
      dateTo: "2026-10-10",
    });
  });

  it("returns null when the whole range is in the past", () => {
    expect(clampDateRange({ dateFrom: "2026-09-01", dateTo: "2026-10-07" }, today)).toBeNull();
  });

  it("trims the end date to 90 days ahead", () => {
    expect(clampDateRange({ dateFrom: "2027-01-01", dateTo: "2027-03-01" }, today)).toEqual({
      dateFrom: "2027-01-01",
      dateTo: "2027-01-06",
    });
  });

  it("returns null when the range starts beyond 90 days ahead", () => {
    expect(clampDateRange({ dateFrom: "2027-01-07", dateTo: "2027-01-10" }, today)).toBeNull();
  });

  it("limits the range to 31 days counted from the start date", () => {
    expect(clampDateRange({ dateFrom: "2026-10-10", dateTo: "2026-12-31" }, today)).toEqual({
      dateFrom: "2026-10-10",
      dateTo: "2026-11-09",
    });
  });

  it("handles a leap day when counting the range", () => {
    expect(clampDateRange({ dateFrom: "2028-02-20", dateTo: "2028-04-30" }, "2028-02-15")).toEqual({
      dateFrom: "2028-02-20",
      dateTo: "2028-03-21",
    });
  });

  it("throws when today is not a valid calendar date", () => {
    expect(() => clampDateRange({ dateFrom: "2026-10-13", dateTo: "2026-10-17" }, "2026-10-8")).toThrow(
      ErrorWithCode
    );
  });
});
