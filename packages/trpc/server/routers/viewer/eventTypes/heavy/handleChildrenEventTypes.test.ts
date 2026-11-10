import type { PrismaClient } from "@calcom/prisma";
import { SchedulingType } from "@calcom/prisma/enums";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it } from "vitest";
import { type DeepMockProxy, mockDeep, mockReset } from "vitest-mock-extended";
import { childSchema } from "../types";
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
  teamId: 1,
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
    // By default, simulate accepted team members for team 1
    prismaMock.membership.findMany.mockResolvedValue([{ userId: 2 }, { userId: 3 }] as never);
    // Pass-through transaction mock
    prismaMock.$transaction.mockImplementation(
      (promises) => Promise.all(promises as Promise<unknown>[]) as never
    );
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

  it("rejects assigning new children if parent event type has no team", async () => {
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(buildParent({ teamId: null }) as never);

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

  it("updates existing children with the parent's hidden value when locked via transaction", async () => {
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
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.eventType.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.eventType.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 10 });
    expect(updateArg.data.hidden).toBe(true);
  });

  it("regression: preserves child visibility when a stale parent form omits hidden, and payload validates against schema", async () => {
    // Child payload from stale parent form where hidden is omitted
    const staleChildPayload = buildChildInput(2);
    // Ensure the payload is accepted by childSchema
    const parseResult = childSchema.safeParse(staleChildPayload);
    expect(parseResult.success).toBe(true);

    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(
      buildParent({
        hidden: true,
        metadata: { managedEventConfig: { unlockedFields: { hidden: true } } },
      }) as never
    );
    // Assignee changed visibility on their child event type to false after parent form loaded
    prismaMock.eventType.findMany.mockResolvedValue([
      { id: 10, userId: 2, metadata: {}, hidden: false },
    ] as never);

    const res = await handleChildrenEventTypes({
      eventTypeId: PARENT_ID,
      updatedEventType: { slug: "managed", schedulingType: SchedulingType.MANAGED },
      oldEventType: { children: [{ userId: 2 }] },
      children: [staleChildPayload],
      prisma: prismaMock,
    });

    expect(res).toMatchObject({ newUserIds: [], oldUserIds: [2], deletedUserIds: [] });
    expect(prismaMock.eventType.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.eventType.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.eventType.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 10 });
    // Hidden must NOT be overwritten by the parent save because hidden is unlocked and omitted
    expect(updateArg.data).not.toHaveProperty("hidden");
  });

  it("applies explicit visibility edit for existing child when hidden is unlocked", async () => {
    const childPayload = buildChildInput(2, true);
    expect(childSchema.safeParse(childPayload).success).toBe(true);

    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(
      buildParent({
        hidden: false,
        metadata: { managedEventConfig: { unlockedFields: { hidden: true } } },
      }) as never
    );
    prismaMock.eventType.findMany.mockResolvedValue([
      { id: 10, userId: 2, metadata: {}, hidden: false },
    ] as never);

    await handleChildrenEventTypes({
      eventTypeId: PARENT_ID,
      updatedEventType: { slug: "managed", schedulingType: SchedulingType.MANAGED },
      oldEventType: { children: [{ userId: 2 }] },
      children: [childPayload],
      prisma: prismaMock,
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.eventType.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.eventType.update.mock.calls[0][0];
    expect(updateArg.data.hidden).toBe(true);
  });

  it("preserves child-specific app configurations and integration credentials when updating metadata", async () => {
    prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(
      buildParent({
        metadata: {
          managedEventConfig: { unlockedFields: { hidden: true } },
          parentProperty: "inherited",
          apps: {
            stripe: { paymentOption: "HOLD", currency: "usd" },
          },
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
            zoom: { credentialId: "zoom_cred_1" },
          },
          customChildField: "preserved",
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

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.eventType.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.eventType.update.mock.calls[0][0];
    expect(updateArg.data.metadata).toMatchObject({
      apps: {
        stripe: { apiKey: "sk_test_123", paymentOption: "HOLD", currency: "usd" },
        zoom: { credentialId: "zoom_cred_1" },
      },
      customChildField: "preserved",
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
