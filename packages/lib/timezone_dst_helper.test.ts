import { describe, expect, it } from "vitest";

import { getTimezoneOffsetMinutes } from "./timezone_dst_helper";

describe("getTimezoneOffsetMinutes", () => {
  it.each([
    ["Etc/GMT+3", "2026-01-15T12:00:00.000Z", -180],
    ["America/St_Johns", "2026-01-15T12:00:00.000Z", -210],
    ["Asia/Kolkata", "2026-01-15T12:00:00.000Z", 330],
  ])("parses %s correctly", (timezone, isoDate, expected) => {
    expect(getTimezoneOffsetMinutes(timezone, new Date(isoDate))).toBe(expected);
  });
});
