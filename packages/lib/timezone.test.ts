import { describe, expect, it } from "vitest";
import { addTimezonesToDropdown, filterBySearchText, handleOptionLabel } from "./timezone";

describe("timezone utilities", () => {
  describe("filterBySearchText", () => {
    it("should filter timezones by search text case-insensitively", () => {
      const timezones = [
        { label: "(GMT+5:30) Kolkata", timezone: "Asia/Kolkata" },
        { label: "(GMT+1:00) Berlin", timezone: "Europe/Berlin" },
        { label: "(GMT-5:00) New York", timezone: "America/New_York" },
      ];

      expect(filterBySearchText("kolkata", timezones)).toEqual([
        { label: "(GMT+5:30) Kolkata", timezone: "Asia/Kolkata" },
      ]);
      expect(filterBySearchText("BERLIN", timezones)).toEqual([
        { label: "(GMT+1:00) Berlin", timezone: "Europe/Berlin" },
      ]);
      expect(filterBySearchText("", timezones)).toEqual([]);
    });
  });

  describe("addTimezonesToDropdown", () => {
    it("should filter out invalid or problematic timezones", () => {
      const timezones = [
        { label: "(GMT+5:30) Kolkata", timezone: "Asia/Kolkata" },
        { label: "(GMT+0:00) GMT", timezone: "GMT" },
      ];

      const result = addTimezonesToDropdown(timezones);
      expect(result["Asia/Kolkata"]).toBe("(GMT+5:30) Kolkata");
    });
  });

  describe("handleOptionLabel", () => {
    it("should strip leading zero from offset in timezone option label", () => {
      const timezones = [{ label: "(GMT+5:30) Kolkata", timezone: "Asia/Kolkata" }];
      const option = {
        label: "(GMT+05:30) Kolkata",
        value: "Asia/Kolkata",
        offset: 5.5,
        abbrev: "IST",
        altName: "India Standard Time",
      };

      const result = handleOptionLabel(option, timezones);
      expect(result).toContain("Kolkata");
      // Check that the offset stripped leading zero (+5:30, not +05:30)
      expect(result).not.toContain("+05:30");
    });
  });
});
