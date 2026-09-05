import { describe, expect, it } from "vitest";

import { getWorkingHours } from "../availability";

describe("getWorkingHours - Timezone & Midnight Wrap Edge Cases", () => {
	it("correctly converts local New York availability (9am-5pm EDT, UTC-4) to UTC working hours (1pm-9pm UTC)", () => {
		// Local NY EDT schedule: 09:00 - 17:00
		// UTC equivalent (+4h): 13:00 (780 min) - 21:00 (1260 min)
		const availability = [
			{
				days: [1, 2, 3, 4, 5],
				startTime: new Date("2026-07-23T09:00:00.000Z"),
				endTime: new Date("2026-07-23T17:00:00.000Z"),
			},
		];

		const result = getWorkingHours({ utcOffset: -240 }, availability);

		expect(result.length).toBeGreaterThan(0);
		expect(result[0].startTime).toBe(13 * 60); // 13:00 UTC = 780 mins
		expect(result[0].endTime).toBe(21 * 60); // 21:00 UTC = 1260 mins
	});

	it("handles day-wrapping to previous day for positive UTC offsets (e.g. Tokyo UTC+9)", () => {
		// Monday 02:00 - 06:00 JST -> Sunday (day 0) 17:00 - 21:00 UTC
		const availability = [
			{
				days: [1], // Monday
				startTime: new Date("2026-07-23T02:00:00.000Z"),
				endTime: new Date("2026-07-23T06:00:00.000Z"),
			},
		];

		const result = getWorkingHours({ utcOffset: 540 }, availability);

		expect(result).toBeDefined();
		expect(result.length).toBeGreaterThan(0);
		expect(result.some((wh) => wh.days.includes(0))).toBe(true);
	});

	it("handles day-wrapping to next day for negative UTC offsets (e.g. Los Angeles PDT UTC-7)", () => {
		// Monday 20:00 - 23:00 PDT -> Tuesday (day 2) 03:00 - 06:00 UTC
		const availability = [
			{
				days: [1], // Monday
				startTime: new Date("2026-07-23T20:00:00.000Z"),
				endTime: new Date("2026-07-23T23:00:00.000Z"),
			},
		];

		const result = getWorkingHours({ utcOffset: -420 }, availability);

		expect(result).toBeDefined();
		expect(result.length).toBeGreaterThan(0);
		expect(result.some((wh) => wh.days.includes(2))).toBe(true);
	});
});
