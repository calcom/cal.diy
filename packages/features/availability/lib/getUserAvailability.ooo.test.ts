import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GetUserAvailabilityInitialData } from "./getUserAvailability";
import { UserAvailabilityService } from "./getUserAvailability";

vi.mock("@calcom/features/di/containers/BusyTimes", () => ({
  getBusyTimesService: vi.fn(),
}));

vi.mock("@calcom/features/busyTimes/lib/getBusyTimesFromLimits", () => ({
  getBusyTimesFromLimits: vi.fn(),
  getBusyTimesFromTeamLimits: vi.fn(),
}));

vi.mock("@calcom/app-store/_utils/getCalendar", () => ({
  getCalendar: vi.fn(),
}));

vi.mock("@calcom/lib/holidays", () => ({
  getHolidayService: vi.fn(),
}));

type OutOfOfficeDay = NonNullable<GetUserAvailabilityInitialData["outOfOfficeDays"]>[number];

const everyDay = [
  {
    days: [0, 1, 2, 3, 4, 5, 6],
    startTime: new Date("1970-01-01T09:00:00.000Z"),
    endTime: new Date("1970-01-01T17:00:00.000Z"),
  },
];

function oooEntry({
  id,
  start,
  end,
  toUserId,
  reason,
}: {
  id: number;
  start: string;
  end: string;
  toUserId: number;
  reason: string;
}): OutOfOfficeDay {
  return {
    id,
    start: new Date(start),
    end: new Date(end),
    notes: null,
    showNotePublicly: false,
    user: { id: 1, name: "Host" },
    toUser: { id: toUserId, username: `user-${toUserId}`, name: `User ${toUserId}` },
    reason: { id, emoji: "🌴", reason },
  };
}

const mockDependencies: ConstructorParameters<typeof UserAvailabilityService>[0] = {
  oooRepo: {
    findUserOOODays: vi.fn().mockResolvedValue([]),
  },
  bookingRepo: {
    findAcceptedBookingByEventTypeId: vi.fn().mockResolvedValue([]),
  },
  redisClient: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
  },
  eventTypeRepo: {
    findByIdForUserAvailability: vi.fn().mockResolvedValue(null),
    findForSlots: vi.fn().mockResolvedValue(null),
  },
  holidayRepo: {
    findUserSettingsSelect: vi.fn().mockResolvedValue(null),
  },
};

describe("calculateOutOfOfficeRanges", () => {
  const service = new UserAvailabilityService(mockDependencies);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the higher id on days shared by two entries with the same start", () => {
    const ranges = service.calculateOutOfOfficeRanges(
      [
        oooEntry({
          id: 1,
          start: "2026-08-12T00:00:00.000Z",
          end: "2026-08-16T00:00:00.000Z",
          toUserId: 10,
          reason: "wide",
        }),
        oooEntry({
          id: 2,
          start: "2026-08-12T00:00:00.000Z",
          end: "2026-08-14T00:00:00.000Z",
          toUserId: 20,
          reason: "narrow",
        }),
      ],
      everyDay
    );

    for (const day of ["2026-08-12", "2026-08-13", "2026-08-14"]) {
      expect(ranges[day]?.toUser?.id).toBe(20);
      expect(ranges[day]?.reason).toBe("narrow");
    }
    for (const day of ["2026-08-15", "2026-08-16"]) {
      expect(ranges[day]?.toUser?.id).toBe(10);
      expect(ranges[day]?.reason).toBe("wide");
    }
  });

  it("keeps the later start on shared days even when that entry has the lower id", () => {
    const ranges = service.calculateOutOfOfficeRanges(
      [
        oooEntry({
          id: 5,
          start: "2026-08-12T00:00:00.000Z",
          end: "2026-08-16T00:00:00.000Z",
          toUserId: 10,
          reason: "early",
        }),
        oooEntry({
          id: 1,
          start: "2026-08-14T00:00:00.000Z",
          end: "2026-08-16T00:00:00.000Z",
          toUserId: 20,
          reason: "late",
        }),
      ],
      everyDay
    );

    for (const day of ["2026-08-12", "2026-08-13"]) {
      expect(ranges[day]?.toUser?.id).toBe(10);
      expect(ranges[day]?.reason).toBe("early");
    }
    for (const day of ["2026-08-14", "2026-08-15", "2026-08-16"]) {
      expect(ranges[day]?.toUser?.id).toBe(20);
      expect(ranges[day]?.reason).toBe("late");
    }
  });
});
