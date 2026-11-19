import { describe, expect, it } from "vitest";

import { normalizeTimezone } from "./normalizeTimezone";

describe("normalizeTimezone", () => {
	it("should normalize valid IANA timezones with lowercase words to standard IANA spelling", () => {
		expect(normalizeTimezone("Europe/Isle_of_Man")).toBe("Europe/Isle_of_Man");
		expect(normalizeTimezone("europe/isle_of_man")).toBe("Europe/Isle_of_Man");
		expect(normalizeTimezone("Europe/Isle_Of_Man")).toBe("Europe/Isle_of_Man");
		expect(normalizeTimezone("Africa/Dar_es_Salaam")).toBe(
			"Africa/Dar_es_Salaam",
		);
		expect(normalizeTimezone("africa/dar_es_salaam")).toBe(
			"Africa/Dar_es_Salaam",
		);
		expect(normalizeTimezone("America/Port_of_Spain")).toBe(
			"America/Port_of_Spain",
		);
		expect(normalizeTimezone("america/port_of_spain")).toBe(
			"America/Port_of_Spain",
		);
	});

	it("should normalize valid IANA timezones with inner capitals and hyphens", () => {
		expect(normalizeTimezone("America/Port-au-Prince")).toBe(
			"America/Port-au-Prince",
		);
		expect(normalizeTimezone("america/port-au-prince")).toBe(
			"America/Port-au-Prince",
		);
		expect(normalizeTimezone("Antarctica/McMurdo")).toBe("Antarctica/McMurdo");
		expect(normalizeTimezone("antarctica/mcmurdo")).toBe("Antarctica/McMurdo");
		expect(normalizeTimezone("Asia/Ust-Nera")).toBe("Asia/Ust-Nera");
		expect(normalizeTimezone("asia/ust-nera")).toBe("Asia/Ust-Nera");
	});

	it("should preserve valid timezone aliases without rewriting to different names", () => {
		expect(normalizeTimezone("Asia/Kolkata")).toBe("Asia/Kolkata");
		expect(normalizeTimezone("Asia/Calcutta")).toBe("Asia/Calcutta");
	});

	it("should handle standard and simple timezones", () => {
		expect(normalizeTimezone("UTC")).toBe("UTC");
		expect(normalizeTimezone("utc")).toBe("UTC");
		expect(normalizeTimezone("america/new_york")).toBe("America/New_York");
		expect(normalizeTimezone("Europe/Rome")).toBe("Europe/Rome");
	});

	it("should fall back gracefully on invalid or custom strings", () => {
		expect(normalizeTimezone("egypt")).toBe("Egypt");
		expect(normalizeTimezone("invalid_timezone")).toBe("Invalid_Timezone");
		expect(normalizeTimezone("utc/est")).toBe("UTC/EST");
	});

	it("should return non-string values as-is", () => {
		expect(normalizeTimezone(undefined)).toBeUndefined();
		expect(normalizeTimezone(null)).toBeNull();
		expect(normalizeTimezone(123)).toBe(123);
	});
});
