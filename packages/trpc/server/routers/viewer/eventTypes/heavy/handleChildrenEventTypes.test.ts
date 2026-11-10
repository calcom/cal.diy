import type { PrismaClient } from "@calcom/prisma";
import { SchedulingType } from "@calcom/prisma/enums";
import { TRPCError } from "@trpc/server";
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
  teamId: null,
  ...overrides,
});

const buildChildInput = (id: number, hidden?: boolean) => ({
  owner: { id, name: `user-${id}`, email: `user-${id}@example.com`, eventTypeSlugs: [] as string[] },
  ...(hidden !== undefined ? { hidden } : {}),
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
      // Child says hidden:false, but the field is locked -> parent's hidden:true wins.
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

  it("rejects new child owners who are not members of the parent team", async () => {
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(buildParent({ teamId: 99 }) as never);
    prismaMock.membership.findMany.mockResolvedValue([] as never);

    await expect(
      handleChildrenEventTypes({
        eventTypeId: PARENT_ID,
        updatedEventType: { slug: "managed", schedulingType: SchedulingType.MANAGED },
        oldEventType: { children: [] },
        children: [buildChildInput(2)],
        prisma: prismaMock,
      })
    ).rejects.toThrowError(TRPCError);

    expect(prismaMock.eventType.create).not.toHaveBeenCalled();
  });

  it("allows new child owners who are accepted members of the parent team", async () => {
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(buildParent({ teamId: 99 }) as never);
    prismaMock.membership.findMany.mockResolvedValue([{ userId: 2 }] as never);

    const res = await handleChildrenEventTypes({
      eventTypeId: PARENT_ID,
      updatedEventType: { slug: "managed", schedulingType: SchedulingType.MANAGED },
      oldEventType: { children: [] },
      children: [buildChildInput(2)],
      prisma: prismaMock,
    });

    expect(res).toMatchObject({ newUserIds: [2] });
    expect(prismaMock.eventType.create).toHaveBeenCalledTimes(1);
  });

  it("respects the child's own hidden value when the field is unlocked during creation", async () => {
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
    // Unlocked -> the child's own hidden value (true) is used.
    expect(createArg.data.hidden).toBe(true);
  });

  it("updates existing children with the parent's hidden value when locked", async () => {
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(buildParent({ hidden: true }) as never);
    prismaMock.eventType.findMany.mockResolvedValue([
      { id: 10, userId: 2, metadata: {}, hidden: false },
    ] as never);

    const res = await handleChildrenEventTypes({
      eventTypeId: PARENT_ID,
      updatedEventType: { slug: "managed", schedulingType: SchedulingType.MANAGED },
      oldEventType: { children: [{ userId: 2 }] },
      children: [buildChildInput(2, false)],
      prisma: prismaMock,
    });

    expect(res).toMatchObject({ newUserIds: [], oldUserIds: [2], deletedUserIds: [] });
    expect(prismaMock.eventType.create).not.toHaveBeenCalled();
    expect(prismaMock.eventType.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.eventType.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 10 });
    expect(updateArg.data.hidden).toBe(true);
  });

  it("preserves child's existing hidden value when unlocked during existing children update with omitted hidden", async () => {
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(
      buildParent({
        hidden: true,
        metadata: { managedEventConfig: { unlockedFields: { hidden: true } } },
      }) as never
    );
    prismaMock.eventType.findMany.mockResolvedValue([
      { id: 10, userId: 2, metadata: {}, hidden: false },
    ] as never);

    const res = await handleChildrenEventTypes({
      eventTypeId: PARENT_ID,
      updatedEventType: { slug: "managed", schedulingType: SchedulingType.MANAGED },
      oldEventType: { children: [{ userId: 2 }] },
      // Stale parent form save omitting hidden; child's hidden must not be overwritten
      children: [buildChildInput(2)],
      prisma: prismaMock,
    });

    expect(res).toMatchObject({ newUserIds: [], oldUserIds: [2], deletedUserIds: [] });
    expect(prismaMock.eventType.create).not.toHaveBeenCalled();
    expect(prismaMock.eventType.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.eventType.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 10 });
    // updateArg.data must NOT contain hidden when unlocked and omitted
    expect(updateArg.data).not.toHaveProperty("hidden");
  });

  it("preserves child-specific app configurations and integration credentials when updating metadata", async () => {
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(
      buildParent({
        metadata: {
          managedEventConfig: { unlockedFields: { hidden: true } },
          parentProperty: "inherited",
        },
      }) as never
    );
    prismaMock.eventType.findMany.mockResolvedValue([
      {
        id: 10,
        userId: 2,
        metadata: {
          apps: {
            stripe: { apiKey: "sk_test_123" },
          },
        },
        hidden: false,
      },
    ] as never);

    await handleChildrenEventTypes({
      eventTypeId: PARENT_ID,
      updatedEventType: { slug: "managed", schedulingType: SchedulingType.MANAGED },
      oldEventType: { children: [{ userId: 2 }] },
      children: [buildChildInput(2)],
      prisma: prismaMock,
    });

    expect(prismaMock.eventType.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.eventType.update.mock.calls[0][0];
    expect(updateArg.data.metadata).toMatchObject({
      apps: {
        stripe: { apiKey: "sk_test_123" },
      },
      parentProperty: "inherited",
      managedEventConfig: { unlockedFields: { hidden: true } },
    });
  });

  it("deletes children for unassigned users", async () => {
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(buildParent() as never);
    prismaMock.eventType.findMany.mockResolvedValue([
      { id: 10, userId: 2, metadata: {}, hidden: false },
    ] as never);

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

  it("does not overwrite hidden on quick-toggle path when hidden is unlocked", async () => {
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(
      buildParent({
        hidden: true,
        metadata: { managedEventConfig: { unlockedFields: { hidden: true } } },
      }) as never
    );

    const res = await handleChildrenEventTypes({
      eventTypeId: PARENT_ID,
      updatedEventType: { slug: "managed", schedulingType: SchedulingType.MANAGED },
      oldEventType: { children: [{ userId: 2 }] },
      children: undefined,
      prisma: prismaMock,
    });

    expect(res).toMatchObject({ syncedUserIds: [2] });
    expect(prismaMock.eventType.updateMany).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.eventType.updateMany.mock.calls[0][0];
    expect(updateArg.data).not.toHaveProperty("hidden");
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
