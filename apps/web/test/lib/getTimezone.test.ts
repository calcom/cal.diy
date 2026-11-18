import { expect, beforeEach, afterEach, it, vi, describe } from "vitest";

import { addTimezonesToDropdown, handleOptionLabel, filterBySearchText } from "@calcom/lib/timezone";

const timezonesFixture = [
  { label: "San Francisco", timezone: "America/Argentina/Cordoba" },
  { label: "San Francisco", timezone: "America/Los_Angeles" },
  { label: "Sao Francisco do Sul", timezone: "America/Sao_Paulo" },
  { label: "San Francisco de Macoris", timezone: "America/Santo_Domingo" },
  { label: "San Francisco Gotera", timezone: "America/El_Salvador" },
  { label: "Eastern Time - US & Canada", timezone: "America/New_York" },
  { label: "Pacific Time - US & Canada", timezone: "America/Los_Angeles" },
  { label: "Central Time - US & Canada", timezone: "America/Chicago" },
  { label: "Mountain Time - US & Canada", timezone: "America/Denver" },
  { label: "Atlantic Time - Canada", timezone: "America/Halifax" },
  { label: "Eastern European Time", timezone: "Europe/Bucharest" },
  { label: "Central European Time", timezone: "Europe/Berlin" },
  { label: "Western European Time", timezone: "Europe/London" },
  { label: "Australian Eastern Time", timezone: "Australia/Sydney" },
  { label: "Japan Standard Time", timezone: "Asia/Tokyo" },
  { label: "India Standard Time", timezone: "Asia/Kolkata" },
  { label: "Gulf Standard Time", timezone: "Asia/Dubai" },
  { label: "South Africa Standard Time", timezone: "Africa/Johannesburg" },
  { label: "Brazil Time", timezone: "America/Sao_Paulo" },
  { label: "Hawaii-Aleutian Standard Time", timezone: "Pacific/Honolulu" },
];

const option = {
  value: "America/Los_Angeles",
  label: "(GMT-8:00) San Francisco",
  offset: -8,
  abbrev: "PST",
  altName: "Pacific Standard Time",
};

describe("getTimezone", () => {
  beforeEach(() => {
    vi.useFakeTimers().setSystemTime(new Date("2020-01-01"));
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("should return empty array for an empty string", () => {
    expect(filterBySearchText("", timezonesFixture)).toMatchInlineSnapshot(`[]`);
  });

  it("should filter cities for a valid city name", () => {
    expect(filterBySearchText("San Francisco", timezonesFixture)).toMatchInlineSnapshot(`
      [
        {
          "label": "San Francisco",
          "timezone": "America/Argentina/Cordoba",
        },
        {
          "label": "San Francisco",
          "timezone": "America/Los_Angeles",
        },
        {
          "label": "San Francisco de Macoris",
          "timezone": "America/Santo_Domingo",
        },
        {
          "label": "San Francisco Gotera",
          "timezone": "America/El_Salvador",
        },
      ]
    `);
  });

  it("should return appropriate timezone(s) for a given city name array", () => {
    expect(addTimezonesToDropdown(timezonesFixture)).toMatchInlineSnapshot(`
      {
        "Africa/Johannesburg": "South Africa Standard Time",
        "America/Argentina/Cordoba": "San Francisco",
        "America/Chicago": "Central Time - US & Canada",
        "America/Denver": "Mountain Time - US & Canada",
        "America/El_Salvador": "San Francisco Gotera",
        "America/Halifax": "Atlantic Time - Canada",
        "America/Los_Angeles": "Pacific Time - US & Canada",
        "America/New_York": "Eastern Time - US & Canada",
        "America/Santo_Domingo": "San Francisco de Macoris",
        "America/Sao_Paulo": "Brazil Time",
        "Asia/Dubai": "Gulf Standard Time",
        "Asia/Kolkata": "India Standard Time",
        "Asia/Tokyo": "Japan Standard Time",
        "Australia/Sydney": "Australian Eastern Time",
        "Europe/Berlin": "Central European Time",
        "Europe/Bucharest": "Eastern European Time",
        "Europe/London": "Western European Time",
        "Pacific/Honolulu": "Hawaii-Aleutian Standard Time",
      }
    `);
  });

  it("should render city name as option label if cityData is not empty", () => {
    expect(handleOptionLabel(option, timezonesFixture)).toMatchInlineSnapshot(`"San Francisco GMT -8:00"`);
    vi.setSystemTime(new Date("2020-06-01"));
    expect(handleOptionLabel(option, timezonesFixture)).toMatchInlineSnapshot(`"San Francisco GMT -7:00"`);
  });

  it.each([
    { value: "Asia/Kolkata", label: "(GMT+5:30) Kolkata", expected: "Kolkata GMT +5:30" },
    { value: "Asia/Kathmandu", label: "(GMT+5:45) Kathmandu", expected: "Kathmandu GMT +5:45" },
    { value: "Pacific/Marquesas", label: "(GMT-9:30) Marquesas", expected: "Marquesas GMT -9:30" },
    { value: "Asia/Tokyo", label: "(GMT+9:00) Tokyo", expected: "Tokyo GMT +9:00" },
    { value: "Pacific/Auckland", label: "(GMT+13:00) Auckland", expected: "Auckland GMT +13:00" },
  ])("should format the $value offset without a leading zero", ({ value, label, expected }) => {
    expect(handleOptionLabel({ value, label, offset: 0, abbrev: "", altName: "" }, timezonesFixture)).toBe(
      expected
    );
  });

  it("should return timezone as option label if cityData is empty", () => {
    expect(handleOptionLabel(option, [])).toMatchInlineSnapshot(`"America/Los Angeles GMT -8:00"`);
    vi.setSystemTime(new Date("2020-06-01"));
    expect(handleOptionLabel(option, [])).toMatchInlineSnapshot(`"America/Los Angeles GMT -7:00"`);
  });
});
