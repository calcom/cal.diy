import { describe, it, expect } from "vitest";

import { IntlSupportedTimeZones } from "./timeZones";

const hourAt = (timeZone: string, instant: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(instant);

describe("IntlSupportedTimeZones", () => {
  it("only lists zones the Intl API accepts", () => {
    const rejected = IntlSupportedTimeZones.filter((timeZone) => {
      try {
        new Intl.DateTimeFormat("en-GB", { timeZone });
        return false;
      } catch {
        return true;
      }
    });

    expect(rejected).toEqual([]);
  });

  it("lists America/Coyhaique, which parts from Santiago for the southern winter", () => {
    // Chile's Aysén region stays on UTC-3 all year while Santiago drops to UTC-4,
    // so without its own entry a booker there is an hour out from April to September.
    const southernWinter = new Date("2026-07-15T12:00:00Z");

    expect(hourAt("America/Coyhaique", southernWinter)).not.toEqual(
      hourAt("America/Santiago", southernWinter)
    );
    expect(IntlSupportedTimeZones).toContain("America/Coyhaique");
  });
});
