import dayjs from "@calcom/dayjs";
import type { CheckBookingLimitsService } from "@calcom/features/bookings/lib/checkBookingLimits";
import { checkDurationLimit, checkDurationLimits } from "@calcom/features/bookings/lib/checkDurationLimits";
import { CheckBookingAndDurationLimitsService } from "@calcom/features/bookings/lib/handleNewBooking/checkBookingAndDurationLimits";
import { validateIntervalLimitOrder } from "@calcom/lib/intervalLimits/validateIntervalLimitOrder";
import { describe, expect, it, vi } from "vitest";

const mockGetTotalBookingDuration = vi.fn();
vi.mock("@calcom/features/bookings/repositories/BookingRepository", () => ({
  BookingRepository: vi.fn().mockImplementation(function () {
    return {
      getTotalBookingDuration: mockGetTotalBookingDuration,
    };
  }),
}));

vi.mock("@calcom/prisma", () => ({
  default: {},
  prisma: {},
}));

type MockData = {
  id: number;
  startDate: Date;
};

const MOCK_DATA: MockData = {
  id: 1,
  startDate: dayjs("2022-09-30T09:00:00+01:00").toDate(),
};

// Path: apps/web/test/lib/checkDurationLimits.ts
describe("Check Duration Limits Tests", () => {
  it("Should return no errors if limit is not reached", async () => {
    mockGetTotalBookingDuration.mockResolvedValue(0);
    await expect(
      checkDurationLimits({ PER_DAY: 60 }, MOCK_DATA.startDate, MOCK_DATA.id)
    ).resolves.toBeTruthy();
  });
  it("Should throw an error if limit is reached", async () => {
    mockGetTotalBookingDuration.mockResolvedValue(60);
    await expect(
      checkDurationLimits({ PER_DAY: 60 }, MOCK_DATA.startDate, MOCK_DATA.id)
    ).rejects.toThrowError();
  });
  it("Should pass with multiple duration limits", async () => {
    mockGetTotalBookingDuration.mockResolvedValue(30);
    await expect(
      checkDurationLimits(
        {
          PER_DAY: 60,
          PER_WEEK: 120,
        },
        MOCK_DATA.startDate,
        MOCK_DATA.id
      )
    ).resolves.toBeTruthy();
  });
  it("Should pass with multiple duration limits with one undefined", async () => {
    mockGetTotalBookingDuration.mockResolvedValue(30);
    await expect(
      checkDurationLimits(
        {
          PER_DAY: 60,
          PER_WEEK: undefined,
        },
        MOCK_DATA.startDate,
        MOCK_DATA.id
      )
    ).resolves.toBeTruthy();
  });
  it("Should return no errors if limit is not reached with multiple bookings", async () => {
    mockGetTotalBookingDuration.mockResolvedValue(60);
    await expect(
      checkDurationLimits(
        {
          PER_DAY: 90,
          PER_WEEK: 120,
        },
        MOCK_DATA.startDate,
        MOCK_DATA.id
      )
    ).resolves.toBeTruthy();
  });
  it("Should throw an error if one of the limit is reached with multiple bookings", async () => {
    mockGetTotalBookingDuration.mockResolvedValue(90);
    await expect(
      checkDurationLimits(
        {
          PER_DAY: 60,
          PER_WEEK: 120,
        },
        MOCK_DATA.startDate,
        MOCK_DATA.id
      )
    ).rejects.toThrowError();
  });
});

// Path: apps/web/test/lib/checkDurationLimits.ts
describe("Check Duration Limit Tests", () => {
  it("Should return no busyTimes and no error if limit is not reached", async () => {
    mockGetTotalBookingDuration.mockResolvedValue(60);
    await expect(
      checkDurationLimit({
        key: "PER_DAY",
        limitingNumber: 90,
        eventStartDate: MOCK_DATA.startDate,
        eventId: MOCK_DATA.id,
      })
    ).resolves.toBeUndefined();
  });
});

describe("Check Duration Limit time zone", () => {
  // 2022-10-01T03:30 in Asia/Kolkata, but still 2022-09-30 in UTC
  const eventStartDate = dayjs("2022-09-30T22:00:00Z").toDate();

  it("Should count bookings over the day of the organizer time zone", async () => {
    mockGetTotalBookingDuration.mockClear();
    mockGetTotalBookingDuration.mockResolvedValue(0);

    await checkDurationLimit({
      key: "PER_DAY",
      limitingNumber: 60,
      eventStartDate,
      eventId: MOCK_DATA.id,
      timeZone: "Asia/Kolkata",
    });

    expect(mockGetTotalBookingDuration).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: new Date("2022-09-30T18:30:00.000Z"),
        endDate: new Date("2022-10-01T18:29:59.999Z"),
      })
    );
  });

  it("Should pass the organizer time zone through checkDurationLimits", async () => {
    mockGetTotalBookingDuration.mockClear();
    mockGetTotalBookingDuration.mockResolvedValue(0);

    await checkDurationLimits({ PER_DAY: 60 }, eventStartDate, MOCK_DATA.id, undefined, "Asia/Kolkata");

    expect(mockGetTotalBookingDuration).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: new Date("2022-09-30T18:30:00.000Z"),
        endDate: new Date("2022-10-01T18:29:59.999Z"),
      })
    );
  });
  it("Should pass the event schedule time zone through the booking check", async () => {
    mockGetTotalBookingDuration.mockClear();
    mockGetTotalBookingDuration.mockResolvedValue(0);

    const service = new CheckBookingAndDurationLimitsService({
      checkBookingLimitsService: { checkBookingLimits: vi.fn() } as unknown as CheckBookingLimitsService,
    });

    await service._checkBookingAndDurationLimits({
      eventType: {
        id: MOCK_DATA.id,
        bookingLimits: null,
        durationLimits: { PER_DAY: 60 },
        schedule: { timeZone: "Asia/Kolkata" },
      } as Parameters<typeof service._checkBookingAndDurationLimits>[0]["eventType"],
      reqBodyStart: eventStartDate.toISOString(),
    });

    expect(mockGetTotalBookingDuration).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: new Date("2022-09-30T18:30:00.000Z"),
        endDate: new Date("2022-10-01T18:29:59.999Z"),
      })
    );
  });
});

describe("Duration limit validation", () => {
  it("Should validate limit where ranges have ascending values", () => {
    expect(validateIntervalLimitOrder({ PER_DAY: 30, PER_MONTH: 60 })).toBe(true);
  });
  it("Should invalidate limit where ranges does not have a strict ascending values", () => {
    expect(validateIntervalLimitOrder({ PER_DAY: 60, PER_WEEK: 30 })).toBe(false);
  });
  it("Should validate a correct limit with 'gaps'", () => {
    expect(validateIntervalLimitOrder({ PER_DAY: 60, PER_YEAR: 120 })).toBe(true);
  });
  it("Should validate empty limit", () => {
    expect(validateIntervalLimitOrder({})).toBe(true);
  });
});
