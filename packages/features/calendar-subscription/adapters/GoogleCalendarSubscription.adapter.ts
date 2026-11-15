import type { calendar_v3 } from "@googleapis/calendar";
import { v4 as uuid } from "uuid";

import { CalendarAuth } from "@calcom/app-store/googlecalendar/lib/CalendarAuth";
import dayjs from "@calcom/dayjs";
import { CalendarCacheEventService } from "@calcom/features/calendar-subscription/lib/cache/CalendarCacheEventService";
import { timingSafeEqualStrings } from "@calcom/lib/crypto";
import logger from "@calcom/lib/logger";
import type { SelectedCalendar } from "@calcom/prisma/client";

import type {
  ICalendarSubscriptionPort,
  CalendarSubscriptionResult,
  CalendarSubscriptionEvent,
  CalendarSubscriptionEventItem,
  CalendarCredential,
} from "../lib/CalendarSubscriptionPort.interface";

const log = logger.getSubLogger({ prefix: ["GoogleCalendarSubscriptionAdapter"] });

/**
 * Google Calendar Subscription Adapter
 *
 * This adapter uses the Google Calendar API to create and manage calendar subscriptions
 * @see https://developers.google.com/google-apps/calendar/quickstart/nodejs
 */
export class GoogleCalendarSubscriptionAdapter implements ICalendarSubscriptionPort {
  private GOOGLE_WEBHOOK_TOKEN = process.env.GOOGLE_WEBHOOK_TOKEN;
  private GOOGLE_WEBHOOK_URL = `${
    process.env.GOOGLE_WEBHOOK_URL || process.env.NEXT_PUBLIC_WEBAPP_URL
  }/api/webhooks/calendar-subscription/google_calendar`;

  async validate(request: Request): Promise<boolean> {
    const token = request?.headers?.get("X-Goog-Channel-Token");
    if (!this.GOOGLE_WEBHOOK_TOKEN) {
      log.warn("GOOGLE_WEBHOOK_TOKEN not configured");
      return false;
    }
    if (!timingSafeEqualStrings(token, this.GOOGLE_WEBHOOK_TOKEN)) {
      log.warn("Invalid webhook token");
      return false;
    }
    return true;
  }

  async extractChannelId(request: Request): Promise<string | null> {
    const channelId = request?.headers?.get("X-Goog-Channel-ID");
    if (!channelId) {
      log.warn("Missing channel ID in webhook");
      return null;
    }
    return channelId;
  }

  async subscribe(
    selectedCalendar: SelectedCalendar,
    credential: CalendarCredential
  ): Promise<CalendarSubscriptionResult> {
    log.debug("Attempt to subscribe to Google Calendar", { externalId: selectedCalendar.externalId });

    const MONTH_IN_SECONDS = 60 * 60 * 24 * 30;

    const client = await this.getClient(credential);
    const result = await client.events.watch({
      calendarId: selectedCalendar.externalId,
      requestBody: {
        id: uuid(),
        type: "web_hook",
        address: this.GOOGLE_WEBHOOK_URL,
        token: this.GOOGLE_WEBHOOK_TOKEN,
        params: {
          ttl: MONTH_IN_SECONDS.toFixed(0),
        },
      },
    });

    const e = result.data?.expiration;
    const expiration = e ? new Date(/^\d+$/.test(e) ? +e : e) : null;

    return {
      provider: "google_calendar",
      id: result.data.id,
      resourceId: result.data.resourceId,
      resourceUri: result.data.resourceUri,
      expiration,
    };
  }
  async unsubscribe(selectedCalendar: SelectedCalendar, credential: CalendarCredential): Promise<void> {
    log.debug("Attempt to unsubscribe from Google Calendar", { externalId: selectedCalendar.externalId });

    const client = await this.getClient(credential);
    await client.channels
      .stop({
        requestBody: {
          id: selectedCalendar.channelId as string,
          resourceId: selectedCalendar.channelResourceId as string,
        },
      })
      .catch((err) => {
        log.error("Error unsubscribing from Google Calendar", err);
        throw err;
      });
  }

  async fetchEvents(
    selectedCalendar: SelectedCalendar,
    credential: CalendarCredential
  ): Promise<CalendarSubscriptionEvent> {
    log.info("Attempt to fetch events from Google Calendar", { externalId: selectedCalendar.externalId });
    const client = await this.getClient(credential);

    let syncToken = selectedCalendar.syncToken || undefined;
    let pageToken;

    const params: calendar_v3.Params$Resource$Events$List = {
      calendarId: selectedCalendar.externalId,
      pageToken,
      singleEvents: true,
    };

    if (!syncToken) {
      const now = dayjs().startOf("day");
      // first sync or unsync (3 months)
      const monthsAhead = now.add(CalendarCacheEventService.MONTHS_AHEAD, "month").endOf("day");

      const timeMinISO = now.toISOString();
      const timeMaxISO = monthsAhead.toISOString();
      params.timeMin = timeMinISO;
      params.timeMax = timeMaxISO;
    } else {
      // incremental sync
      params.syncToken = syncToken;
    }

    const events: calendar_v3.Schema$Event[] = [];
    do {
      const { data }: { data: calendar_v3.Schema$Events } = await client.events.list(params);

      syncToken = data.nextSyncToken || syncToken;
      pageToken = data.nextPageToken ?? null;
      if (pageToken) {
        params.pageToken = pageToken;
      }

      events.push(...(data.items || []));
    } while (pageToken);

    return {
      provider: "google_calendar",
      syncToken: syncToken || null,
      items: this.parseEvents(events),
    };
  }

  private parseEvents(events: calendar_v3.Schema$Event[]): CalendarSubscriptionEventItem[] {
    const now = dayjs().startOf("day");
    const monthsAhead = now.add(CalendarCacheEventService.MONTHS_AHEAD, "month").endOf("day");

    function filterEventsWithoutId(event: calendar_v3.Schema$Event) {
      return typeof event.id === "string" && !!event.id;
    }

    function filterEventsByDateRange(event: calendar_v3.Schema$Event) {
      const start = dayjs(event.start?.dateTime || event.start?.date);
      return !start.isBefore(now) && !start.isAfter(monthsAhead);
    }

    return events
      .filter(filterEventsWithoutId)
      .filter(filterEventsByDateRange)
      .map((event) => {
        // empty or opaque is busy
        const busy = !event.transparency || event.transparency === "opaque";

        const start = event.start?.dateTime
          ? new Date(event.start.dateTime)
          : event.start?.date
            ? new Date(event.start.date)
            : new Date();

        const end = event.end?.dateTime
          ? new Date(event.end.dateTime)
          : event.end?.date
            ? new Date(event.end.date)
            : new Date();

        return {
          id: event.id as string,
          iCalUID: event.iCalUID ?? null,
          start,
          end,
          busy,
          summary: event.summary ?? null,
          description: event.description ?? null,
          location: event.location ?? null,
          kind: event.kind ?? null,
          etag: event.etag ?? null,
          status: event.status ?? null,
          isAllDay: typeof event.start?.date === "string" && !event.start?.dateTime ? true : false,
          timeZone: event.start?.timeZone ?? null,
          recurringEventId: event.recurringEventId ?? null,
          originalStartDate: event.originalStartTime?.dateTime
            ? new Date(event.originalStartTime.dateTime)
            : event.originalStartTime?.date
              ? new Date(event.originalStartTime.date)
              : null,
          createdAt: event.created ? new Date(event.created) : null,
          updatedAt: event.updated ? new Date(event.updated) : null,
        };
      });
  }

  private async getClient(credential: CalendarCredential) {
    const auth = new CalendarAuth(credential);
    return await auth.getClient();
  }
}
