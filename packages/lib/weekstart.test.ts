import { describe, expect, it } from "vitest";
import { sortAvailabilityStrings } from "./weekstart";

describe("Weekstart tests", () => {
  describe("fn: sortAvailabilityStrings", () => {
    it("should sort the availability strings when changing weekstart from Sunday to Monday", () => {
      const input = [
        "Sun, 11:45 AM - 5:00 PM",
        "Mon, 7:45 AM - 4:15 PM",
        "Tue, 9:30 AM - 5:00 PM",
        "Wed, 9:15 AM - 5:00 PM",
        "Thu, 9:00 AM - 5:00 PM",
        "Fri, 7:45 AM - 5:00 PM",
        "Sat, 10:00 AM - 5:00 PM",
      ];

      const expected = [
        "Mon, 7:45 AM - 4:15 PM",
        "Tue, 9:30 AM - 5:00 PM",
        "Wed, 9:15 AM - 5:00 PM",
        "Thu, 9:00 AM - 5:00 PM",
        "Fri, 7:45 AM - 5:00 PM",
        "Sat, 10:00 AM - 5:00 PM",
        "Sun, 11:45 AM - 5:00 PM",
      ];

      const result = input.sort(sortAvailabilityStrings("en-US", "Monday"));

      expect(result).toEqual(expected);
    });

    it("should sort the availability strings when changing weekstart from Monday to Sunday", () => {
      const input = [
        "Mon - Tue, Thu 7:45 AM - 4:15 PM",
        "Tue, 5:00 PM - 8:00 PM",
        "Wed, 9:15 AM - 5:00 PM",
        "Fri, 7:45 AM - 5:00 PM",
        "Sat, 10:00 AM - 5:00 PM",
        "Sun, 11:45 AM - 5:00 PM",
      ];

      const expected = [
        "Sun, 11:45 AM - 5:00 PM",
        "Mon - Tue, Thu 7:45 AM - 4:15 PM",
        "Tue, 5:00 PM - 8:00 PM",
        "Wed, 9:15 AM - 5:00 PM",
        "Fri, 7:45 AM - 5:00 PM",
        "Sat, 10:00 AM - 5:00 PM",
      ];

      const result = input.sort(sortAvailabilityStrings("en-US", "Sunday"));

      expect(result).toEqual(expected);
    });

    it("should sort the availability strings as per the weekstart (random to tuesday)", () => {
      // this input scenario is not possible to occur, as regardless of any day as start of week,
      // the weekdays always occur consecutively. But, this to test the sorting function in any case.
      const input = [
        "Thu, Mon 7:45 AM - 8:45 AM",
        "Sat, 10:00 AM - 10:30 AM",
        "Tue, Fri 4:00 PM - 4:30 PM",
        "Tue, 5:00 PM - 8:00 PM",
        "Tue, Sun 9:00 AM - 9:30 AM",
        "Wed - Thu, Sat 11:00 AM - 11:30 AM",
      ];

      const expected = [
        "Tue, Fri 4:00 PM - 4:30 PM",
        "Tue, 5:00 PM - 8:00 PM",
        "Tue, Sun 9:00 AM - 9:30 AM",
        "Wed - Thu, Sat 11:00 AM - 11:30 AM",
        "Thu, Mon 7:45 AM - 8:45 AM",
        "Sat, 10:00 AM - 10:30 AM",
      ];

      const result = input.sort(sortAvailabilityStrings("en-US", "Tuesday"));

      expect(result).toEqual(expected);
    });
  });
});
