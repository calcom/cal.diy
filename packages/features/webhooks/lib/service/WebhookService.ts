import { createHmac } from "node:crypto";
import process from "node:process";
import { WebhookTriggerEvents } from "@calcom/prisma/enums";
import { WEBHOOK_REQUEST_TIMEOUT_MS } from "../constants";
import type { WebhookDeliveryResult, WebhookSubscriber } from "../dto/types";
import type { WebhookPayload } from "../factory/types";
import type { ILogger, ITasker } from "../interface/infrastructure";
import type { IWebhookRepository, IWebhookService } from "../interface/services";

export class WebhookService implements IWebhookService {
  private readonly log: ILogger;

  constructor(
    private readonly repository: IWebhookRepository,
    private readonly tasker: ITasker,
    logger: ILogger
  ) {
    this.log = logger.getSubLogger({ prefix: ["[WebhookService]"] });
  }

  protected async sendWebhook(
    trigger: WebhookTriggerEvents,
    payload: WebhookPayload,
    subscriber: WebhookSubscriber
  ): Promise<WebhookDeliveryResult> {
    try {
      // TODO: Ideally we should inject this flag as well. Would be awesome when we would be able to unit test without mocking env variables too. Also with trigger.dev, this would be further worked on, so we can leave this as is for now
      if (process.env.TASKER_ENABLE_WEBHOOKS === "1") {
        return await this.scheduleWebhook(trigger, payload, subscriber);
      } else {
        return await this.sendWebhookDirectly(trigger, payload, subscriber);
      }
    } catch (error) {
      return {
        ok: false,
        status: 0,
        message: error instanceof Error ? error.message : String(error),
        duration: 0,
        subscriberUrl: subscriber.subscriberUrl,
        webhookId: subscriber.id,
      };
    }
  }

  private async scheduleWebhook(
    trigger: WebhookTriggerEvents,
    payload: WebhookPayload,
    subscriber: WebhookSubscriber
  ): Promise<WebhookDeliveryResult> {
    if (!this.tasker) {
      throw new Error("Tasker not injected - ensure proper DI configuration");
    }

    await this.tasker.create(
      "sendWebhook",
      JSON.stringify({
        secretKey: subscriber.secret,
        triggerEvent: trigger,
        createdAt: new Date().toISOString(),
        webhook: subscriber,
        data: payload.payload,
      })
    );

    return {
      ok: true,
      status: 200,
      message: "Webhook scheduled successfully",
      duration: 0,
      subscriberUrl: subscriber.subscriberUrl,
      webhookId: subscriber.id,
    };
  }

  private async sendWebhookDirectly(
    trigger: WebhookTriggerEvents,
    payload: WebhookPayload,
    subscriber: WebhookSubscriber
  ): Promise<WebhookDeliveryResult> {
    const { subscriberUrl, payloadTemplate } = subscriber;
    if (!subscriberUrl) throw new Error("Missing subscriber URL");

    const contentType =
      !payloadTemplate || this.isJsonTemplate(payloadTemplate)
        ? "application/json"
        : "application/x-www-form-urlencoded";

    const body = JSON.stringify({
      triggerEvent: trigger,
      createdAt: payload.createdAt,
      payload: payload.payload,
    });

    const signature = subscriber.secret
      ? createHmac("sha256", subscriber.secret).update(body).digest("hex")
      : "no-secret-provided";

    const response = await fetch(subscriberUrl, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "X-Cal-Signature-256": signature,
        "X-Cal-Webhook-Version": subscriber.version,
      },
      redirect: "manual",
      body,
      signal: AbortSignal.timeout(WEBHOOK_REQUEST_TIMEOUT_MS),
    });

    const responseText = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      message: responseText || undefined,
      duration: 0,
      subscriberUrl: subscriberUrl,
      webhookId: subscriber.id,
    };
  }

  private isJsonTemplate(template: string | null): boolean {
    if (!template) return true;
    try {
      JSON.parse(template);
      return true;
    } catch {
      return false;
    }
  }

  async getSubscribers(options: Parameters<IWebhookRepository["getSubscribers"]>[0]) {
    return this.repository.getSubscribers(options);
  }

  async processWebhooks(
    trigger: WebhookTriggerEvents,
    payload: WebhookPayload,
    subscribers: WebhookSubscriber[]
  ): Promise<void> {
    if (subscribers.length === 0) {
      this.log.debug("No subscribers to process for trigger:", { trigger });
      return;
    }

    const promises = subscribers.map(async (subscriber) => {
      try {
        this.log.debug("Processing webhook", {
          trigger,
          webhookId: subscriber.id,
          subscriberUrl: subscriber.subscriberUrl,
        });

        const result = await this.sendWebhook(trigger, payload, subscriber);

        if (result.ok) {
          this.log.debug(`Webhook sent successfully`, {
            trigger,
            webhookId: subscriber.id,
            statusCode: result.status,
          });
        } else {
          this.log.error(`Webhook failed`, {
            error: result.message,
            trigger,
            webhookId: subscriber.id,
            statusCode: result.status,
          });
        }
      } catch (err) {
        this.log.error("Error sending webhook", {
          error: err instanceof Error ? err.message : String(err),
          trigger,
          webhookId: subscriber.id,
        });
        // Re-throw to ensure Promise.allSettled captures the failure
        throw err;
      }
    });

    // Use Promise.allSettled to prevent single webhook failure from killing entire processor
    const results = await Promise.allSettled(promises);

    // Log summary for monitoring
    const successCount = results.filter((result) => result.status === "fulfilled").length;
    const failureCount = results.filter((result) => result.status === "rejected").length;

    this.log.info(`Webhook processing completed for ${trigger}`, {
      totalSubscribers: subscribers.length,
      successful: successCount,
      failed: failureCount,
    });

    // Log individual failures for debugging
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const subscriber = subscribers[index];
        this.log.error(`Webhook processing failed for subscriber`, {
          trigger,
          webhookId: subscriber?.id,
          subscriberUrl: subscriber?.subscriberUrl,
          error: result.reason,
        });
      }
    });
  }

  async scheduleTimeBasedWebhook(
    trigger: WebhookTriggerEvents,
    scheduledAt: Date,
    bookingData: {
      id: number;
      uid: string;
      eventTypeId: number | null;
      userId: number | null;
      teamId?: number | null;
      responses?: Record<string, unknown>;
    },
    subscriber: WebhookSubscriber,
    evt: Record<string, unknown>,
    isDryRun = false
  ): Promise<void> {
    if (isDryRun) return;

    try {
      if (!this.tasker) {
        throw new Error("Tasker not injected - ensure proper DI configuration");
      }
      await this.tasker.create(
        "sendWebhook",
        JSON.stringify({
          secretKey: subscriber.secret,
          triggerEvent: trigger,
          createdAt: new Date().toISOString(),
          webhook: subscriber,
          data: {
            bookingId: bookingData.id,
            eventTypeId: bookingData.eventTypeId,
            userId: bookingData.userId,
            teamId: bookingData.teamId,
            responses: bookingData.responses,
            evt,
          },
        }),
        { scheduledAt, referenceUid: `booking-${bookingData.id}-${trigger}` }
      );
    } catch (error) {
      this.log.error("Failed to schedule time-based webhook", {
        trigger,
        bookingId: bookingData.id,
        subscriberUrl: subscriber.subscriberUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async cancelScheduledWebhooks(
    bookingId: number,
    triggers: WebhookTriggerEvents[] = [
      WebhookTriggerEvents.MEETING_STARTED,
      WebhookTriggerEvents.MEETING_ENDED,
    ],
    isDryRun = false
  ): Promise<void> {
    if (isDryRun) return;

    try {
      if (!this.tasker) {
        throw new Error("Tasker not injected - ensure proper DI configuration");
      }
      const cancellationPromises = triggers.map(async (trigger) => {
        const referenceUid = `booking-${bookingId}-${trigger}`;
        try {
          await this.tasker.cancelWithReference(referenceUid, "sendWebhook");
          return { trigger, success: true };
        } catch (error) {
          this.log.warn(`Failed to cancel webhook for trigger ${trigger}:`, {
            error: error instanceof Error ? error.message : String(error),
          });
          return { trigger, success: false, error };
        }
      });

      const results = await Promise.allSettled(cancellationPromises);

      // Log any failures for monitoring
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length > 0) {
        this.log.warn(`Some webhook cancellations failed:`, { failureCount: failures.length });
      }
    } catch (error) {
      this.log.error("Failed to cancel scheduled webhooks", {
        bookingId,
        triggers,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async scheduleDelayedWebhooks(
    trigger: WebhookTriggerEvents,
    payload: WebhookPayload,
    scheduledAt: Date,
    options?: { teamId?: number | number[] | null; orgId?: number | null },
    subscribers?: WebhookSubscriber[],
    isDryRun = false
  ): Promise<void> {
    if (isDryRun) return;

    const webhookSubscribers =
      subscribers ||
      (await this.repository.getSubscribers({
        userId: null,
        eventTypeId: null,
        triggerEvent: trigger,
        teamId: options?.teamId,
        orgId: options?.orgId,
        oAuthClientId: undefined,
      }));

    if (!webhookSubscribers.length) return;

    try {
      if (!this.tasker) {
        throw new Error("Tasker not injected - ensure proper DI configuration");
      }
      const createdAt = new Date().toISOString();

      await Promise.all(
        webhookSubscribers.map((subscriber) =>
          this.tasker.create(
            "sendWebhook",
            JSON.stringify({
              secretKey: subscriber.secret,
              triggerEvent: trigger,
              createdAt,
              webhook: subscriber,
              data: payload.payload,
            }),
            { scheduledAt }
          )
        )
      );
    } catch (error) {
      this.log.error("Failed to schedule delayed webhooks", {
        trigger,
        scheduledAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
