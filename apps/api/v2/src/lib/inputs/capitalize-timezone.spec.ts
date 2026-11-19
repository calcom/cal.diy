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

  it("should capitalize complex time zone correctly", () => {
    const input = { timeZone: "europe/isle_of_man" };
    const output = plainToClass(TestDto, input);
    expect(output.timeZone).toBe("Europe/Isle_of_Man");
  });

  it("should preserve canonical IANA casing for compound time zones like Africa/Dar_es_Salaam", () => {
    const input = { timeZone: "africa/dar_es_salaam" };
    const output = plainToClass(TestDto, input);
    expect(output.timeZone).toBe("Africa/Dar_es_Salaam");
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
