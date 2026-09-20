import type { PrismaClient } from "@calcom/prisma";
import { SchedulingType } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it } from "vitest";
import { type DeepMockProxy, mockDeep, mockReset } from "vitest-mock-extended";

import handleChildrenEventTypes from "./handleChildrenEventTypes";

const PARENT_ID = 1;

// Minimal parent row returned by the `findUniqueOrThrow` used inside the engine.
const buildParent = (overrides: Record<string, unknown> = {}) => ({
  title: "Managed",
  slug: "managed",
  description: null,
  length: 30,
  hidden: false,
  metadata: {},
  position: 0,
  scheduleId: null,
  ...overrides,
});

const buildChildInput = (id: number, hidden = false) => ({
  owner: { id, name: `user-${id}`, email: `user-${id}@example.com`, eventTypeSlugs: [] as string[] },
  hidden,
});

describe("handleChildrenEventTypes", () => {
  let prismaMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    prismaMock = mockDeep<PrismaClient>();
    mockReset(prismaMock);
  });

  it("is a no-op for non-managed event types", async () => {
    const res = await handleChildrenEventTypes({
      eventTypeId: PARENT_ID,
      updatedEventType: { slug: "managed", schedulingType: SchedulingType.COLLECTIVE },
      oldEventType: { children: [] },
      children: [buildChildInput(2)],
      prisma: prismaMock,
    });

    expect(res).toEqual({ message: "Not a managed event type" });
    expect(prismaMock.eventType.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("creates children for newly assigned users and propagates the parent's hidden value when locked", async () => {
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(buildParent({ hidden: true }) as never);

    const res = await handleChildrenEventTypes({
      eventTypeId: PARENT_ID,
      updatedEventType: { slug: "managed", schedulingType: SchedulingType.MANAGED },
      oldEventType: { children: [] },
      // Child says hidden:false, but the field is locked → parent's hidden:true wins.
      children: [buildChildInput(2, false)],
      prisma: prismaMock,
    });

    expect(res).toMatchObject({ newUserIds: [2], oldUserIds: [], deletedUserIds: [] });
    expect(prismaMock.eventType.create).toHaveBeenCalledTimes(1);
    const createArg = prismaMock.eventType.create.mock.calls[0][0];
    expect(createArg.data.hidden).toBe(true);
    expect(createArg.data.parent).toEqual({ connect: { id: PARENT_ID } });
    expect(createArg.data.owner).toEqual({ connect: { id: 2 } });
  });

  it("respects the child's own hidden value when the field is unlocked", async () => {
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(
      buildParent({
        hidden: false,
        metadata: { managedEventConfig: { unlockedFields: { hidden: true } } },
      }) as never
    );

    await handleChildrenEventTypes({
      eventTypeId: PARENT_ID,
      updatedEventType: { slug: "managed", schedulingType: SchedulingType.MANAGED },
      oldEventType: { children: [] },
      children: [buildChildInput(2, true)],
      prisma: prismaMock,
    });

    const createArg = prismaMock.eventType.create.mock.calls[0][0];
    // Unlocked → the child's own hidden value (true) is used.
    expect(createArg.data.hidden).toBe(true);
  });

  it("updates existing children with the parent's hidden value when locked", async () => {
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(buildParent({ hidden: true }) as never);

    const res = await handleChildrenEventTypes({
      eventTypeId: PARENT_ID,
      updatedEventType: { slug: "managed", schedulingType: SchedulingType.MANAGED },
      oldEventType: { children: [{ userId: 2 }] },
      children: [buildChildInput(2, false)],
      prisma: prismaMock,
    });

    expect(res).toMatchObject({ newUserIds: [], oldUserIds: [2], deletedUserIds: [] });
    expect(prismaMock.eventType.create).not.toHaveBeenCalled();
    expect(prismaMock.eventType.updateMany).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.eventType.updateMany.mock.calls[0][0];
    expect(updateArg.where).toEqual({ parentId: PARENT_ID, userId: 2 });
    expect(updateArg.data.hidden).toBe(true);
  });

  it("deletes children for unassigned users", async () => {
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(buildParent() as never);

    const res = await handleChildrenEventTypes({
      eventTypeId: PARENT_ID,
      updatedEventType: { slug: "managed", schedulingType: SchedulingType.MANAGED },
      oldEventType: { children: [{ userId: 2 }, { userId: 3 }] },
      children: [buildChildInput(2)],
      prisma: prismaMock,
    });

    expect(res).toMatchObject({ deletedUserIds: [3] });
    expect(prismaMock.eventType.deleteMany).toHaveBeenCalledWith({
      where: { parentId: PARENT_ID, userId: { in: [3] } },
    });
  });

  it("syncs hidden to existing children on the quick-toggle path (no children payload)", async () => {
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(buildParent({ hidden: true }) as never);

    const res = await handleChildrenEventTypes({
      eventTypeId: PARENT_ID,
      updatedEventType: { slug: "managed", schedulingType: SchedulingType.MANAGED },
      oldEventType: { children: [{ userId: 2 }, { userId: 3 }] },
      children: undefined,
      prisma: prismaMock,
    });

    expect(res).toMatchObject({ syncedUserIds: [2, 3] });
    expect(prismaMock.eventType.updateMany).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.eventType.updateMany.mock.calls[0][0];
    expect(updateArg.where).toEqual({ parentId: PARENT_ID, userId: { in: [2, 3] } });
    expect(updateArg.data.hidden).toBe(true);
  });

  it("skips child creation when the assignee already owns an event with the same slug", async () => {
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(buildParent() as never);

    await handleChildrenEventTypes({
      eventTypeId: PARENT_ID,
      updatedEventType: { slug: "managed", schedulingType: SchedulingType.MANAGED },
      oldEventType: { children: [] },
      children: [
        {
          owner: { id: 2, name: "u2", email: "u2@example.com", eventTypeSlugs: ["managed"] },
          hidden: false,
        },
      ],
      prisma: prismaMock,
    });

    expect(prismaMock.eventType.create).not.toHaveBeenCalled();
  });
});
