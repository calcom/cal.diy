import process from "node:process";
import logger from "@calcom/lib/logger";
import type { SelectedCalendar } from "@calcom/prisma/client";
import type {
  CalendarCredential,
  CalendarSubscriptionEvent,
  CalendarSubscriptionEventItem,
  CalendarSubscriptionResult,
  ICalendarSubscriptionPort,
} from "../lib/CalendarSubscriptionPort.interface";

const log = logger.getSubLogger({ prefix: ["MicrosoftCalendarSubscriptionAdapter"] });

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type GraphClient = { accessToken: string };

interface MicrosoftGraphEvent {
  id: string;
  iCalUId?: string;
  subject?: string;
  bodyPreview?: string;
  location?: { displayName?: string };
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  showAs?: "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown";
  isAllDay?: boolean;
  isCancelled?: boolean;
  type?: string;
}

interface MicrosoftGraphEventsResponse {
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
  value: MicrosoftGraphEvent[];
}

interface MicrosoftGraphSubscriptionReq {
  resource: string;
  changeType: string;
  notificationUrl: string;
  expirationDateTime: string;
  clientState?: string;
}

interface MicrosoftGraphSubscriptionRes {
  id: string;
  resource: string;
  expirationDateTime: string;
}

type AdapterConfig = {
  baseUrl?: string;
  webhookToken?: string | null;
  webhookUrl?: string | null;
  subscriptionTtlMs?: number;
};

/**
 * Office365 Calendar Subscription Adapter
 *
 * This adapter uses the Microsoft Graph API to create and manage calendar subscriptions
 * @see https://docs.microsoft.com/en-us/graph/api/resources/subscription
 */
export class Office365CalendarSubscriptionAdapter implements ICalendarSubscriptionPort {
  private readonly baseUrl: string;
  private readonly webhookToken?: string | null;
  private readonly webhookUrl?: string | null;
  private readonly subscriptionTtlMs: number;

  constructor(cfg: AdapterConfig = {}) {
    this.baseUrl = cfg.baseUrl ?? "https://graph.microsoft.com/v1.0";
    this.webhookToken = cfg.webhookToken ?? process.env.MICROSOFT_WEBHOOK_TOKEN ?? null;
    this.webhookUrl = cfg.webhookUrl ?? process.env.MICROSOFT_WEBHOOK_URL ?? null;
    this.subscriptionTtlMs = cfg.subscriptionTtlMs ?? 3 * 24 * 60 * 60 * 1000;
  }

  async validate(request: Request): Promise<boolean> {
    // validate handshake
    let validationToken: string | null = null;
    if (request?.url) {
      try {
        const urlObj = new URL(request.url);
        validationToken = urlObj.searchParams.get("validationToken");
      } catch (e) {
        log.warn("Invalid request URL", { url: request.url });
      }
    }
    if (validationToken) return true;

    // validate notifications
    const clientState =
      request?.headers?.get("clientState") ??
      (typeof request?.body === "object" && request.body !== null && "clientState" in request.body
        ? (request.body as { clientState?: string }).clientState
        : undefined);
    if (!this.webhookToken) {
      log.warn("MICROSOFT_WEBHOOK_TOKEN missing");
      return false;
    }
    if (clientState !== this.webhookToken) {
      log.warn("Invalid clientState");
      return false;
    }
    return true;
  }

  async extractChannelId(request: Request): Promise<string | null> {
    let id: string | null = null;
    if (request?.body && typeof request.body === "object" && "subscriptionId" in request.body) {
      id = (request.body as { subscriptionId?: string }).subscriptionId ?? null;
    } else if (request?.headers?.get("subscriptionId")) {
      id = request.headers.get("subscriptionId");
    }
    if (!id) {
      log.warn("subscriptionId missing in webhook");
    }
    return id;
  }

  async subscribe(
    selectedCalendar: SelectedCalendar,
    credential: CalendarCredential
  ): Promise<CalendarSubscriptionResult> {
    if (!this.webhookUrl || !this.webhookToken) {
      throw new Error("Webhook config missing (MICROSOFT_WEBHOOK_URL/TOKEN)");
    }

    const expirationDateTime = new Date(Date.now() + this.subscriptionTtlMs).toISOString();

    const body: MicrosoftGraphSubscriptionReq = {
      resource: `me/calendars/${selectedCalendar.externalId}/events`,
      changeType: "created,updated,deleted",
      notificationUrl: this.webhookUrl,
      expirationDateTime,
      clientState: this.webhookToken,
    };

    const client = await this.getGraphClient(credential);
    const res = await this.request<MicrosoftGraphSubscriptionRes>(client, "POST", "/subscriptions", body);

    return {
      provider: "office365_calendar",
      id: res.id,
      resourceId: res.resource,
      resourceUri: `${this.baseUrl}/${res.resource}`,
      expiration: new Date(res.expirationDateTime),
    };
  }

  async unsubscribe(selectedCalendar: SelectedCalendar, credential: CalendarCredential): Promise<void> {
    const subId = selectedCalendar.channelResourceId;
    if (!subId) return;

    const client = await this.getGraphClient(credential);
    await this.request(client, "DELETE", `/subscriptions/${subId}`);
  }

  async fetchEvents(
    selectedCalendar: SelectedCalendar,
    credential: CalendarCredential
  ): Promise<CalendarSubscriptionEvent> {
    const client = await this.getGraphClient(credential);

    let deltaLink = selectedCalendar.syncToken ?? null;
    const items: MicrosoftGraphEvent[] = [];

    if (deltaLink) {
      const path = this.stripBase(deltaLink);
      const r = await this.request<MicrosoftGraphEventsResponse>(client, "GET", path);
      items.push(...r.value);
      deltaLink = r["@odata.deltaLink"] ?? deltaLink;
    } else {
      let next: string | null = `/me/calendars/${selectedCalendar.externalId}/events/delta`;
      while (next) {
        const r: MicrosoftGraphEventsResponse = await this.request<MicrosoftGraphEventsResponse>(
          client,
          "GET",
          next
        );
        items.push(...r.value);
        deltaLink = r["@odata.deltaLink"] ?? deltaLink;
        next = r["@odata.nextLink"] ? this.stripBase(r["@odata.nextLink"]) : null;
      }
    }

    return {
      provider: "office365_calendar",
      syncToken: deltaLink,
      items: this.parseEvents(items),
    };
  }

  private parseEvents(events: MicrosoftGraphEvent[]): CalendarSubscriptionEventItem[] {
    return events
      .map((e) => {
        const busy = e.showAs === "busy" || e.showAs === "tentative" || e.showAs === "oof";
        const start = e.start?.dateTime ? new Date(e.start.dateTime) : new Date();
        const end = e.end?.dateTime ? new Date(e.end.dateTime) : new Date();

        return {
          id: e.id,
          iCalUID: e.iCalUId ?? null,
          start,
          end,
          busy,
          etag: null,
          summary: e.subject ?? null,
          description: e.bodyPreview ?? null,
          location: e.location?.displayName ?? null,
          kind: e.type ?? "microsoftgraph#event",
          status: e.isCancelled ? "cancelled" : "confirmed",
          isAllDay: e.isAllDay ?? false,
          timeZone: e.start?.timeZone ?? null,
          recurringEventId: null,
          originalStartDate: null,
          createdAt: null,
          updatedAt: null,
        };
      })
      .filter(({ id }) => !!id);
  }

  private async getGraphClient(credential: CalendarCredential): Promise<GraphClient> {
    const accessToken = credential.delegatedTo?.serviceAccountKey?.private_key ?? (credential.key as string);
    if (!accessToken) throw new Error("Missing Microsoft access token");
    return { accessToken };
  }

  private stripBase(urlOrPath: string): string {
    return urlOrPath.startsWith("http") ? urlOrPath.replace(this.baseUrl, "") : urlOrPath;
  }

  private async request<T = unknown>(
    client: GraphClient,
    method: HttpMethod,
    endpoint: string,
    data?: unknown
  ): Promise<T> {
    const url = endpoint.startsWith("http") ? endpoint : `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${client.accessToken}`,
      "Content-Type": "application/json",
    };

    const init: RequestInit = { method, headers };
    if (data && (method === "POST" || method === "PUT" || method === "PATCH")) {
      init.body = JSON.stringify(data);
    }

    const res = await fetch(url, init);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log.error("Graph API error", { method, endpoint: this.stripBase(url), status: res.status, text });
      throw new Error(`Graph ${res.status} ${res.statusText}`);
    }

    if (method === "DELETE" || res.status === 204) return {} as T;

    return (await res.json()) as T;
  }
}
