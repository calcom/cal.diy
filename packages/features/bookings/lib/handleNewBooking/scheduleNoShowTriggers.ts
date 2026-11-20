import { DailyLocationType } from "@calcom/app-store/constants";
import dayjs from "@calcom/dayjs";
import tasker from "@calcom/features/tasker";
import getWebhooks from "@calcom/features/webhooks/lib/getWebhooks";
import { getNoShowTaskReferenceUid } from "@calcom/features/webhooks/lib/noShowTaskReference";
import { withReporting } from "@calcom/lib/sentryWrapper";
import { WebhookTriggerEvents } from "@calcom/prisma/enums";

type ScheduleNoShowTriggersArgs = {
  booking: {
    startTime: Date;
    id: number;
    location: string | null;
    uid: string;
  };
  triggerForUser?: number | true | null;
  organizerUser: { id: number | null };
  eventTypeId: number | null;
  teamId?: number | null;
  orgId?: number | null;
  oAuthClientId?: string | null;
  isDryRun?: boolean;
};

const _scheduleNoShowTriggers = async (args: ScheduleNoShowTriggersArgs) => {
  const {
    booking,
    triggerForUser,
    organizerUser,
    eventTypeId,
    teamId,
    orgId,
    oAuthClientId,
    isDryRun = false,
  } = args;

  const isCalVideoLocation = booking.location === DailyLocationType || booking.location?.trim() === "";

  if (isDryRun || !isCalVideoLocation) return;

  // Add task for automatic no show in cal video
  const noShowPromises: Promise<any>[] = [];

  const subscribersHostsNoShowStarted = await getWebhooks({
    userId: triggerForUser ? organizerUser.id : null,
    eventTypeId,
    triggerEvent: WebhookTriggerEvents.AFTER_HOSTS_CAL_VIDEO_NO_SHOW,
    teamId,
    orgId,
    oAuthClientId,
  });

  noShowPromises.push(
    ...subscribersHostsNoShowStarted.map((webhook) => {
      if (booking?.startTime && webhook.time && webhook.timeUnit) {
        const scheduledAt = dayjs(booking.startTime)
          .add(webhook.time, webhook.timeUnit.toLowerCase() as dayjs.ManipulateType)
          .toDate();
        return tasker.create(
          "triggerHostNoShowWebhook",
          {
            triggerEvent: WebhookTriggerEvents.AFTER_HOSTS_CAL_VIDEO_NO_SHOW,
            bookingId: booking.id,
            // Prevents null values from being serialized
            webhook: { ...webhook, time: webhook.time, timeUnit: webhook.timeUnit },
          },
          { scheduledAt, referenceUid: getNoShowTaskReferenceUid(booking.uid, webhook.id) }
        );
      }
      return Promise.resolve();
    })
  );

  const subscribersGuestsNoShowStarted = await getWebhooks({
    userId: triggerForUser ? organizerUser.id : null,
    eventTypeId,
    triggerEvent: WebhookTriggerEvents.AFTER_GUESTS_CAL_VIDEO_NO_SHOW,
    teamId,
    orgId,
    oAuthClientId,
  });

  noShowPromises.push(
    ...subscribersGuestsNoShowStarted.map((webhook) => {
      if (booking?.startTime && webhook.time && webhook.timeUnit) {
        const scheduledAt = dayjs(booking.startTime)
          .add(webhook.time, webhook.timeUnit.toLowerCase() as dayjs.ManipulateType)
          .toDate();

        return tasker.create(
          "triggerGuestNoShowWebhook",
          {
            triggerEvent: WebhookTriggerEvents.AFTER_GUESTS_CAL_VIDEO_NO_SHOW,
            bookingId: booking.id,
            // Prevents null values from being serialized
            webhook: { ...webhook, time: webhook.time, timeUnit: webhook.timeUnit },
          },
          { scheduledAt, referenceUid: getNoShowTaskReferenceUid(booking.uid, webhook.id) }
        );
      }

      return Promise.resolve();
    })
  );

  await Promise.all(noShowPromises);
};

export const scheduleNoShowTriggers = withReporting(_scheduleNoShowTriggers, "scheduleNoShowTriggers");
