import { describe, it, expect, vi, beforeEach } from "vitest";
import { MembershipRole } from "@calcom/prisma/enums";
import { TRPCError } from "@trpc/server";

vi.mock("@calcom/prisma", () => ({
  prisma: {
    webhook: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    membership: {
      findFirst: vi.fn(),
    },
    eventType: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@calcom/features/webhooks/lib/scheduleTrigger", () => ({
  updateTriggerForExistingBookings: vi.fn().mockResolvedValue(undefined),
  deleteWebhookScheduledTriggers: vi.fn().mockResolvedValue(undefined),
  cancelNoShowTasksForBooking: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@calcom/lib/ssrfProtection", () => ({
  validateUrlForSSRFSync: vi.fn().mockReturnValue({ isValid: true }),
}));

import { prisma } from "@calcom/prisma";
import { editHandler } from "./edit.handler";

describe("Webhook Authorization & IDOR Security Suite (#29982)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("permits team ADMIN to edit a team webhook", async () => {
    vi.mocked(prisma.webhook.findUnique).mockResolvedValue({
      id: "webhook-team-1",
      userId: null,
      teamId: 10,
      subscriberUrl: "https://example.com/webhook",
      eventTypeId: null,
      platform: false,
      active: true,
      eventTriggers: [],
    } as any);

    vi.mocked(prisma.membership.findFirst).mockResolvedValue({
      id: 1,
      teamId: 10,
      userId: 100,
      accepted: true,
      role: MembershipRole.ADMIN,
    } as any);

    vi.mocked(prisma.webhook.update).mockResolvedValue({
      id: "webhook-team-1",
      subscriberUrl: "https://example.com/updated",
      eventTriggers: [],
    } as any);

    const result = await editHandler({
      ctx: { user: { id: 100, role: "USER" } as any },
      input: {
        id: "webhook-team-1",
        subscriberUrl: "https://example.com/updated",
        eventTriggers: [],
      } as any,
    });

    expect(result).toBeDefined();
    expect(prisma.membership.findFirst).toHaveBeenCalledWith({
      where: {
        teamId: 10,
        userId: 100,
        accepted: true,
        role: { in: [MembershipRole.ADMIN, MembershipRole.OWNER] },
      },
    });
  });

  it("throws FORBIDDEN when a regular team MEMBER attempts to edit a team webhook", async () => {
    vi.mocked(prisma.webhook.findUnique).mockResolvedValue({
      id: "webhook-team-1",
      userId: null,
      teamId: 10,
      subscriberUrl: "https://example.com/webhook",
      eventTypeId: null,
      platform: false,
      active: true,
      eventTriggers: [],
    } as any);

    vi.mocked(prisma.membership.findFirst).mockResolvedValue(null);

    await expect(
      editHandler({
        ctx: { user: { id: 101, role: "USER" } as any },
        input: {
          id: "webhook-team-1",
          subscriberUrl: "https://attacker.example.com",
          eventTriggers: [],
        } as any,
      })
    ).rejects.toThrow(TRPCError);
  });

  it("permits owner of a personal webhook without teamId", async () => {
    vi.mocked(prisma.webhook.findUnique).mockResolvedValue({
      id: "webhook-user-1",
      userId: 100,
      teamId: null,
      subscriberUrl: "https://example.com/webhook",
      eventTypeId: null,
      platform: false,
      active: true,
      eventTriggers: [],
    } as any);

    vi.mocked(prisma.webhook.update).mockResolvedValue({
      id: "webhook-user-1",
      subscriberUrl: "https://example.com/updated",
      eventTriggers: [],
    } as any);

    const result = await editHandler({
      ctx: { user: { id: 100, role: "USER" } as any },
      input: {
        id: "webhook-user-1",
        subscriberUrl: "https://example.com/updated",
        eventTriggers: [],
      } as any,
    });

    expect(result).toBeDefined();
    expect(prisma.membership.findFirst).not.toHaveBeenCalled();
  });
});
