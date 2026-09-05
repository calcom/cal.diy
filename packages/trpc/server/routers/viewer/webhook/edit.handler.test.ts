import { TimeUnit } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindUnique,
  mockUpdate,
  mockUpdateTriggerForExistingBookings,
  mockDeleteWebhookScheduledTriggers,
  mockCancelNoShowTasksForBooking,
} = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateTriggerForExistingBookings: vi.fn(),
  mockDeleteWebhookScheduledTriggers: vi.fn(),
  mockCancelNoShowTasksForBooking: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  prisma: {
    webhook: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  },
}));

vi.mock("@calcom/lib/ssrfProtection", () => ({
  validateUrlForSSRFSync: vi.fn(() => ({ isValid: true })),
}));

vi.mock("@calcom/features/webhooks/lib/scheduleTrigger", () => ({
  updateTriggerForExistingBookings: mockUpdateTriggerForExistingBookings,
  deleteWebhookScheduledTriggers: mockDeleteWebhookScheduledTriggers,
  cancelNoShowTasksForBooking: mockCancelNoShowTasksForBooking,
}));

import { editHandler } from "./edit.handler";

const existingWebhook = {
  id: "webhook-1",
  userId: 4,
  teamId: null,
  eventTypeId: null,
  subscriberUrl: "https://example.com/hook",
  payloadTemplate: null,
  active: true,
  eventTriggers: ["AFTER_HOSTS_CAL_VIDEO_NO_SHOW"],
  secret: null,
  platform: false,
  time: 5,
  timeUnit: TimeUnit.MINUTE,
  version: "2021-10-20",
};

describe("editHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(existingWebhook);
    mockUpdate.mockImplementation(async ({ data }) => ({
      ...existingWebhook,
      ...data,
    }));
    mockUpdateTriggerForExistingBookings.mockResolvedValue(undefined);
    mockDeleteWebhookScheduledTriggers.mockResolvedValue(undefined);
    mockCancelNoShowTasksForBooking.mockResolvedValue(undefined);
  });

  it("does not clear time/timeUnit when a partial toggle omits them", async () => {
    await editHandler({
      ctx: { user: { id: 4, role: "USER" } },
      input: {
        id: existingWebhook.id,
        active: false,
        payloadTemplate: null,
      },
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: existingWebhook.id },
      data: {
        active: false,
        payloadTemplate: null,
      },
    });
    expect(mockUpdate.mock.calls[0][0].data).not.toHaveProperty("time");
    expect(mockUpdate.mock.calls[0][0].data).not.toHaveProperty("timeUnit");
  });

  it("still writes explicit time/timeUnit when the form sends them", async () => {
    await editHandler({
      ctx: { user: { id: 4, role: "USER" } },
      input: {
        id: existingWebhook.id,
        active: true,
        payloadTemplate: null,
        time: 15,
        timeUnit: "HOUR",
      },
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: existingWebhook.id },
      data: {
        active: true,
        payloadTemplate: null,
        time: 15,
        timeUnit: "HOUR",
      },
    });
  });
});
