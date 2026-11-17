import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_HOLIDAY_CALENDARS } from "./constants";
import type { CachedHoliday } from "./HolidayServiceCachingProxy";

vi.mock("./HolidayServiceCachingProxy", () => ({
  getHolidayServiceCachingProxy: vi.fn(() => ({
    getHolidaysForCountry: vi.fn(),
    getHolidaysInRange: vi.fn(),
  })),
  HolidayServiceCachingProxy: vi.fn(),
}));

import { HolidayService } from "./HolidayService";
import { getHolidayServiceCachingProxy } from "./HolidayServiceCachingProxy";

const mockHolidays: CachedHoliday[] = [
  {
    id: "1",
    countryCode: "US",
    eventId: "new_years_day_2025",
    name: "New Year's Day",
    date: new Date("2025-01-01"),
    year: 2025,
  },
  {
    id: "2",
    countryCode: "US",
    eventId: "christmas_day_2025",
    name: "Christmas Day",
    date: new Date("2025-12-25"),
    year: 2025,
  },
];

describe("HolidayService", () => {
  let holidayService: HolidayService;
  let mockCachingProxy: ReturnType<typeof getHolidayServiceCachingProxy>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCachingProxy = {
      getHolidaysForCountry: vi.fn(),
      getHolidaysInRange: vi.fn(),
    } as unknown as ReturnType<typeof getHolidayServiceCachingProxy>;
    vi.mocked(getHolidayServiceCachingProxy).mockReturnValue(mockCachingProxy);
    holidayService = new HolidayService(mockCachingProxy);
  });

  describe("getSupportedCountries", () => {
    it("should return list of countries from GOOGLE_HOLIDAY_CALENDARS", () => {
      const countries = holidayService.getSupportedCountries();

      expect(countries.length).toBe(Object.keys(GOOGLE_HOLIDAY_CALENDARS).length);
      expect(countries.find((c) => c.code === "US")).toEqual({
        code: "US",
        name: "United States",
      });
    });
  });

  describe("getHolidaysForCountry", () => {
    it("should return holidays from caching proxy", async () => {
      vi.mocked(mockCachingProxy.getHolidaysForCountry).mockResolvedValue(mockHolidays);

      const holidays = await holidayService.getHolidaysForCountry("US", 2025);

      expect(mockCachingProxy.getHolidaysForCountry).toHaveBeenCalledWith("US", 2025);
      expect(holidays).toHaveLength(2);
      expect(holidays[0].name).toBe("New Year's Day");
    });
  });

  describe("getHolidaysWithStatus", () => {
    it("should mark holidays as enabled by default", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-06-15"));
      vi.mocked(mockCachingProxy.getHolidaysForCountry).mockResolvedValue(mockHolidays);

      const holidays = await holidayService.getHolidaysWithStatus("US", []);

      expect(holidays.find((h) => h.id === "christmas_day_2025")?.enabled).toBe(true);

      vi.useRealTimers();
    });

    it("should mark disabled holidays correctly", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-06-15"));
      vi.mocked(mockCachingProxy.getHolidaysForCountry).mockResolvedValue(mockHolidays);

      const holidays = await holidayService.getHolidaysWithStatus("US", ["christmas_day_2025"]);

      expect(holidays.find((h) => h.id === "christmas_day_2025")?.enabled).toBe(false);

      vi.useRealTimers();
    });
  });

  describe("getHolidayDatesInRange", () => {
    it("should return holidays within date range", async () => {
      vi.mocked(mockCachingProxy.getHolidaysInRange).mockResolvedValue([mockHolidays[1]]);

      const holidays = await holidayService.getHolidayDatesInRange(
        "US",
        [],
        new Date("2025-12-01"),
        new Date("2025-12-31")
      );

      expect(holidays).toHaveLength(1);
      expect(holidays[0].holiday.name).toBe("Christmas Day");
    });

    it("should exclude disabled holidays", async () => {
      vi.mocked(mockCachingProxy.getHolidaysInRange).mockResolvedValue([mockHolidays[1]]);

      const holidays = await holidayService.getHolidayDatesInRange(
        "US",
        ["christmas_day_2025"],
        new Date("2025-12-01"),
        new Date("2025-12-31")
      );

      expect(holidays).toEqual([]);
    });
  });
});
