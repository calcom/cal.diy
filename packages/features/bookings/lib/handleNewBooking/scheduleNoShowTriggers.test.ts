import { DailyLocationType } from "@calcom/app-store/constants";
import tasker from "@calcom/features/tasker";
import type { WebhookSubscriber } from "@calcom/features/webhooks/lib/dto/types";
import getWebhooks from "@calcom/features/webhooks/lib/getWebhooks";
import { DEFAULT_WEBHOOK_VERSION } from "@calcom/features/webhooks/lib/interface/IWebhookRepository";
import { TimeUnit, WebhookTriggerEvents } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleNoShowTriggers } from "./scheduleNoShowTriggers";

vi.mock("@calcom/features/tasker", () => ({ default: { create: vi.fn() } }));
vi.mock("@calcom/features/webhooks/lib/getWebhooks", () => ({ default: vi.fn() }));

describe("scheduleNoShowTriggers", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    [WebhookTriggerEvents.AFTER_HOSTS_CAL_VIDEO_NO_SHOW, "triggerHostNoShowWebhook"],
    [WebhookTriggerEvents.AFTER_GUESTS_CAL_VIDEO_NO_SHOW, "triggerGuestNoShowWebhook"],
  ] as const)("persists a task for every subscriber to %s", async (triggerEvent, taskType) => {
    const subscribers: WebhookSubscriber[] = ["first", "second"].map((id) => ({
      id,
      subscriberUrl: `https://example.com/${id}`,
      payloadTemplate: null,
      appId: null,
      secret: null,
      time: 5,
      timeUnit: TimeUnit.MINUTE,
      eventTriggers: [triggerEvent],
      version: DEFAULT_WEBHOOK_VERSION,
    }));
    vi.mocked(getWebhooks).mockImplementation(async (options) =>
      options.triggerEvent === triggerEvent ? subscribers : []
    );
    const references = new Set<string>();
    vi.mocked(tasker.create).mockImplementation(async (type, _payload, options) => {
      const key = `${type}:${options?.referenceUid}`;
      if (references.has(key)) throw new Error("Duplicate task reference");
      references.add(key);
      return key;
    });

    await scheduleNoShowTriggers({
      booking: {
        id: 123,
        uid: "booking-uid",
        startTime: new Date("2026-10-10T10:00:00Z"),
        location: DailyLocationType,
      },
      organizerUser: { id: 1 },
      eventTypeId: 2,
    });

    expect(references.size).toBe(2);
    for (const subscriber of subscribers) {
      expect(tasker.create).toHaveBeenCalledWith(
        taskType,
        expect.objectContaining({ bookingId: 123, webhook: subscriber }),
        expect.objectContaining({ scheduledAt: new Date("2026-10-10T10:05:00Z") })
      );
    }
  });
});
