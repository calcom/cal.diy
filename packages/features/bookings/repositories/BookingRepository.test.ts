import type { PrismaClient } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingRepository } from "./BookingRepository";

describe("BookingRepository", () => {
  let repository: BookingRepository;
  let mockPrismaClient: {
    $queryRaw: ReturnType<typeof vi.fn>;
    booking: { findMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrismaClient = {
      $queryRaw: vi.fn(),
      booking: { findMany: vi.fn().mockResolvedValue([]) },
    };

    repository = new BookingRepository(mockPrismaClient as unknown as PrismaClient);
  });

  describe("getTotalBookingDuration", () => {
    it("should return total minutes from the database result", async () => {
      mockPrismaClient.$queryRaw.mockResolvedValue([{ totalMinutes: 120 }]);

      const result = await repository.getTotalBookingDuration({
        eventId: 52,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      });

      expect(result).toBe(120);
      expect(mockPrismaClient.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it("should return 0 when totalMinutes is null", async () => {
      mockPrismaClient.$queryRaw.mockResolvedValue([{ totalMinutes: null }]);

      const result = await repository.getTotalBookingDuration({
        eventId: 52,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      });

      expect(result).toBe(0);
    });

    it("should call query when rescheduleUid is provided", async () => {
      mockPrismaClient.$queryRaw.mockResolvedValue([{ totalMinutes: 90 }]);

      const result = await repository.getTotalBookingDuration({
        eventId: 52,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        rescheduleUid: "existing-booking-uid",
      });

      expect(result).toBe(90);
      expect(mockPrismaClient.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe("findAllExistingBookingsForEventTypeBetween", () => {
    const params = {
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-01-02T00:00:00Z"),
      userIdAndEmailMap: new Map([[7, "host@example.com"]]),
    };

    const getPendingQueryWhere = () =>
      mockPrismaClient.booking.findMany.mock.calls
        .map(([args]) => args.where)
        .find((where) => where.status?.in?.includes("PENDING"));

    it("blocks on the host's pending bookings from any event type that blocks slots", async () => {
      await repository.findAllExistingBookingsForEventTypeBetween({ ...params, eventTypeId: 1 });

      const where = getPendingQueryWhere();
      expect(where.status).toEqual({ in: ["PENDING"] });
      expect(where.eventType).toEqual({
        requiresConfirmation: true,
        requiresConfirmationWillBlockSlot: true,
      });
      expect(where.OR).toEqual([{ userId: { in: [7] } }, { eventTypeId: 1 }]);
    });

    it("still checks pending bookings by host when no event type is given", async () => {
      await repository.findAllExistingBookingsForEventTypeBetween(params);

      expect(getPendingQueryWhere().OR).toEqual([{ userId: { in: [7] } }]);
    });
  });
});
