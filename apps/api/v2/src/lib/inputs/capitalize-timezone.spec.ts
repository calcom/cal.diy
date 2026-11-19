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

	it("should preserve valid IANA casing for time zones with lowercase words, inner capitals, and hyphens", () => {
		expect(
			plainToClass(TestDto, { timeZone: "Africa/Dar_es_Salaam" }).timeZone,
		).toBe("Africa/Dar_es_Salaam");
		expect(
			plainToClass(TestDto, { timeZone: "africa/dar_es_salaam" }).timeZone,
		).toBe("Africa/Dar_es_Salaam");
		expect(
			plainToClass(TestDto, { timeZone: "America/Port_of_Spain" }).timeZone,
		).toBe("America/Port_of_Spain");
		expect(
			plainToClass(TestDto, { timeZone: "america/port_of_spain" }).timeZone,
		).toBe("America/Port_of_Spain");
		expect(
			plainToClass(TestDto, { timeZone: "America/Port-au-Prince" }).timeZone,
		).toBe("America/Port-au-Prince");
		expect(
			plainToClass(TestDto, { timeZone: "america/port-au-prince" }).timeZone,
		).toBe("America/Port-au-Prince");
		expect(
			plainToClass(TestDto, { timeZone: "Antarctica/McMurdo" }).timeZone,
		).toBe("Antarctica/McMurdo");
		expect(
			plainToClass(TestDto, { timeZone: "antarctica/mcmurdo" }).timeZone,
		).toBe("Antarctica/McMurdo");
		expect(plainToClass(TestDto, { timeZone: "Asia/Ust-Nera" }).timeZone).toBe(
			"Asia/Ust-Nera",
		);
		expect(plainToClass(TestDto, { timeZone: "asia/ust-nera" }).timeZone).toBe(
			"Asia/Ust-Nera",
		);
	});

	it("should preserve time zone aliases and not rewrite to different canonical names", () => {
		expect(plainToClass(TestDto, { timeZone: "Asia/Kolkata" }).timeZone).toBe(
			"Asia/Kolkata",
		);
		expect(plainToClass(TestDto, { timeZone: "Asia/Calcutta" }).timeZone).toBe(
			"Asia/Calcutta",
		);
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
