import { randomUUID } from "node:crypto";
import { DailyLocationType } from "@calcom/app-store/constants";
import { scheduleNoShowTriggers } from "@calcom/features/bookings/lib/handleNewBooking/scheduleNoShowTriggers";
import prisma from "@calcom/prisma";
import type { Webhook } from "@calcom/prisma/client";
import { TimeUnit, WebhookTriggerEvents } from "@calcom/prisma/enums";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getNoShowTaskReferenceUid } from "./noShowTaskReference";
import {
  cancelNoShowTasksForBooking,
  scheduleNoShowTaskForBooking,
  updateTriggerForExistingBookings,
} from "./scheduleTrigger";

describe("no-show subscriber tasks", () => {
  const bookingUid = randomUUID();
  const otherBookingUid = `${bookingUid}-other`;
  const bookingUids = [bookingUid, otherBookingUid];
  const webhookIds = [randomUUID(), randomUUID()];
  const hostTrigger = WebhookTriggerEvents.AFTER_HOSTS_CAL_VIDEO_NO_SHOW;
  const guestTrigger = WebhookTriggerEvents.AFTER_GUESTS_CAL_VIDEO_NO_SHOW;
  let userId: number;
  let webhooks: Webhook[];
  let booking: { id: number; uid: string; startTime: Date; location: string | null };

  const taskScope = { OR: webhookIds.map((id) => ({ payload: { contains: id } })) };

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `${bookingUid}@example.com`, username: bookingUid },
      select: { id: true },
    });
    userId = user.id;
    webhooks = await Promise.all(
      webhookIds.map((id) =>
        prisma.webhook.create({
          data: {
            id,
            userId,
            subscriberUrl: `https://example.com/${id}`,
            eventTriggers: [hostTrigger, guestTrigger],
            active: true,
            time: 5,
            timeUnit: TimeUnit.MINUTE,
          },
          select: {
            id: true,
            userId: true,
            teamId: true,
            eventTypeId: true,
            platformOAuthClientId: true,
            subscriberUrl: true,
            payloadTemplate: true,
            createdAt: true,
            active: true,
            eventTriggers: true,
            appId: true,
            secret: true,
            platform: true,
            time: true,
            timeUnit: true,
            version: true,
          },
        })
      )
    );
    booking = await prisma.booking.create({
      data: {
        uid: bookingUid,
        userId,
        title: "No-show subscriber test",
        status: "ACCEPTED",
        startTime: new Date(Date.now() + 60 * 60 * 1000),
        endTime: new Date(Date.now() + 90 * 60 * 1000),
        location: DailyLocationType,
      },
      select: { id: true, uid: true, startTime: true, location: true },
    });
  });

  beforeEach(async () => {
    await prisma.task.deleteMany({ where: taskScope });
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: taskScope });
    await prisma.booking.deleteMany({ where: { uid: { in: bookingUids } } });
    await prisma.webhook.deleteMany({ where: { id: { in: webhookIds } } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });

  async function seedTasks() {
    for (const uid of bookingUids) {
      for (const type of ["triggerHostNoShowWebhook", "triggerGuestNoShowWebhook", "sendWebhook"]) {
        for (const webhook of webhooks) {
          await prisma.task.create({
            data: {
              type,
              referenceUid: getNoShowTaskReferenceUid(uid, webhook.id),
              payload: JSON.stringify({ bookingUid: uid, webhook: { id: webhook.id } }),
            },
          });
        }
        await prisma.task.create({
          data: {
            type,
            referenceUid: uid,
            payload: JSON.stringify({ bookingUid: uid, webhook: { id: webhooks[0].id } }),
          },
        });
      }
    }
  }

  it("persists both host and guest tasks for every initial subscriber", async () => {
    await scheduleNoShowTriggers({
      booking,
      organizerUser: { id: userId },
      eventTypeId: null,
      triggerForUser: true,
    });
    expect(
      await prisma.task.count({
        where: { referenceUid: { in: webhookIds.map((id) => getNoShowTaskReferenceUid(bookingUid, id)) } },
      })
    ).toBe(4);
  });

  it("uses the same subscriber keys when scheduling existing bookings", async () => {
    for (const webhook of webhooks) {
      await scheduleNoShowTaskForBooking(booking, webhook, hostTrigger);
      await scheduleNoShowTaskForBooking(booking, webhook, guestTrigger);
    }
    expect(
      await prisma.task.count({
        where: { referenceUid: { in: webhookIds.map((id) => getNoShowTaskReferenceUid(bookingUid, id)) } },
      })
    ).toBe(4);
  });

  it("cancels legacy and subscriber tasks without deleting other bookings or task types", async () => {
    await seedTasks();
    await cancelNoShowTasksForBooking({ bookingUid });
    const remaining = await prisma.task.findMany({
      where: taskScope,
      select: { type: true, referenceUid: true },
    });
    expect(remaining).toHaveLength(12);
    expect(
      remaining
        .filter(
          (task) =>
            task.referenceUid === bookingUid ||
            webhookIds.some((id) => task.referenceUid === getNoShowTaskReferenceUid(bookingUid, id))
        )
        .every((task) => task.type === "sendWebhook")
    ).toBe(true);
  });

  it("removes a trigger only for the edited subscriber, including its legacy task", async () => {
    await seedTasks();
    await updateTriggerForExistingBookings(webhooks[0], [hostTrigger, guestTrigger], [guestTrigger]);
    expect(await prisma.task.count({ where: taskScope })).toBe(16);
    expect(
      await prisma.task.count({
        where: {
          type: "triggerHostNoShowWebhook",
          referenceUid: getNoShowTaskReferenceUid(bookingUid, webhooks[1].id),
        },
      })
    ).toBe(1);
    expect(
      await prisma.task.count({
        where: {
          type: "triggerGuestNoShowWebhook",
          referenceUid: getNoShowTaskReferenceUid(bookingUid, webhooks[0].id),
        },
      })
    ).toBe(1);
  });

  it("deactivates one subscriber without cancelling a different subscriber's legacy task", async () => {
    await seedTasks();
    await cancelNoShowTasksForBooking({ webhook: webhooks[1] });
    expect(await prisma.task.count({ where: taskScope })).toBe(16);
    expect(await prisma.task.count({ where: { referenceUid: bookingUid } })).toBe(3);
    expect(
      await prisma.task.count({
        where: { type: "sendWebhook", referenceUid: getNoShowTaskReferenceUid(bookingUid, webhooks[1].id) },
      })
    ).toBe(1);
  });
});
