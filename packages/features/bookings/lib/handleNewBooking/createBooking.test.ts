import { describe, expect, it, vi, beforeEach } from "vitest";
import dayjs from "@calcom/dayjs";
import { BookingStatus } from "@calcom/prisma/enums";
import { ErrorCode } from "@calcom/lib/errorCodes";

const {
  mockQueryRaw,
  mockBookingFindMany,
  mockBookingCreate,
  mockBookingUpdate,
  mockCredentialFindFirstOrThrow,
  mockTx,
} = vi.hoisted(() => {
  const mockQueryRaw = vi.fn().mockResolvedValue([]);
  const mockBookingFindMany = vi.fn().mockResolvedValue([]);
  const mockBookingCreate = vi.fn().mockImplementation(({ data }: any) =>
    Promise.resolve({
      id: 999,
      uid: data.uid,
      startTime: data.startTime,
      endTime: data.endTime,
      status: data.status,
      user: { uuid: "host-uuid" },
    })
  );
  const mockBookingUpdate = vi.fn().mockResolvedValue({});
  const mockCredentialFindFirstOrThrow = vi.fn().mockResolvedValue({ id: 1 });

  const mockTx = {
    $queryRaw: mockQueryRaw,
    booking: {
      findMany: mockBookingFindMany,
      create: mockBookingCreate,
      update: mockBookingUpdate,
    },
  };

  return {
    mockQueryRaw,
    mockBookingFindMany,
    mockBookingCreate,
    mockBookingUpdate,
    mockCredentialFindFirstOrThrow,
    mockTx,
  };
});

vi.mock("@calcom/prisma", () => ({
  default: {
    $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
    credential: {
      findFirstOrThrow: mockCredentialFindFirstOrThrow,
    },
  },
  prisma: {
    $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
    credential: {
      findFirstOrThrow: mockCredentialFindFirstOrThrow,
    },
  },
}));

vi.mock("@calcom/lib/sentryWrapper", () => ({
  withReporting: (fn: unknown) => fn,
}));

import { createBooking } from "./createBooking";

describe("createBooking concurrency and race condition prevention (#30374)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryRaw.mockResolvedValue([]);
    mockBookingFindMany.mockResolvedValue([]);
  });

  const baseOrganizerUser = {
    id: 42,
    uuid: "host-uuid",
    name: "Dr. Host",
    email: "host@example.com",
    timeZone: "UTC",
    username: "drhost",
    isPlatformManaged: false,
  };

  const createParams = ({
    startTime = "2026-10-25T10:00:00.000Z",
    endTime = "2026-10-25T10:30:00.000Z",
    beforeEventBuffer = 0,
    afterEventBuffer = 0,
    seatsPerTimeSlot = null as number | null,
    originalRescheduledBooking = null as unknown,
  } = {}) => ({
    uid: "booking-uid-123" as any,
    rescheduledBy: undefined,
    reqBody: {
      user: "booker",
      metadata: {},
      recurringEventId: null,
    },
    eventType: {
      eventTypeData: {
        id: 1,
        title: "30 Min Meeting",
        slug: "30min",
        length: 30,
        beforeEventBuffer,
        afterEventBuffer,
        seatsPerTimeSlot,
        users: [baseOrganizerUser],
      } as any,
      id: 1,
      slug: "30min",
      organizerUser: baseOrganizerUser,
      isConfirmedByDefault: true,
      paymentAppData: { price: 0 },
    },
    input: {
      bookerEmail: "booker@example.com",
      rescheduleReason: undefined,
      smsReminderNumber: undefined,
      responses: null,
    },
    evt: {
      title: "30 Min Meeting",
      type: "30min",
      startTime,
      endTime,
      organizer: {
        name: "Dr. Host",
        email: "host@example.com",
        timeZone: "UTC",
      },
      attendees: [
        {
          name: "Alice Booker",
          email: "alice@example.com",
          timeZone: "UTC",
          language: { locale: "en" },
        },
      ],
      seatsPerTimeSlot,
    } as any,
    originalRescheduledBooking: originalRescheduledBooking as any,
    creationSource: undefined,
    tracking: undefined,
  });

  it("acquires row-level lock on the host and succeeds when no overlap exists", async () => {
    const params = createParams({
      startTime: "2026-10-25T10:00:00.000Z",
      endTime: "2026-10-25T10:30:00.000Z",
    });

    const result = await createBooking(params);

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    expect(mockBookingFindMany).toHaveBeenCalledTimes(1);
    expect(mockBookingCreate).toHaveBeenCalledTimes(1);
    expect(result.id).toBe(999);
  });

  it("throws 409 BookingConflict when a concurrent overlapping booking exists for the same host", async () => {
    // Simulate another concurrent transaction already committed an overlapping booking (10:15 - 10:45)
    mockBookingFindMany.mockResolvedValueOnce([
      {
        id: 501,
        startTime: dayjs.utc("2026-10-25T10:15:00.000Z").toDate(),
        endTime: dayjs.utc("2026-10-25T10:45:00.000Z").toDate(),
        eventType: { beforeEventBuffer: 0, afterEventBuffer: 0 },
      },
    ]);

    const params = createParams({
      startTime: "2026-10-25T10:00:00.000Z",
      endTime: "2026-10-25T10:30:00.000Z",
    });

    await expect(createBooking(params)).rejects.toThrow(
      expect.objectContaining({
        statusCode: 409,
        message: ErrorCode.BookingConflict,
      })
    );

    expect(mockBookingCreate).not.toHaveBeenCalled();
  });

  it("detects conflict when existing booking has an afterEventBuffer overlapping incoming booking", async () => {
    // Existing booking 09:30 - 10:00 with 15-minute after buffer (blocked until 10:15)
    mockBookingFindMany.mockResolvedValueOnce([
      {
        id: 502,
        startTime: dayjs.utc("2026-10-25T09:30:00.000Z").toDate(),
        endTime: dayjs.utc("2026-10-25T10:00:00.000Z").toDate(),
        eventType: { beforeEventBuffer: 0, afterEventBuffer: 15 },
      },
    ]);

    // Incoming booking starts at 10:05 (inside the 15-minute buffer window)
    const params = createParams({
      startTime: "2026-10-25T10:05:00.000Z",
      endTime: "2026-10-25T10:35:00.000Z",
    });

    await expect(createBooking(params)).rejects.toThrow(
      expect.objectContaining({
        statusCode: 409,
        message: ErrorCode.BookingConflict,
      })
    );

    expect(mockBookingCreate).not.toHaveBeenCalled();
  });

  it("allows rescheduling without conflicting with the original booking being replaced", async () => {
    // Existing booking 10:00 - 10:30 is the booking being rescheduled (id: 100)
    mockBookingFindMany.mockResolvedValueOnce([]);

    const params = createParams({
      startTime: "2026-10-25T11:00:00.000Z",
      endTime: "2026-10-25T11:30:00.000Z",
      originalRescheduledBooking: {
        id: 100,
        uid: "old-booking-100",
        startTime: dayjs.utc("2026-10-25T10:00:00.000Z").toDate(),
        endTime: dayjs.utc("2026-10-25T10:30:00.000Z").toDate(),
      },
    });

    const result = await createBooking(params);

    expect(result.id).toBe(999);
    expect(mockBookingCreate).toHaveBeenCalledTimes(1);
  });

  it("locks multiple hosts in ascending numeric order to guarantee deadlock-free execution", async () => {
    const params = createParams();
    // Add additional hosts with IDs in reverse order: [99, 12, 42]
    params.eventType.eventTypeData.users = [
      { id: 99 } as any,
      { id: 12 } as any,
      baseOrganizerUser, // id: 42
    ];

    await createBooking(params);

    expect(mockQueryRaw).toHaveBeenCalledTimes(3);
    // Verifies that locks are acquired in sorted order [12, 42, 99]
    expect(mockBookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { in: [12, 42, 99] },
        }),
      })
    );
  });

  it("allows back-to-back contiguous bookings without false positive conflicts", async () => {
    // Existing booking ends exactly when incoming booking starts: 09:30 - 10:00 vs 10:00 - 10:30
    mockBookingFindMany.mockResolvedValueOnce([
      {
        id: 503,
        startTime: dayjs.utc("2026-10-25T09:30:00.000Z").toDate(),
        endTime: dayjs.utc("2026-10-25T10:00:00.000Z").toDate(),
        eventType: { beforeEventBuffer: 0, afterEventBuffer: 0 },
      },
    ]);

    const params = createParams({
      startTime: "2026-10-25T10:00:00.000Z",
      endTime: "2026-10-25T10:30:00.000Z",
    });

    const result = await createBooking(params);

    expect(result.id).toBe(999);
    expect(mockBookingCreate).toHaveBeenCalledTimes(1);
  });
});

