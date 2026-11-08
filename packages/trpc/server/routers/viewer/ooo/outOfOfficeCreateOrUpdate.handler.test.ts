import getWebhooks from "@calcom/features/webhooks/lib/getWebhooks";
import sendPayload from "@calcom/features/webhooks/lib/sendPayload";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { outOfOfficeCreateOrUpdate } from "./outOfOfficeCreateOrUpdate.handler";

const prismaModuleMock = vi.hoisted(() => ({
  outOfOfficeEntry: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  outOfOfficeReason: {
    findUnique: vi.fn(),
  },
  membership: {
    findMany: vi.fn(),
  },
}));

vi.mock("@calcom/prisma", () => ({
  default: prismaModuleMock,
  prisma: prismaModuleMock,
}));

vi.mock("@calcom/features/webhooks/lib/getWebhooks", () => ({ default: vi.fn() }));
vi.mock("@calcom/features/webhooks/lib/sendPayload", () => ({ default: vi.fn() }));

// Setup mocks to control the implementations
const prismaMock = {
  outOfOfficeEntry: {
    findFirst: vi.fn().mockResolvedValue(undefined),
    findUnique: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn().mockResolvedValue(undefined),
  },
};

// Override the default mocks with your controlled mocks
vi.spyOn(prisma.outOfOfficeEntry, "findFirst").mockImplementation(prismaMock.outOfOfficeEntry.findFirst);
vi.spyOn(prisma.outOfOfficeEntry, "findUnique").mockImplementation(prismaMock.outOfOfficeEntry.findUnique);
vi.spyOn(prisma.outOfOfficeEntry, "upsert").mockImplementation(prismaMock.outOfOfficeEntry.upsert);

afterEach(() => {
  prismaMock.outOfOfficeEntry.findFirst.mockClear();
  prismaMock.outOfOfficeEntry.findUnique.mockClear();
  prismaMock.outOfOfficeEntry.upsert.mockClear();
});

const mockUser = {
  id: 4,
  username: "pro",
  email: "pro@example.com",
  password: {
    hash: "",
    userId: 0,
  },
  completedOnboarding: true,
  identityProvider: "CAL",
  profiles: [],
  avatar: "",
  organization: null,
  organizationId: null,
  locale: "en",
  timeZone: "UTC",
  defaultScheduleId: null,
  email_verified: true,
  name: null,
  theme: null,
} as const;

describe("outOfOfficeCreateOrUpdate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.setSystemTime(new Date("2024-11-22T03:23:45Z"));
  });

  it("should throw error if start date is after end date", async () => {
    const input = {
      dateRange: {
        startDate: new Date("2024-11-23T23:00:00.000Z"),
        endDate: new Date("2024-11-22T23:00:00.000Z"),
      },
      startDateOffset: 60,
      endDateOffset: 60,
      reasonId: 1,
      notes: "",
      toTeamUserId: null,
    };

    await expect(outOfOfficeCreateOrUpdate({ ctx: { user: mockUser }, input })).rejects.toThrow(
      "start_date_must_be_before_end_date"
    );
  });

  it("should handle timezone offset correctly", async () => {
    const input = {
      dateRange: {
        startDate: new Date("2025-03-28T23:00:00.000Z"),
        endDate: new Date("2025-04-01T22:00:00.000Z"),
      },
      startDateOffset: 60, // Paris timezone (CET)
      endDateOffset: 120, // Paris timezone (CEST) <- After summer time begins
      reasonId: 1,
      notes: "",
      toTeamUserId: null,
    };
    const startTimeUtc = "2025-03-29T00:00:00.000Z";
    const endTimeUtc = "2025-04-02T23:59:59.999Z";

    await outOfOfficeCreateOrUpdate({
      ctx: { user: mockUser },
      input,
    });

    expect(prisma.outOfOfficeEntry.findFirst).toHaveBeenNthCalledWith(1, {
      select: {
        toUserId: true,
        userId: true,
      },
      where: {
        OR: [
          {
            AND: [
              {
                start: {
                  lte: endTimeUtc,
                },
              },
              {
                end: {
                  gte: startTimeUtc,
                },
              },
            ],
          },
          {
            AND: [
              {
                start: {
                  gte: startTimeUtc,
                },
              },
              {
                end: {
                  lte: endTimeUtc,
                },
              },
            ],
          },
        ],
        toUserId: 4,
      },
    });
  });

  describe("OOO_CREATED webhooks", () => {
    const input = {
      dateRange: {
        startDate: new Date("2024-11-25T00:00:00.000Z"),
        endDate: new Date("2024-11-26T00:00:00.000Z"),
      },
      startDateOffset: 0,
      endDateOffset: 0,
      reasonId: 1,
      notes: "",
      toTeamUserId: null,
    };

    beforeEach(() => {
      const oooEntry = {
        id: 1,
        uuid: "ooo-uuid",
        start: new Date("2024-11-25T00:00:00.000Z"),
        end: new Date("2024-11-26T23:59:59.999Z"),
        createdAt: new Date("2024-11-22T03:23:45Z"),
        updatedAt: new Date("2024-11-22T03:23:45Z"),
        notes: "",
      };
      prismaModuleMock.outOfOfficeEntry.upsert.mockResolvedValue(oooEntry);
      prismaModuleMock.outOfOfficeEntry.findUnique.mockResolvedValue(oooEntry);
      prismaModuleMock.outOfOfficeReason.findUnique.mockResolvedValue({ reason: "vacation", emoji: "🏝️" });
      prismaModuleMock.membership.findMany.mockResolvedValue([]);
      vi.mocked(getWebhooks).mockResolvedValue([
        {
          id: "webhook-1",
          subscriberUrl: "https://example.com/webhook",
          payloadTemplate: null,
          appId: null,
          secret: "secret",
          time: null,
          timeUnit: null,
          eventTriggers: ["OOO_CREATED"],
          version: "2021-10-20",
        },
      ]);
    });

    it("waits for webhook delivery before returning", async () => {
      let delivered = false;
      vi.mocked(sendPayload).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              delivered = true;
              resolve({ ok: true, status: 200 });
            }, 10);
          })
      );

      await outOfOfficeCreateOrUpdate({ ctx: { user: mockUser }, input });

      expect(sendPayload).toHaveBeenCalledTimes(1);
      expect(delivered).toBe(true);
    });

    it("logs a failed webhook delivery instead of throwing", async () => {
      const loggerErrorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
      vi.mocked(sendPayload).mockRejectedValue(new Error("webhook endpoint unreachable"));

      await expect(outOfOfficeCreateOrUpdate({ ctx: { user: mockUser }, input })).resolves.toEqual({});

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("https://example.com/webhook"),
        expect.stringContaining("webhook endpoint unreachable")
      );
    });
  });
});
