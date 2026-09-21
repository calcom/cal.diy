import { MSTeamsLocationType } from "@calcom/app-store/constants";
import dayjs from "@calcom/dayjs";
import { triggerDelegationCredentialErrorWebhook } from "@calcom/features/webhooks/lib/triggerDelegationCredentialErrorWebhook";
import { getLocation, getRichDescriptionHTML } from "@calcom/lib/CalEventParser";
import {
  CalendarAppDelegationCredentialConfigurationError,
  CalendarAppDelegationCredentialInvalidGrantError,
} from "@calcom/lib/CalendarAppError";
import { handleErrorsJson, handleErrorsRaw } from "@calcom/lib/errors";
import logger from "@calcom/lib/logger";
import type { BufferedBusyTime } from "@calcom/types/BufferedBusyTime";
import type {
  Calendar,
  CalendarServiceEvent,
  EventBusyDate,
  GetAvailabilityParams,
  IntegrationCalendar,
  NewCalendarEventType,
} from "@calcom/types/Calendar";
import type { CredentialForCalendarServiceWithTenantId } from "@calcom/types/Credential";
import type { Event, Calendar as OfficeCalendar, User } from "@microsoft/microsoft-graph-types-beta";
import type { DefaultBodyType } from "msw";
import pLimit from "p-limit";
import { findIana } from "windows-iana";
import { getTokenObjectFromCredential } from "../../_utils/oauth/getTokenObjectFromCredential";
import { OAuthManager } from "../../_utils/oauth/OAuthManager";
import { oAuthManagerHelper } from "../../_utils/oauth/oAuthManagerHelper";
import metadata from "../_metadata";
import { getOfficeAppKeys } from "./getOfficeAppKeys";

interface IRequest {
  method: string;
  url: string;
  id: number;
}

interface ISettledResponse {
  id: string;
  status: number;
  headers: {
    "Retry-After": string;
    "Content-Type": string;
  };
  body: Record<string, DefaultBodyType>;
}

interface IBatchResponse {
  responses: ISettledResponse[];
}
interface BodyValue {
  showAs: string;
  end: { dateTime: string };
  evt: { showAs: string };
  start: { dateTime: string };
}

const MS_GRAPH_CONCURRENCY_LIMIT = 15;
const msGraphRateLimiter = pLimit(MS_GRAPH_CONCURRENCY_LIMIT);

class Office365CalendarService implements Calendar {
  private url = "";
  private integrationName = "";
  private log: typeof logger;
  private auth: OAuthManager;
  private apiGraphUrl = "https://graph.microsoft.com/v1.0";
  private credential: CredentialForCalendarServiceWithTenantId;
  private azureUserId?: string;

  constructor(credential: CredentialForCalendarServiceWithTenantId) {
    this.integrationName = "office365_calendar";
    const tokenResponse = getTokenObjectFromCredential(credential);
    this.auth = new OAuthManager({
      credentialSyncVariables: oAuthManagerHelper.credentialSyncVariables,
      resourceOwner: {
        type: "user",
        id: credential.userId,
      },
      appSlug: metadata.slug,
      currentTokenObject: tokenResponse,
      fetchNewTokenObject: async ({ refreshToken }: { refreshToken: string | null }) => {
        const isDelegated = Boolean(credential?.delegatedTo);

        if (!isDelegated && !refreshToken) {
          return null;
        }

        const { client_id, client_secret } = await this.getAuthCredentials(isDelegated);

        const url = await this.getAuthUrl(isDelegated, credential?.delegatedTo?.serviceAccountKey?.tenant_id);

        const bodyParams = {
          scope: isDelegated
            ? "https://graph.microsoft.com/.default"
            : "User.Read Calendars.Read Calendars.ReadWrite",
          client_id,
          client_secret,
          grant_type: isDelegated ? "client_credentials" : "refresh_token",
          ...(isDelegated ? {} : { refresh_token: refreshToken ?? "" }),
        };

        return fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(bodyParams),
        });
      },
      isTokenObjectUnusable: async () => {
        // TODO: Implement this. As current implementation of CalendarService doesn't handle it. It hasn't been handled in the OAuthManager implementation as well.
        // This is a placeholder for future implementation.
        return null;
      },
      isAccessTokenUnusable: async () => {
        // TODO: Implement this
        return null;
      },

      invalidateTokenObject: () => oAuthManagerHelper.invalidateCredential(credential.id),
      expireAccessToken: () => oAuthManagerHelper.markTokenAsExpired(credential),
      updateTokenObject: (tokenObject) => {
        if (!credential.delegatedTo) {
          return oAuthManagerHelper.updateTokenObject({ tokenObject, credentialId: credential.id });
        }
        return Promise.resolve();
      },
    });
    this.credential = credential;
    this.log = logger.getSubLogger({ prefix: [`[[lib] ${this.integrationName}`] });
  }

  private async triggerDelegationCredentialError(error: Error): Promise<void> {
    if (
      this.credential.userId &&
      this.credential.user &&
      this.credential.appId &&
      this.credential.delegatedToId
    ) {
      await triggerDelegationCredentialErrorWebhook({
        error,
        credential: {
          id: this.credential.id,
          type: this.credential.type,
          appId: this.credential.appId,
        },
        user: {
          id: this.credential.userId,
          email: this.credential.user.email,
        },
        delegationCredentialId: this.credential.delegatedToId,
      });
    }
  }

  private async getAuthUrl(delegatedTo: boolean, tenantId?: string): Promise<string> {
    if (delegatedTo) {
      if (!tenantId) {
        const error = new CalendarAppDelegationCredentialInvalidGrantError(
          "Invalid DelegationCredential Settings: tenantId is missing"
        );

        await this.triggerDelegationCredentialError(error);

        throw error;
      }
      return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    }

    return "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  }

  private async getAuthCredentials(isDelegated: boolean) {
    if (isDelegated) {
      const client_id = this.credential?.delegatedTo?.serviceAccountKey?.client_id;
      const client_secret = this.credential?.delegatedTo?.serviceAccountKey?.private_key;

      if (!client_id || !client_secret) {
        const error = new CalendarAppDelegationCredentialConfigurationError(
          "Delegation credential without clientId or Secret"
        );

        await this.triggerDelegationCredentialError(error);

        throw error;
      }

      return { client_id, client_secret };
    }

    return getOfficeAppKeys();
  }

  private async getAzureUserId(credential: CredentialForCalendarServiceWithTenantId) {
    if (this.azureUserId) return this.azureUserId;

    const isDelegated = Boolean(credential?.delegatedTo);

    if (!isDelegated) return;

    const url = await this.getAuthUrl(isDelegated, credential?.delegatedTo?.serviceAccountKey?.tenant_id);

    const delegationCredentialClientId = credential.delegatedTo?.serviceAccountKey?.client_id;
    const delegationCredentialClientSecret = credential.delegatedTo?.serviceAccountKey?.private_key;

    if (!delegationCredentialClientId || !delegationCredentialClientSecret) {
      const error = new CalendarAppDelegationCredentialConfigurationError(
        "Delegation credential without clientId or Secret"
      );

      await this.triggerDelegationCredentialError(error);

      throw error;
    }
    const loginResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        scope: "https://graph.microsoft.com/.default",
        client_id: delegationCredentialClientId,
        grant_type: "client_credentials",
        client_secret: delegationCredentialClientSecret,
      }),
    });

    if (!this.azureUserId && credential?.delegatedTo) {
      const clonedResponse = loginResponse.clone();
      const parsedLoginResponse = await clonedResponse.json();
      const token = parsedLoginResponse?.access_token;
      const oauthClientIdAliasRegex = /\+[a-zA-Z0-9]{25}/;
      const email = this.credential?.user?.email.replace(oauthClientIdAliasRegex, "");
      const encodedFilter = encodeURIComponent(`mail eq '${email}'`);
      const queryParams = `$filter=${encodedFilter}`;

      const response = await fetch(`https://graph.microsoft.com/v1.0/users?${queryParams}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${token}`,
        },
      });

      const parsedBody = await response.json();

      if (!parsedBody?.value?.[0]?.id) {
        const error = new CalendarAppDelegationCredentialInvalidGrantError(
          "User might not exist in Microsoft Azure Active Directory"
        );

        await this.triggerDelegationCredentialError(error);

        throw error;
      }
      this.azureUserId = parsedBody.value[0].id;
    }
    return this.azureUserId;
  }

  async testDelegationCredentialSetup(): Promise<void> {
    const delegationCredentialClientId = this.credential.delegatedTo?.serviceAccountKey?.client_id;
    const delegationCredentialClientSecret = this.credential.delegatedTo?.serviceAccountKey?.private_key;
    const url = await this.getAuthUrl(
      Boolean(this.credential?.delegatedTo),
      this.credential?.delegatedTo?.serviceAccountKey?.tenant_id
    );

    if (!delegationCredentialClientId || !delegationCredentialClientSecret) {
      throw new CalendarAppDelegationCredentialConfigurationError(
        "Delegation credential is missing client_id or client_secret"
      );
    }
    const loginResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        scope: "https://graph.microsoft.com/.default",
        client_id: delegationCredentialClientId,
        grant_type: "client_credentials",
        client_secret: delegationCredentialClientSecret,
      }),
    });
    const parsedLoginResponse = await loginResponse.json();
    if (!parsedLoginResponse?.access_token) {
      const errorDescription =
        parsedLoginResponse?.error_description || parsedLoginResponse?.error || "Unknown error";
      throw new CalendarAppDelegationCredentialInvalidGrantError(
        `Failed to obtain access token from Microsoft: ${errorDescription}`
      );
    }
  }

  async getUserEndpoint(): Promise<string> {
    const azureUserId = await this.getAzureUserId(this.credential);
    return azureUserId ? `/users/${this.azureUserId}` : "/me";
  }

  async createEvent(event: CalendarServiceEvent, credentialId: number): Promise<NewCalendarEventType> {
    const mainHostDestinationCalendar = event.destinationCalendar
      ? (event.destinationCalendar.find((cal) => cal.credentialId === credentialId) ??
        event.destinationCalendar[0])
      : undefined;
    try {
      const eventsUrl = mainHostDestinationCalendar?.externalId
        ? `${await this.getUserEndpoint()}/calendars/${mainHostDestinationCalendar?.externalId}/events`
        : `${await this.getUserEndpoint()}/calendar/events`;

      const response = await this.fetcher(eventsUrl, {
        method: "POST",
        body: JSON.stringify(this.translateEvent(event)),
      });

      const responseJson = await handleErrorsJson<
        NewCalendarEventType & { iCalUId: string; onlineMeeting?: { joinUrl?: string } }
      >(response);

      if (responseJson?.onlineMeeting?.joinUrl) {
        responseJson.url = responseJson?.onlineMeeting?.joinUrl;
      }

      return { ...responseJson, iCalUID: responseJson.iCalUId };
    } catch (error) {
      this.log.error(error);

      throw error;
    }
  }

  async updateEvent(uid: string, event: CalendarServiceEvent): Promise<NewCalendarEventType> {
    try {
      let rescheduledEvent: Event | undefined;
      if (event.location === MSTeamsLocationType) {
        // Extract the existing body content to preserve the meeting blob, otherwise it breaks and converts it into non-onlineMeeting
        const response = await this.fetcher(`${await this.getUserEndpoint()}/calendar/events/${uid}`, {
          method: "GET",
        });

        rescheduledEvent = await handleErrorsJson<Event>(response);
      }

      const response = await this.fetcher(`${await this.getUserEndpoint()}/calendar/events/${uid}`, {
        method: "PATCH",
        body: JSON.stringify(this.translateEvent(event, rescheduledEvent)),
      });

      const responseJson = await handleErrorsJson<
        NewCalendarEventType & { iCalUId: string; onlineMeeting?: { joinUrl?: string } }
      >(response);

      if (responseJson?.onlineMeeting?.joinUrl) {
        responseJson.url = responseJson?.onlineMeeting?.joinUrl;
      }

      return { ...responseJson, iCalUID: responseJson.iCalUId };
    } catch (error) {
      this.log.error(error);

      throw error;
    }
  }

  async deleteEvent(uid: string): Promise<void> {
    try {
      const response = await this.fetcher(`${await this.getUserEndpoint()}/calendar/events/${uid}`, {
        method: "DELETE",
      });

      handleErrorsRaw(response);
    } catch (error) {
      this.log.error(error);

      throw error;
    }
  }

  async getAvailability(params: GetAvailabilityParams): Promise<EventBusyDate[]> {
    return msGraphRateLimiter(async () => {
      const { dateFrom, dateTo, selectedCalendars } = params;
      const dateFromParsed = new Date(dateFrom);
      const dateToParsed = new Date(dateTo);

      const filter = `?startDateTime=${encodeURIComponent(
        dateFromParsed.toISOString()
      )}&endDateTime=${encodeURIComponent(dateToParsed.toISOString())}`;

      // Request maximum page size (999) to minimize pagination rounds
      // Microsoft Graph allows up to 999 items per page for calendarView
      const calendarSelectParams = "$select=showAs,start,end&$top=999";

      try {
        const selectedCalendarIds = selectedCalendars.reduce((calendarIds, calendar) => {
          if (calendar.integration === this.integrationName && calendar.externalId)
            calendarIds.push(calendar.externalId);

          return calendarIds;
        }, [] as string[]);

        if (selectedCalendarIds.length === 0 && selectedCalendars.length > 0) {
          // Only calendars of other integrations selected
          return Promise.resolve([]);
        }

        const ids = await (selectedCalendarIds.length === 0
          ? this.listCalendars().then((cals) => cals.map((e_2) => e_2.externalId).filter(Boolean) || [])
          : Promise.resolve(selectedCalendarIds));
        const requestsPromises = ids.map(async (calendarId, id) => ({
          id,
          method: "GET",
          url: `${await this.getUserEndpoint()}/calendars/${calendarId}/calendarView${filter}&${calendarSelectParams}`,
        }));
        const requests = await Promise.all(requestsPromises);

        // Microsoft Graph batch API limit is 20 requests per batch
        const MS_GRAPH_BATCH_LIMIT = 20;
        let allResponses: ISettledResponse[] = [];

        // Process requests in chunks of 20
        for (let i = 0; i < requests.length; i += MS_GRAPH_BATCH_LIMIT) {
          const chunk = requests.slice(i, i + MS_GRAPH_BATCH_LIMIT);
          // Use chunk-local ids so retry mapping matches this batch
          const chunkWithLocalIds = chunk.map((request, index) => ({ ...request, id: index }));
          const response = await this.apiGraphBatchCall(chunkWithLocalIds);
          const responseBody = await this.handleErrorJsonOffice365Calendar(response);
          let responseBatchApi: IBatchResponse = { responses: [] };
          if (typeof responseBody === "string") {
            responseBatchApi = this.handleTextJsonResponseWithHtmlInBody(responseBody);
          } else {
            responseBatchApi = responseBody as IBatchResponse;
          }

          // Validate if any 429 status Retry-After is present
          const retryAfter =
            !!responseBatchApi?.responses && this.findRetryAfterResponse(responseBatchApi.responses);

          if (retryAfter && responseBatchApi.responses) {
            responseBatchApi = await this.fetchRequestWithRetryAfter(
              chunkWithLocalIds,
              responseBatchApi.responses,
              2
            );
          }

          // Recursively fetch nextLink responses for this chunk
          const chunkResponses = await this.fetchResponsesWithNextLink(responseBatchApi.responses);
          allResponses = allResponses.concat(chunkResponses);
        }

        const alreadySuccessResponse = allResponses;

        return alreadySuccessResponse ? this.processBusyTimes(alreadySuccessResponse) : [];
      } catch {
        return Promise.reject([]);
      }
    });
  }

  async listCalendars(): Promise<IntegrationCalendar[]> {
    const officeCalendars: OfficeCalendar[] = [];
    // List calendars from MS are paginated
    let finishedParsingCalendars = false;
    const calendarFilterParam = "$select=id,name,isDefaultCalendar,canEdit";

    // Store @odata.nextLink if in response
    let requestLink = `${await this.getUserEndpoint()}/calendars?${calendarFilterParam}`;

    while (!finishedParsingCalendars) {
      const response = await this.fetcher(requestLink);
      let responseBody = await handleErrorsJson<{ value: OfficeCalendar[]; "@odata.nextLink"?: string }>(
        response
      );
      // If responseBody is valid then parse the JSON text
      if (typeof responseBody === "string") {
        responseBody = JSON.parse(responseBody) as { value: OfficeCalendar[] };
      }

      officeCalendars.push(...responseBody.value);

      if (responseBody["@odata.nextLink"]) {
        requestLink = responseBody["@odata.nextLink"].replace(this.apiGraphUrl, "");
      } else {
        finishedParsingCalendars = true;
      }
    }

    const user = await this.fetcher(`${await this.getUserEndpoint()}`);
    const userResponseBody = await handleErrorsJson<User>(user);
    const email = userResponseBody.mail ?? userResponseBody.userPrincipalName;

    return officeCalendars.map((cal: OfficeCalendar) => {
      const calendar: IntegrationCalendar = {
        externalId: cal.id ?? "No Id",
        integration: this.integrationName,
        name: cal.name ?? "No calendar name",
        primary: cal.isDefaultCalendar ?? false,
        readOnly: !cal.canEdit && true,
        email: email ?? "",
      };
      return calendar;
    });
  }

  private translateEvent = (event: CalendarServiceEvent, rescheduledEvent?: Event) => {
    const isOnlineMeeting = event.location === MSTeamsLocationType;
    const isRescheduledOnlineMeeting = rescheduledEvent ? rescheduledEvent.isOnlineMeeting : false;
    const existingBody =
      rescheduledEvent?.body?.contentType === "html" ? rescheduledEvent.body.content : undefined;

    let content = "";
    if (isOnlineMeeting) {
      if (isRescheduledOnlineMeeting && existingBody) {
        content = `
        ${getRichDescriptionHTML(event)}<hr>
        ${existingBody}`.trim();
      } else {
        content = getRichDescriptionHTML(event);
      }
    } else {
      content = event.calendarDescription;
    }

    const office365Event: Event = {
      subject: event.title,
      body: {
        contentType: isOnlineMeeting ? "html" : "text",
        content,
      },
      start: {
        dateTime: dayjs(event.startTime).tz(event.organizer.timeZone).format("YYYY-MM-DDTHH:mm:ss"),
        timeZone: event.organizer.timeZone,
      },
      end: {
        dateTime: dayjs(event.endTime).tz(event.organizer.timeZone).format("YYYY-MM-DDTHH:mm:ss"),
        timeZone: event.organizer.timeZone,
      },
      hideAttendees: !event.seatsPerTimeSlot ? false : !event.seatsShowAttendees,
      organizer: {
        emailAddress: {
          address: event.destinationCalendar
            ? (event.destinationCalendar.find((cal) => cal.userId === event.organizer.id)?.externalId ??
              event.organizer.email)
            : event.organizer.email,
          name: event.organizer.name,
        },
      },
      attendees: [
        ...event.attendees.map((attendee) => ({
          emailAddress: {
            address: attendee.email,
            name: attendee.name,
          },
          type: "required" as const,
        })),
        ...(event.team?.members
          ? event.team.members
              .filter((member) => member.email !== this.credential.user?.email)
              .map((member) => {
                const destinationCalendar =
                  event.destinationCalendar &&
                  event.destinationCalendar.find(
                    (cal) => cal.integration === this.integrationName && cal.userId === member.id
                  );
                return {
                  emailAddress: {
                    address: destinationCalendar?.externalId ?? member.email,
                    name: member.name,
                  },
                  type: "required" as const,
                };
              })
          : []),
      ],
      location: event.location ? { displayName: getLocation(event) } : undefined,
    };
    if (event.hideCalendarEventDetails) {
      office365Event.sensitivity = "private";
    }
    if (isOnlineMeeting) {
      office365Event.isOnlineMeeting = true;
      office365Event.allowNewTimeProposals = true;
      office365Event.onlineMeetingProvider = "teamsForBusiness";
      // MSTeams sets location as 'Microsoft Teams Meeting' by default, if location is undefined.
      // For backward compatibility, setting explicitly.
      office365Event.location =
        rescheduledEvent && !isRescheduledOnlineMeeting
          ? { displayName: "Microsoft Teams Meeting" }
          : undefined;
    }
    return office365Event;
  };

  private fetcher = async (endpoint: string, init?: RequestInit | undefined) => {
    return this.auth.requestRaw({
      url: `${this.apiGraphUrl}${endpoint}`,
      options: {
        method: "get",
        ...init,
      },
    });
  };

  private fetchResponsesWithNextLink = async (
    settledResponses: ISettledResponse[]
  ): Promise<ISettledResponse[]> => {
    const alreadySuccess = [] as ISettledResponse[];
    const newLinkRequest = [] as IRequest[];
    settledResponses?.forEach((response) => {
      if (response.status === 200 && response.body["@odata.nextLink"] === undefined) {
        alreadySuccess.push(response);
      } else {
        const nextLinkUrl = response.body["@odata.nextLink"]
          ? String(response.body["@odata.nextLink"]).replace(this.apiGraphUrl, "")
          : "";
        if (nextLinkUrl) {
          // Saving link for later use
          newLinkRequest.push({
            id: Number(response.id),
            method: "GET",
            url: nextLinkUrl,
          });
        }
        delete response.body["@odata.nextLink"];
        // Pushing success body content
        alreadySuccess.push(response);
      }
    });

    if (newLinkRequest.length === 0) {
      return alreadySuccess;
    }

    const newResponse = await this.apiGraphBatchCall(newLinkRequest);
    let newResponseBody = await handleErrorsJson<IBatchResponse | string>(newResponse);

    if (typeof newResponseBody === "string") {
      newResponseBody = this.handleTextJsonResponseWithHtmlInBody(newResponseBody);
    }

    // Going recursive to fetch next link
    const newSettledResponses = await this.fetchResponsesWithNextLink(newResponseBody.responses);
    return [...alreadySuccess, ...newSettledResponses];
  };

  private fetchRequestWithRetryAfter = async (
    originalRequests: IRequest[],
    settledPromises: ISettledResponse[],
    maxRetries: number,
    retryCount = 0
  ): Promise<IBatchResponse> => {
    const getRandomness = () => Number(Math.random().toFixed(3));
    let retryAfterTimeout = 0;
    if (retryCount >= maxRetries) {
      return { responses: settledPromises };
    }
    const alreadySuccessRequest = [] as ISettledResponse[];
    const failedRequest = [] as IRequest[];
    settledPromises.forEach((item) => {
      if (item.status === 200) {
        alreadySuccessRequest.push(item);
      } else if (item.status === 429) {
        const newTimeout = Number(item.headers["Retry-After"]) * 1000 || 0;
        retryAfterTimeout = newTimeout > retryAfterTimeout ? newTimeout : retryAfterTimeout;
        failedRequest.push(originalRequests[Number(item.id)]);
      }
    });

    if (failedRequest.length === 0) {
      return { responses: alreadySuccessRequest };
    }

    // Await certain time from retry-after header
    await new Promise((r) => setTimeout(r, retryAfterTimeout + getRandomness()));

    const newResponses = await this.apiGraphBatchCall(failedRequest);
    let newResponseBody = await handleErrorsJson<IBatchResponse | string>(newResponses);
    if (typeof newResponseBody === "string") {
      newResponseBody = this.handleTextJsonResponseWithHtmlInBody(newResponseBody);
    }
    const retryAfter = !!newResponseBody?.responses && this.findRetryAfterResponse(newResponseBody.responses);

    if (retryAfter && newResponseBody.responses) {
      newResponseBody = await this.fetchRequestWithRetryAfter(
        failedRequest,
        newResponseBody.responses,
        maxRetries,
        retryCount + 1
      );
    }
    return { responses: [...alreadySuccessRequest, ...(newResponseBody?.responses || [])] };
  };

  private apiGraphBatchCall = async (requests: IRequest[]): Promise<Response> => {
    const response = await this.fetcher(`/$batch`, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });

    return response;
  };

  private handleTextJsonResponseWithHtmlInBody = (response: string): IBatchResponse => {
    try {
      const parsedJson = JSON.parse(response);
      return parsedJson;
    } catch {
      // Looking for html in body
      const openTag = '"body":<';
      const closeTag = "</html>";
      const htmlBeginning = response.indexOf(openTag) + openTag.length - 1;
      const htmlEnding = response.indexOf(closeTag) + closeTag.length + 2;
      const resultString = `${response.repeat(1).substring(0, htmlBeginning)} ""${response
        .repeat(1)
        .substring(htmlEnding, response.length)}`;

      return JSON.parse(resultString);
    }
  };

  private findRetryAfterResponse = (response: ISettledResponse[]) => {
    const foundRetry = response.find((request: ISettledResponse) => request.status === 429);
    return !!foundRetry;
  };

  private processBusyTimes = (responses: ISettledResponse[]) => {
    return responses.reduce(
      (acc: BufferedBusyTime[], subResponse: { body: { value?: BodyValue[]; error?: Error[] } }) => {
        if (!subResponse.body?.value) return acc;
        return acc.concat(
          subResponse.body.value.reduce((acc: BufferedBusyTime[], evt: BodyValue) => {
            if (evt.showAs === "free" || evt.showAs === "workingElsewhere") return acc;
            return acc.concat({
              start: `${evt.start.dateTime}Z`,
              end: `${evt.end.dateTime}Z`,
            });
          }, [])
        );
      },
      []
    );
  };

  private async handleErrorJsonOffice365Calendar<Type>(response: Response): Promise<Type | string> {
    if (response.headers.get("content-encoding") === "gzip") {
      return response.text();
    }

    if (response.status === 204) {
      return {} as Type;
    }

    if (!response.ok) {
      let errorBody: string | object;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }
      this.log.error(
        `handleErrorJsonOffice365Calendar: Office365 API request failed with status ${response.status}`,
        errorBody
      );
    }

    return response.json();
  }

  /**
   * Gets the main timezone from Office365 mailbox settings.
   * Handles both legacy string format and new Graph API object format due to API evolution.
   * Legacy format: returns string timezone as-is (preserves existing behavior)
   * New format: converts Windows timezone from {"value": "Windows Timezone"} to IANA format
   */
  async getMainTimeZone(): Promise<string> {
    try {
      const response = await this.fetcher(`${await this.getUserEndpoint()}/mailboxSettings/timeZone`);
      const timezoneResponse = await handleErrorsJson<string | { value: string }>(response);

      if (typeof timezoneResponse === "object" && timezoneResponse !== null && "value" in timezoneResponse) {
        const windowsTimezoneName = timezoneResponse.value;
        this.log.info("timezone found in outlook mailbox settings (new format)", {
          windowsTimezoneName,
        });

        try {
          const ianaTimezone = findIana(windowsTimezoneName);
          if (ianaTimezone && ianaTimezone.length > 0) {
            const convertedTimezone = ianaTimezone[0];
            this.log.info("Successfully converted Windows timezone to IANA", {
              windowsTimezoneName,
              convertedTimezone,
            });
            return convertedTimezone;
          } else {
            this.log.warn("Could not convert Windows timezone to IANA, using original value", {
              windowsTimezoneName,
            });
            return windowsTimezoneName;
          }
        } catch (conversionError) {
          this.log.warn("Error converting Windows timezone to IANA, using original value", {
            windowsTimezoneName,
            conversionError,
          });
          return windowsTimezoneName;
        }
      }

      if (!timezoneResponse || typeof timezoneResponse !== "string") {
        this.log.warn("No timezone found in outlook mailbox settings, defaulting to Europe/London", {
          timezoneResponse,
        });
        return "Europe/London";
      }

      this.log.info("timezone found in outlook mailbox settings (legacy format)", {
        timezone: timezoneResponse,
      });
      return timezoneResponse;
    } catch (error) {
      this.log.error("Error getting main timezone from Office365 Calendar", { error });
      throw error;
    }
  }
}

/**
 * Factory function that creates an Office365 Calendar service instance.
 * This is exported instead of the class to prevent SDK types (like Microsoft Graph types)
 * from leaking into the emitted .d.ts file, which would cause TypeScript to load
 * all Microsoft Graph SDK declaration files when type-checking dependent packages.
 */
export default function BuildCalendarService(credential: CredentialForCalendarServiceWithTenantId): Calendar {
  return new Office365CalendarService(credential);
}
