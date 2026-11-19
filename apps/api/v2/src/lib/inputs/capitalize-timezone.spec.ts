import { plainToClass } from "class-transformer";
import { IsOptional, IsString } from "class-validator";

import { CapitalizeTimeZone } from "./capitalize-timezone";

class TestDto {
  @IsOptional()
  @IsString()
  @CapitalizeTimeZone()
  timeZone?: string;
}

describe("CapitalizeTimeZone", () => {
  it("should capitalize single part time zone correctly", () => {
    const input = { timeZone: "egypt" };
    const output = plainToClass(TestDto, input);
    expect(output.timeZone).toBe("Egypt");
  });

  it("should capitalize one-part time zone correctly", () => {
    const input = { timeZone: "europe/rome" };
    const output = plainToClass(TestDto, input);
    expect(output.timeZone).toBe("Europe/Rome");
  });

  it("should capitalize multi-part time zone correctly", () => {
    const input = { timeZone: "america/new_york" };
    const output = plainToClass(TestDto, input);
    expect(output.timeZone).toBe("America/New_York");
  });

  it("should capitalize complex time zone correctly without corrupting canonical IANA casing", () => {
    const input = { timeZone: "europe/isle_of_man" };
    const output = plainToClass(TestDto, input);
    expect(output.timeZone).toBe("Europe/Isle_of_Man");
  });

  it("should preserve canonical IANA casing for zones with particles and inner capitals", () => {
    const canonicalZones = [
      { input: "Africa/Dar_es_Salaam", expected: "Africa/Dar_es_Salaam" },
      { input: "africa/dar_es_salaam", expected: "Africa/Dar_es_Salaam" },
      { input: "America/Port_of_Spain", expected: "America/Port_of_Spain" },
      { input: "america/port_of_spain", expected: "America/Port_of_Spain" },
      { input: "America/Port-au-Prince", expected: "America/Port-au-Prince" },
      { input: "america/port-au-prince", expected: "America/Port-au-Prince" },
      { input: "Antarctica/McMurdo", expected: "Antarctica/McMurdo" },
      { input: "antarctica/mcmurdo", expected: "Antarctica/McMurdo" },
      { input: "Asia/Ust-Nera", expected: "Asia/Ust-Nera" },
      { input: "asia/ust-nera", expected: "Asia/Ust-Nera" },
      { input: "Africa/Porto-Novo", expected: "Africa/Porto-Novo" },
      { input: "America/Blanc-Sablon", expected: "America/Blanc-Sablon" },
      { input: "Antarctica/DumontDUrville", expected: "Antarctica/DumontDUrville" },
    ];

    for (const { input, expected } of canonicalZones) {
      const output = plainToClass(TestDto, { timeZone: input });
      expect(output.timeZone).toBe(expected);
    }
  });

  it("should handle already capitalized time zones correctly", () => {
    const input = { timeZone: "Asia/Tokyo" };
    const output = plainToClass(TestDto, input);
    expect(output.timeZone).toBe("Asia/Tokyo");
  });

  it("should handle missing time zone correctly", () => {
    const input = {};
    const output = plainToClass(TestDto, input);
    expect(output.timeZone).toBeUndefined();
  });

  it("should capitalize EST at the end of the string", () => {
    const input = { email: "test@example.com", timeZone: "utc/est" };
    const output = plainToClass(TestDto, input);
    expect(output.timeZone).toBe("UTC/EST");
  });

  it("should capitalize UTC when surrounded by non-alphabetical characters", () => {
    const input = { email: "test@example.com", timeZone: "utc/gmt+3_est" };
    const output = plainToClass(TestDto, input);
    expect(output.timeZone).toBe("UTC/GMT+3_EST");
  });
});
