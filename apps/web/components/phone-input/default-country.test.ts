import { describe, expect, it } from "vitest";
import { detectCountry, resolveFallbackCountry } from "./default-country";
import { TIMEZONE_COUNTRIES } from "./timezone-countries.generated";

describe("resolveFallbackCountry", () => {
  it("falls back to us when unset or empty", () => {
    expect(resolveFallbackCountry(undefined)).toBe("us");
    expect(resolveFallbackCountry("")).toBe("us");
    expect(resolveFallbackCountry("  ")).toBe("us");
  });

  it("accepts an ISO 3166-1 alpha-2 code in any case", () => {
    expect(resolveFallbackCountry("be")).toBe("be");
    expect(resolveFallbackCountry("BE")).toBe("be");
    expect(resolveFallbackCountry(" Fr ")).toBe("fr");
  });

  it("falls back to us on an unknown code", () => {
    expect(resolveFallbackCountry("zz")).toBe("us");
    expect(resolveFallbackCountry("belgium")).toBe("us");
    expect(resolveFallbackCountry("+32")).toBe("us");
  });
});

describe("detectCountry", () => {
  it("prefers the time zone over the language region", () => {
    expect(detectCountry({ timeZone: "Europe/Brussels", languages: ["fr-FR"] })).toBe("be");
    expect(detectCountry({ timeZone: "Europe/Paris", languages: ["nl-BE"] })).toBe("fr");
  });

  it("tells apart countries that share a merged zone", () => {
    expect(detectCountry({ timeZone: "Europe/Amsterdam", languages: [] })).toBe("nl");
    expect(detectCountry({ timeZone: "Europe/Luxembourg", languages: [] })).toBe("lu");
  });

  it("knows the legacy names browsers still report", () => {
    expect(detectCountry({ timeZone: "Asia/Calcutta", languages: [] })).toBe("in");
    expect(detectCountry({ timeZone: "Europe/Kiev", languages: [] })).toBe("ua");
    expect(detectCountry({ timeZone: "America/Montreal", languages: [] })).toBe("ca");
  });

  it("falls back to the first language with a region", () => {
    expect(detectCountry({ timeZone: "UTC", languages: ["fr", "nl-BE", "en-US"] })).toBe("be");
    expect(detectCountry({ timeZone: undefined, languages: ["pt_BR"] })).toBe("br");
  });

  it("returns null when nothing is known", () => {
    expect(detectCountry({ timeZone: "UTC", languages: ["fr", "en"] })).toBeNull();
    expect(detectCountry({ timeZone: "Etc/GMT+1", languages: ["zh-Hant", "es-419"] })).toBeNull();
  });

  it("maps every zone to a country libphonenumber supports", () => {
    const unsupported = Object.entries(TIMEZONE_COUNTRIES).filter(
      ([timeZone]) => detectCountry({ timeZone, languages: [] }) === null
    );
    expect(unsupported.map(([zone, country]) => `${zone}=${country}`)).toEqual([]);
  });
});
