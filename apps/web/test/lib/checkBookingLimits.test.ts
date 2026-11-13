import dayjs from "@calcom/dayjs";
import { getCheckBookingLimitsService } from "@calcom/features/di/containers/BookingLimits";
import type { IntervalLimit } from "@calcom/lib/intervalLimits/intervalLimitSchema";
import { validateIntervalLimitOrder } from "@calcom/lib/intervalLimits/validateIntervalLimitOrder";
import { describe, expect, it, vi } from "vitest";

const mockCountBookingsByEventTypeAndDateRange = vi.fn();
vi.mock("@calcom/features/bookings/repositories/BookingRepository", () => ({
  BookingRepository: vi.fn().mockImplementation(function () {
    return {
      countBookingsByEventTypeAndDateRange: mockCountBookingsByEventTypeAndDateRange,
    };
  }),
}));

vi.mock("@calcom/prisma", () => ({
  default: {},
  prisma: {},
}));

type Mockdata = {
  id: number;
  startDate: Date;
  bookingLimits: IntervalLimit;
};

const MOCK_DATA: Mockdata = {
  id: 1,
  startDate: dayjs("2022-09-30T09:00:00+01:00").toDate(),
  bookingLimits: {
    PER_DAY: 1,
  },
};

const checkBookingLimitsService = getCheckBookingLimitsService();

describe("Check Booking Limits Tests", () => {
  it("Should return no errors", async () => {
    mockCountBookingsByEventTypeAndDateRange.mockResolvedValue(0);
    expect(
      checkBookingLimitsService.checkBookingLimits(MOCK_DATA.bookingLimits, MOCK_DATA.startDate, MOCK_DATA.id)
    ).resolves.toBeTruthy();
  });
  it("Should throw an error", async () => {
    mockCountBookingsByEventTypeAndDateRange.mockResolvedValue(2);
    expect(
      checkBookingLimitsService.checkBookingLimits(MOCK_DATA.bookingLimits, MOCK_DATA.startDate, MOCK_DATA.id)
    ).rejects.toThrowError();
  });

  it("Should pass with multiple booking limits", async () => {
    mockCountBookingsByEventTypeAndDateRange.mockResolvedValue(0);
    expect(
      checkBookingLimitsService.checkBookingLimits(
        {
          PER_DAY: 1,
          PER_WEEK: 2,
        },
        MOCK_DATA.startDate,
        MOCK_DATA.id
      )
    ).resolves.toBeTruthy();
  });
  it("Should pass with multiple booking limits with one undefined", async () => {
    mockCountBookingsByEventTypeAndDateRange.mockResolvedValue(0);

    expect(
      checkBookingLimitsService.checkBookingLimits(
        {
          PER_DAY: 1,
          PER_WEEK: undefined,
        },
        MOCK_DATA.startDate,
        MOCK_DATA.id
      )
    ).resolves.toBeTruthy();
  });
  it("Should handle multiple limits correctly", async () => {
    mockCountBookingsByEventTypeAndDateRange.mockResolvedValue(1);
    expect(
      checkBookingLimitsService.checkBookingLimit({
        key: "PER_DAY",
        limitingNumber: 2,
        eventStartDate: MOCK_DATA.startDate,
        eventId: MOCK_DATA.id,
      })
    ).resolves.not.toThrow();
    mockCountBookingsByEventTypeAndDateRange.mockResolvedValue(3);
    expect(
      checkBookingLimitsService.checkBookingLimit({
        key: "PER_WEEK",
        limitingNumber: 2,
        eventStartDate: MOCK_DATA.startDate,
        eventId: MOCK_DATA.id,
      })
    ).rejects.toThrowError();
  });
});

describe("Booking limit validation", () => {
  it("Should validate a correct limit", () => {
    expect(validateIntervalLimitOrder({ PER_DAY: 3, PER_MONTH: 5 })).toBe(true);
  });

  it("Should invalidate an incorrect limit", () => {
    expect(validateIntervalLimitOrder({ PER_DAY: 9, PER_MONTH: 5 })).toBe(false);
  });

  it("Should validate a correct limit with 'gaps' ", () => {
    expect(validateIntervalLimitOrder({ PER_DAY: 9, PER_YEAR: 25 })).toBe(true);
  });

  it("Should validate a correct limit with equal values ", () => {
    expect(validateIntervalLimitOrder({ PER_DAY: 1, PER_YEAR: 1 })).toBe(true);
  });

  it("Should not depend on key order when values are equal", () => {
    expect(validateIntervalLimitOrder({ PER_WEEK: 1, PER_DAY: 1 })).toBe(true);
    expect(validateIntervalLimitOrder({ PER_MONTH: 10, PER_WEEK: 5, PER_DAY: 5 })).toBe(true);
    // Postgres jsonb returns keys shorter-first, so a saved PER_YEAR comes back before PER_MONTH
    expect(validateIntervalLimitOrder({ PER_DAY: 1, PER_YEAR: 5, PER_MONTH: 5 })).toBe(true);
    expect(validateIntervalLimitOrder({ PER_YEAR: 1, PER_MONTH: 1, PER_WEEK: 1, PER_DAY: 1 })).toBe(true);
  });

  it("Should invalidate an incorrect limit regardless of key order", () => {
    expect(validateIntervalLimitOrder({ PER_WEEK: 2, PER_DAY: 3 })).toBe(false);
    expect(validateIntervalLimitOrder({ PER_MONTH: 5, PER_WEEK: 3, PER_DAY: 5 })).toBe(false);
  });

  it("Should validate a correct with empty", () => {
    expect(validateIntervalLimitOrder({})).toBe(true);
  });
});
