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

  it("should preserve valid IANA names with lower-case words (Europe/Isle_of_Man)", () => {
    // Regression test for https://github.com/calcom/cal.com/issues/30587
    // The naive capitalization used to rewrite this to "Europe/Isle_Of_Man".
    const input = { timeZone: "europe/isle_of_man" };
    const output = plainToClass(TestDto, input);
    expect(output.timeZone).toBe("Europe/Isle_of_Man");
  });

  it("should keep an already-correct IANA name unchanged (Europe/Isle_of_Man)", () => {
    const input = { timeZone: "Europe/Isle_of_Man" };
    const output = plainToClass(TestDto, input);
    expect(output.timeZone).toBe("Europe/Isle_of_Man");
  });

  it("should preserve other IANA names with lower-case words", () => {
    const cases: Array<[string, string]> = [
      ["africa/dar_es_salaam", "Africa/Dar_es_Salaam"],
      ["america/port_of_spain", "America/Port_of_Spain"],
      ["america/port-au-prince", "America/Port-au-Prince"],
      ["asia/ust-nera", "Asia/Ust-Nera"],
    ];
    for (const [input, expected] of cases) {
      const output = plainToClass(TestDto, { timeZone: input });
      expect(output.timeZone).toBe(expected);
    }
  });

  it("should preserve IANA names with inner capitals (Antarctica/McMurdo)", () => {
    const input = { timeZone: "antarctica/mcmurdo" };
    const output = plainToClass(TestDto, input);
    expect(output.timeZone).toBe("Antarctica/McMurdo");
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
