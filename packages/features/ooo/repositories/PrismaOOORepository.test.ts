import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import { beforeEach, describe, expect, it } from "vitest";
import { PrismaOOORepository } from "./PrismaOOORepository";

const overlappingEntryOrder = [{ start: "asc" }, { id: "asc" }];

describe("PrismaOOORepository", () => {
  let repository: PrismaOOORepository;

  beforeEach(() => {
    repository = new PrismaOOORepository(prismaMock);
    prismaMock.outOfOfficeEntry.findMany.mockResolvedValue([]);
  });

  it("orders findManyOOO by start then id so overlapping entries resolve the same way on every read", async () => {
    await repository.findManyOOO({
      startTimeDate: new Date("2026-08-12T00:00:00.000Z"),
      endTimeDate: new Date("2026-08-16T00:00:00.000Z"),
      allUserIds: [1],
    });

    expect(prismaMock.outOfOfficeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: overlappingEntryOrder,
      })
    );
  });

  it("orders findUserOOODays by start then id so overlapping entries resolve the same way on every read", async () => {
    await repository.findUserOOODays({
      userId: 1,
      dateFrom: "2026-08-12T00:00:00.000Z",
      dateTo: "2026-08-16T00:00:00.000Z",
    });

    expect(prismaMock.outOfOfficeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: overlappingEntryOrder,
      })
    );
  });
});
