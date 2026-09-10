import { prisma } from "@calcom/prisma/__mocks__/prisma";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DestinationCalendarRepository } from "./DestinationCalendarRepository";

vi.mock("@calcom/prisma", () => ({
  prisma,
}));

describe("DestinationCalendarRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("deleteByUserId", () => {
    it("uses deleteMany so a missing row does not throw", async () => {
      prisma.destinationCalendar.deleteMany.mockResolvedValue({ count: 0 });

      await expect(DestinationCalendarRepository.deleteByUserId(42)).resolves.toEqual({ count: 0 });

      expect(prisma.destinationCalendar.deleteMany).toHaveBeenCalledWith({
        where: { userId: 42 },
      });
      expect(prisma.destinationCalendar.delete).not.toHaveBeenCalled();
    });

    it("deletes an existing destination calendar for the user", async () => {
      prisma.destinationCalendar.deleteMany.mockResolvedValue({ count: 1 });

      await expect(DestinationCalendarRepository.deleteByUserId(7)).resolves.toEqual({ count: 1 });

      expect(prisma.destinationCalendar.deleteMany).toHaveBeenCalledWith({
        where: { userId: 7 },
      });
    });
  });
});
