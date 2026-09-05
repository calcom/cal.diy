import { prisma } from "@calcom/prisma/__mocks__/prisma";
import dayjs from "@calcom/dayjs";
import { getBusyTimesService } from "@calcom/features/di/containers/BusyTimes";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@calcom/prisma", () => ({
  default: prisma,
  prisma,
}));

vi.mock("@calcom/features/calendars/lib/CalendarManager", () => ({
  getBusyCalendarTimes: vi.fn().mockResolvedValue([]),
  createEvent: vi.fn().mockResolvedValue({}),
  updateEvent: vi.fn().mockResolvedValue({}),
  deleteEvent: vi.fn().mockResolvedValue({}),
}));

vi.mock("@calcom/app-store/delegationCredential", () => ({
  enrichHostsWithDelegationCredentials: vi.fn(),
  getUsersCredentialsIncludeServiceAccountKey: vi.fn(),
  getCredentialForSelectedCalendar: vi.fn(),
  findUniqueDelegationCalendarCredential: vi.fn(),
  getAllDelegationCredentialsForUserIncludeServiceAccountKey: vi.fn(),
  getDelegationCredentialOrFindRegularCredential: vi.fn(),
}));

const startOfTomorrow = dayjs().add(1, "day").startOf("day");
const tomorrowDate = startOfTomorrow.format("YYYY-MM-DD");

const mockBookings = ({
  beforeEventBuffer = 0,
  afterEventBuffer = 0,
  seatsPerTimeSlot,
}: {
  beforeEventBuffer?: number;
  afterEventBuffer?: number;
  seatsPerTimeSlot?: number;
}) => [
  {
    id: 1,
    startTime: startOfTomorrow.set("hour", 10).toDate(),
    endTime: startOfTomorrow.set("hour", 11).toDate(),
    title: "Booking Between X and Y",
    userId: 1,
    uid: "xxxx1",
    eventType: {
      id: 1,
      beforeEventBuffer,
      afterEventBuffer,
      seatsPerTimeSlot: seatsPerTimeSlot ?? null,
    },
    _count: {
      seatsReferences: 1,
    },
  },
  {
    id: 2,
    startTime: startOfTomorrow.set("hour", 14).toDate(),
    endTime: startOfTomorrow.set("hour", 15).toDate(),
    title: "Booking Between X and Y",
    userId: 1,
    uid: "xxxx2",
    eventType: {
      id: 1,
      beforeEventBuffer,
      afterEventBuffer,
      seatsPerTimeSlot: seatsPerTimeSlot ?? null,
    },
    ...(seatsPerTimeSlot
      ? {
          _count: {
            seatsReferences: 1,
          },
        }
      : {}),
  },
];

describe("getBusyTimes", () => {
  it("blocks a regular time slot", async () => {
    const busyTimesService = getBusyTimesService();
    const busyTimes = await busyTimesService.getBusyTimes({
      credentials: [],
      userId: 1,
      userEmail: "exampleuser1@example.com",
      username: "exampleuser1",
      bypassBusyCalendarTimes: false,
      selectedCalendars: [],
      startTime: startOfTomorrow.format(),
      endTime: startOfTomorrow.endOf("day").format(),
      currentBookings: mockBookings({}),
    });
    expect(busyTimes).toEqual([
      expect.objectContaining({
        start: dayjs(`${tomorrowDate}`).startOf("day").set("hour", 10).toDate(),
        end: dayjs(`${tomorrowDate}`).startOf("day").set("hour", 11).toDate(),
        source: "eventType-1-booking-1",
        title: "Booking Between X and Y",
      }),
      expect.objectContaining({
        start: dayjs(`${tomorrowDate}`).startOf("day").set("hour", 14).toDate(),
        end: dayjs(`${tomorrowDate}`).startOf("day").set("hour", 15).toDate(),
        source: "eventType-1-booking-2",
        title: "Booking Between X and Y",
      }),
    ]);
  });
  it("should block the original booking slot when rescheduling", async () => {
    const busyTimesService = getBusyTimesService();
    const rescheduleUid = "xxxx1";

    const busyTimes = await busyTimesService.getBusyTimes({
      credentials: [],
      userId: 1,
      userEmail: "exampleuser1@example.com",
      username: "exampleuser1",
      bypassBusyCalendarTimes: false,
      selectedCalendars: [],
      startTime: startOfTomorrow.format(),
      endTime: startOfTomorrow.endOf("day").format(),
      currentBookings: mockBookings({}),
      rescheduleUid,
    });

    expect(busyTimes).toEqual([
      expect.objectContaining({
        start: dayjs(`${tomorrowDate}`).startOf("day").set("hour", 10).toDate(),
        end: dayjs(`${tomorrowDate}`).startOf("day").set("hour", 11).toDate(),
        source: "eventType-1-booking-1",
        title: "Booking Between X and Y",
      }),
      expect.objectContaining({
        start: dayjs(`${tomorrowDate}`).startOf("day").set("hour", 14).toDate(),
        end: dayjs(`${tomorrowDate}`).startOf("day").set("hour", 15).toDate(),
        source: "eventType-1-booking-2",
        title: "Booking Between X and Y",
      }),
    ]);

    expect(busyTimes).toHaveLength(2);
    expect(busyTimes.some((bt) => bt.source === "eventType-1-booking-1")).toBe(true);
  });
  it("should block before and after buffer times", async () => {
    const busyTimesService = getBusyTimesService();
    const busyTimes = await busyTimesService.getBusyTimes({
      credentials: [],
      userId: 1,
      userEmail: "exampleuser1@example.com",
      username: "exampleuser1",
      bypassBusyCalendarTimes: false,
      selectedCalendars: [],
      startTime: startOfTomorrow.format(),
      endTime: startOfTomorrow.endOf("day").format(),
      currentBookings: [mockBookings({ beforeEventBuffer: 10 })[0]],
    });
    expect(busyTimes).toEqual([
      expect.objectContaining({
        start: dayjs(`${tomorrowDate}`).startOf("day").set("hour", 9).set("minute", 50).toDate(),
        end: dayjs(`${tomorrowDate}`).startOf("day").set("hour", 11).toDate(),
        source: "eventType-1-booking-1",
        title: "Booking Between X and Y",
      }),
    ]);
  });
  it("should have busy times only if seated with remaining seats when buffers exist", async () => {
    const busyTimesService = getBusyTimesService();
    const busyTimes = await busyTimesService.getBusyTimes({
      credentials: [],
      userId: 1,
      eventTypeId: 1,
      userEmail: "exampleuser1@example.com",
      username: "exampleuser1",
      bypassBusyCalendarTimes: false,
      selectedCalendars: [],
      startTime: startOfTomorrow.format(),
      endTime: startOfTomorrow.endOf("day").format(),
      currentBookings: [mockBookings({ beforeEventBuffer: 10, seatsPerTimeSlot: 10 })[0]],
    });
    expect(busyTimes).toEqual([
      expect.objectContaining({
        start: dayjs(`${tomorrowDate}`).startOf("day").set("hour", 9).set("minute", 50).toDate(),
        end: dayjs(`${tomorrowDate}`).startOf("day").set("hour", 10).toDate(),
      }),
    ]);
  });
});

describe("getBusyTimesForLimitChecks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockBookingResult = (
    overrides: Partial<{
      id: number;
      startTime: Date;
      endTime: Date;
      eventTypeId: number | null;
      title: string;
      userId: number | null;
    }> = {}
  ) => ({
    id: 1,
    startTime: startOfTomorrow.set("hour", 10).toDate(),
    endTime: startOfTomorrow.set("hour", 11).toDate(),
    eventTypeId: 1,
    title: "Test Booking",
    userId: 1,
    ...overrides,
  });

  it("should return empty array when no booking or duration limits are provided", async () => {
    const busyTimesService = getBusyTimesService();
    const busyTimes = await busyTimesService.getBusyTimesForLimitChecks({
      userIds: [1, 2, 3],
      eventTypeId: 1,
      startDate: startOfTomorrow.format(),
      endDate: startOfTomorrow.endOf("day").format(),
      bookingLimits: null,
      durationLimits: null,
    });

    expect(busyTimes).toEqual([]);
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
  });

  it("should return empty array when userIds is empty", async () => {
    const busyTimesService = getBusyTimesService();
    const busyTimes = await busyTimesService.getBusyTimesForLimitChecks({
      userIds: [],
      eventTypeId: 1,
      startDate: startOfTomorrow.format(),
      endDate: startOfTomorrow.endOf("day").format(),
      bookingLimits: { PER_DAY: 5 },
    });

    expect(busyTimes).toEqual([]);
  });

  it("should fetch bookings for a single user with booking limits", async () => {
    const mockBooking = createMockBookingResult();
    vi.mocked(prisma.booking.findMany).mockResolvedValue([mockBooking]);

    const busyTimesService = getBusyTimesService();
    const busyTimes = await busyTimesService.getBusyTimesForLimitChecks({
      userIds: [1],
      eventTypeId: 1,
      startDate: startOfTomorrow.format(),
      endDate: startOfTomorrow.endOf("day").format(),
      bookingLimits: { PER_DAY: 5 },
    });

    expect(busyTimes).toHaveLength(1);
    expect(busyTimes[0]).toEqual(
      expect.objectContaining({
        start: mockBooking.startTime,
        end: mockBooking.endTime,
        title: mockBooking.title,
        source: `eventType-${mockBooking.eventTypeId}-booking-${mockBooking.id}`,
        userId: mockBooking.userId,
      })
    );
    expect(prisma.booking.findMany).toHaveBeenCalledTimes(1);
  });

  it("should fetch bookings for multiple users with duration limits", async () => {
    const mockBookings = [
      createMockBookingResult({ id: 1, userId: 1 }),
      createMockBookingResult({
        id: 2,
        userId: 2,
        startTime: startOfTomorrow.set("hour", 14).toDate(),
        endTime: startOfTomorrow.set("hour", 15).toDate(),
      }),
    ];
    vi.mocked(prisma.booking.findMany).mockResolvedValue(mockBookings);

    const busyTimesService = getBusyTimesService();
    const busyTimes = await busyTimesService.getBusyTimesForLimitChecks({
      userIds: [1, 2],
      eventTypeId: 1,
      startDate: startOfTomorrow.format(),
      endDate: startOfTomorrow.endOf("day").format(),
      durationLimits: { PER_DAY: 120 },
    });

    expect(busyTimes).toHaveLength(2);
    expect(busyTimes[0].userId).toBe(1);
    expect(busyTimes[1].userId).toBe(2);
  });

  it("should batch queries when userIds exceeds batch size (50)", async () => {
    const userIds = Array.from({ length: 75 }, (_, i) => i + 1);
    const mockBookings = [createMockBookingResult()];
    vi.mocked(prisma.booking.findMany).mockResolvedValue(mockBookings);

    const busyTimesService = getBusyTimesService();
    await busyTimesService.getBusyTimesForLimitChecks({
      userIds,
      eventTypeId: 1,
      startDate: startOfTomorrow.format(),
      endDate: startOfTomorrow.endOf("day").format(),
      bookingLimits: { PER_DAY: 5 },
    });

    // Should be called twice: once for first 50 users, once for remaining 25
    expect(prisma.booking.findMany).toHaveBeenCalledTimes(2);
  });

  it("should batch queries correctly for exactly 100 users (2 full batches)", async () => {
    const userIds = Array.from({ length: 100 }, (_, i) => i + 1);
    vi.mocked(prisma.booking.findMany).mockResolvedValue([]);

    const busyTimesService = getBusyTimesService();
    await busyTimesService.getBusyTimesForLimitChecks({
      userIds,
      eventTypeId: 1,
      startDate: startOfTomorrow.format(),
      endDate: startOfTomorrow.endOf("day").format(),
      bookingLimits: { PER_WEEK: 10 },
    });

    expect(prisma.booking.findMany).toHaveBeenCalledTimes(2);
  });

  it("should batch queries correctly for 150 users (3 batches)", async () => {
    const userIds = Array.from({ length: 150 }, (_, i) => i + 1);
    vi.mocked(prisma.booking.findMany).mockResolvedValue([]);

    const busyTimesService = getBusyTimesService();
    await busyTimesService.getBusyTimesForLimitChecks({
      userIds,
      eventTypeId: 1,
      startDate: startOfTomorrow.format(),
      endDate: startOfTomorrow.endOf("day").format(),
      bookingLimits: { PER_MONTH: 20 },
    });

    expect(prisma.booking.findMany).toHaveBeenCalledTimes(3);
  });

  it("should merge results from multiple batches correctly", async () => {
    const userIds = Array.from({ length: 75 }, (_, i) => i + 1);

    // First batch returns 2 bookings, second batch returns 1 booking
    vi.mocked(prisma.booking.findMany)
      .mockResolvedValueOnce([
        createMockBookingResult({ id: 1, userId: 1 }),
        createMockBookingResult({ id: 2, userId: 25 }),
      ])
      .mockResolvedValueOnce([createMockBookingResult({ id: 3, userId: 60 })]);

    const busyTimesService = getBusyTimesService();
    const busyTimes = await busyTimesService.getBusyTimesForLimitChecks({
      userIds,
      eventTypeId: 1,
      startDate: startOfTomorrow.format(),
      endDate: startOfTomorrow.endOf("day").format(),
      bookingLimits: { PER_DAY: 5 },
    });

    expect(busyTimes).toHaveLength(3);
    expect(busyTimes.map((b) => b.userId)).toEqual([1, 25, 60]);
  });

  it("should exclude rescheduleUid from results", async () => {
    const mockBooking = createMockBookingResult();
    vi.mocked(prisma.booking.findMany).mockResolvedValue([mockBooking]);

    const busyTimesService = getBusyTimesService();
    await busyTimesService.getBusyTimesForLimitChecks({
      userIds: [1],
      eventTypeId: 1,
      startDate: startOfTomorrow.format(),
      endDate: startOfTomorrow.endOf("day").format(),
      rescheduleUid: "existing-booking-uid",
      bookingLimits: { PER_DAY: 5 },
    });

    // Verify the query was called (the actual exclusion happens in the Prisma query)
    expect(prisma.booking.findMany).toHaveBeenCalledTimes(1);
  });

  it("should handle both booking and duration limits together", async () => {
    const mockBooking = createMockBookingResult();
    vi.mocked(prisma.booking.findMany).mockResolvedValue([mockBooking]);

    const busyTimesService = getBusyTimesService();
    const busyTimes = await busyTimesService.getBusyTimesForLimitChecks({
      userIds: [1],
      eventTypeId: 1,
      startDate: startOfTomorrow.format(),
      endDate: startOfTomorrow.endOf("day").format(),
      bookingLimits: { PER_DAY: 5 },
      durationLimits: { PER_DAY: 120 },
    });

    expect(busyTimes).toHaveLength(1);
    expect(prisma.booking.findMany).toHaveBeenCalledTimes(1);
  });

  it("should handle null eventTypeId in booking results", async () => {
    const mockBooking = createMockBookingResult({ eventTypeId: null });
    vi.mocked(prisma.booking.findMany).mockResolvedValue([mockBooking]);

    const busyTimesService = getBusyTimesService();
    const busyTimes = await busyTimesService.getBusyTimesForLimitChecks({
      userIds: [1],
      eventTypeId: 1,
      startDate: startOfTomorrow.format(),
      endDate: startOfTomorrow.endOf("day").format(),
      bookingLimits: { PER_DAY: 5 },
    });

    expect(busyTimes).toHaveLength(1);
    expect(busyTimes[0].source).toBe(`eventType-null-booking-${mockBooking.id}`);
  });

  it("should handle null userId in booking results", async () => {
    const mockBooking = createMockBookingResult({ userId: null });
    vi.mocked(prisma.booking.findMany).mockResolvedValue([mockBooking]);

    const busyTimesService = getBusyTimesService();
    const busyTimes = await busyTimesService.getBusyTimesForLimitChecks({
      userIds: [1],
      eventTypeId: 1,
      startDate: startOfTomorrow.format(),
      endDate: startOfTomorrow.endOf("day").format(),
      bookingLimits: { PER_DAY: 5 },
    });

    expect(busyTimes).toHaveLength(1);
    expect(busyTimes[0].userId).toBeNull();
  });
});
