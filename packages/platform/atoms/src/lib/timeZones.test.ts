import { describe, expect, it } from "vitest";
import { filterPropsTimezones } from "./timeZones";

const available = [
  { city: "Kyiv", timezone: "Europe/Kyiv" },
  { city: "Yangon", timezone: "Asia/Yangon" },
  { city: "Toronto", timezone: "America/Toronto" },
];

describe("filterPropsTimezones", () => {
  it("matches canonical ids", () => {
    expect(filterPropsTimezones(["Europe/Kyiv"], available)).toEqual([available[0]]);
  });

  it("matches pre-rename link ids against canonical city rows", () => {
    expect(filterPropsTimezones(["Europe/Kiev"], available)).toEqual([available[0]]);
    expect(filterPropsTimezones(["Asia/Rangoon"], available)).toEqual([available[1]]);
  });

  it("does not match a link id that is not in the allow-list", () => {
    expect(filterPropsTimezones(["Europe/Kiev", "America/Toronto"], available)).toEqual([
      available[0],
      available[2],
    ]);
    expect(filterPropsTimezones(["Asia/Saigon"], available)).toEqual([]);
  });
});
