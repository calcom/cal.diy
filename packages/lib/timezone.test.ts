import { describe, expect, it } from "vitest";

import { formatOffset, filterBySearchText, addTimezonesToDropdown } from "./timezone";

describe("timezone helper functions", () => {
  describe("formatOffset", () => {
    it("strips leading zero from single-digit whole-hour offsets", () => {
      expect(formatOffset("+09:00")).toBe("+9:00");
      expect(formatOffset("-04:00")).toBe("-4:00");
    });

    it("strips leading zero from single-digit fractional-hour offsets", () => {
      expect(formatOffset("+05:30")).toBe("+5:30");
      expect(formatOffset("-03:30")).toBe("-3:30");
      expect(formatOffset("+05:45")).toBe("+5:45");
      expect(formatOffset("+09:30")).toBe("+9:30");
    });

    it("preserves double-digit hour offsets unchanged", () => {
      expect(formatOffset("+10:00")).toBe("+10:00");
      expect(formatOffset("-11:00")).toBe("-11:00");
      expect(formatOffset("+12:45")).toBe("+12:45");
    });
  });

  describe("filterBySearchText", () => {
    it("filters timezones by search text", () => {
      const timezones = [
        { label: "Asia/Kolkata", timezone: "Asia/Kolkata" },
        { label: "America/New_York", timezone: "America/New_York" },
      ];
      expect(filterBySearchText("kolkata", timezones)).toHaveLength(1);
      expect(filterBySearchText("kolkata", timezones)[0].label).toBe("Asia/Kolkata");
    });
  });

  describe("addTimezonesToDropdown", () => {
    it("converts timezone list into a dictionary", () => {
      const timezones = [
        { label: "Asia/Kolkata", timezone: "Asia/Kolkata" },
      ];
      const result = addTimezonesToDropdown(timezones);
      expect(result).toEqual({ "Asia/Kolkata": "Asia/Kolkata" });
    });
  });
});
