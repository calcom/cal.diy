import axios from "axios";
import qs from "qs";

import { getLocation } from "@calcom/lib/CalEventParser";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";
import type {
  CalendarEvent,
  EventBusyDate,
  IntegrationCalendar,
  NewCalendarEventType,
} from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import type { Contact, ContactCreateInput, CRM } from "@calcom/types/CrmService";

import getAppKeysFromSlug from "../../_utils/getAppKeysFromSlug";
import refreshOAuthTokens from "../../_utils/oauth/refreshOAuthTokens";
import { appKeysSchema } from "../zod";

export type BiginToken = {
  scope: string;
  api_domain: string;
  expires_in: number;
  expiryDate: number;
  token_type: string;
  access_token: string;
  accountServer: string;
  refresh_token: string;
};

export type BiginContact = {
  id: string;
  Email: string;
};

class BiginCrmService implements CRM {
  private readonly integrationName = "zoho-bigin";
  private readonly auth: { getToken: () => Promise<BiginToken> };
  private log: typeof logger;
  private eventsSlug = "/bigin/v1/Events";
  private contactsSlug = "/bigin/v1/Contacts";

  constructor(credential: CredentialPayload) {
    this.auth = this.biginAuth(credential);
    this.log = logger.getSubLogger({ prefix: [`[[lib] ${this.integrationName}`] });
  }

  /***
   * Authenticate calendar service with Zoho Bigin provided credentials.
   */
  private biginAuth(credential: CredentialPayload) {
    let credentialKey = credential.key as unknown as BiginToken;
    const credentialId = credential.id;
    const userId = credential.userId;

    const isTokenValid = (token: BiginToken) =>
      Boolean(token.access_token && token.expiryDate && token.expiryDate > Date.now());

    return {
      getToken: async () => {
        if (isTokenValid(credentialKey)) {
          return credentialKey;
        }
        const refreshedToken = await this.refreshAccessToken(credentialId, userId, credentialKey);
        if (isTokenValid(refreshedToken)) {
          credentialKey = refreshedToken;
        }
        return refreshedToken;
      },
    };
  }

  /***
   * Fetches a new access token if stored token is expired.
   */
  private async refreshAccessToken(credentialId: number, userId: number | null, credentialKey: BiginToken) {
    this.log.debug("Refreshing token as it's invalid");
    const grantType = "refresh_token";
    const accountsUrl = `${credentialKey.accountServer}/oauth/v2/token`;

    const appKeys = await getAppKeysFromSlug(this.integrationName);

    const { client_id: clientId, client_secret: clientSecret } = appKeysSchema.parse(appKeys);

    const formData = {
      grant_type: grantType,
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credentialKey.refresh_token,
    };

    const tokenInfo = await refreshOAuthTokens(
      async () =>
        await axios.post(accountsUrl, qs.stringify(formData), {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
          },
        }),
      "zoho-bigin",
      userId
    );

    if (!tokenInfo.data.error) {
      // set expiry date as offset from current time.
      tokenInfo.data.expiryDate = Math.round(Date.now() + tokenInfo.data.expires_in * 1000);
      tokenInfo.data.accountServer = credentialKey.accountServer;
      tokenInfo.data.refresh_token = credentialKey.refresh_token;

      await prisma.credential.update({
        where: {
          id: credentialId,
        },
        data: {
          key: tokenInfo.data as BiginToken,
        },
      });
      this.log.debug("Fetched token", tokenInfo.data.access_token);
    } else {
      this.log.error(tokenInfo.data);
    }

    return tokenInfo.data as BiginToken;
  }

  /***
   * Creates Zoho Bigin Contact records for every attendee added in event bookings.
   * Returns the results of all contact creation operations.
   */
  async createContacts(contactsToCreate: ContactCreateInput[]) {
    const token = await this.auth.getToken();
    const contacts = contactsToCreate.map((contact) => {
      const nameParts = contact.name.split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "-";
      return {
        First_Name: firstName,
        Last_Name: lastName,
        Email: contact.email,
      };
    });

    const response = await axios({
      method: "post",
      url: token.api_domain + this.contactsSlug,
      headers: {
        "content-type": "application/json",
        authorization: `Zoho-oauthtoken ${token.access_token}`,
      },
      data: JSON.stringify({ data: contacts }),
    }).then((data) => data.data);

    return response
      ? response.data.map((contact: any) => {
          return {
            id: contact.details.id,
            email: contact.Email,
          };
        })
      : [];
  }

  /***
   * Finds existing Zoho Bigin Contact record based on email address. Returns a list of contacts objects that matched.
   */
  async getContacts({ emails }: { emails: string | string[] }) {
    const token = await this.auth.getToken();
    const emailsArray = Array.isArray(emails) ? emails : [emails];

    const searchCriteria = `(${emailsArray.map((email) => `(Email:equals:${encodeURI(email)})`).join("or")})`;

    const response = await axios({
      method: "get",
      url: `${token.api_domain}${this.contactsSlug}/search?criteria=${searchCriteria}`,
      headers: {
        authorization: `Zoho-oauthtoken ${token.access_token}`,
      },
    }).then((data) => data.data);

    return response
      ? response.data.map((contact: BiginContact) => {
          return {
            id: contact.id,
            email: contact.Email,
          };
        })
      : [];
  }

  /***
   * Sends request to Zoho Bigin API to add new Events.
   */
  private async createBiginEvent(event: CalendarEvent, contacts: Contact[]) {
    const token = await this.auth.getToken();
    const biginEvent = {
      Event_Title: event.title,
      Start_DateTime: toISO8601String(new Date(event.startTime)),
      End_DateTime: toISO8601String(new Date(event.endTime)),
      Description: event.additionalNotes,
      Venue: getLocation({
        videoCallData: event.videoCallData,
        additionalInformation: event.additionalInformation,
        location: event.location,
        uid: event.uid,
      }),
      Who_Id: contacts[0].id,
    };

    return axios({
      method: "post",
      url: token.api_domain + this.eventsSlug,
      headers: {
        "content-type": "application/json",
        authorization: `Zoho-oauthtoken ${token.access_token}`,
      },
      data: JSON.stringify({ data: [biginEvent] }),
    })
      .then((data) => data.data)
      .catch((e) => this.log.error("Error creating bigin event", JSON.stringify(e), e.response?.data));
  }

  /***
   * Handles orchestrating the creation of new events in Zoho Bigin.
   */
  async handleEventCreation(event: CalendarEvent, contacts: Contact[]) {
    const meetingEvent = await this.createBiginEvent(event, contacts);
    if (meetingEvent.data && meetingEvent.data.length && meetingEvent.data[0].status === "success") {
      this.log.debug("event:creation:ok", { meetingEvent });
      return Promise.resolve({
        uid: meetingEvent.data[0].details.id,
        id: meetingEvent.data[0].details.id,
        //FIXME: `externalCalendarId` is required by the `updateAllCalendarEvents` method, but is not used by zoho-bigin App. Not setting this property actually skips calling updateEvent..
        // Here the value doesn't matter. We just need to set it to something.
        externalCalendarId: "NO_CALENDAR_ID_NEEDED",
        type: this.integrationName,
        password: "",
        url: "",
        additionalInfo: { contacts, meetingEvent },
      });
    }
    this.log.debug("meeting:creation:notOk", { meetingEvent, event, contacts });
    return Promise.reject("Something went wrong when creating a meeting in Zoho Bigin");
  }

  /***
   * Creates contacts and event records for new bookings.
   * Initially creates all new attendees as contacts, then creates the event.
   */
  async createEvent(event: CalendarEvent, contacts: Contact[]): Promise<NewCalendarEventType> {
    return await this.handleEventCreation(event, contacts);
  }

  /***
   * Updates an existing event in Zoho Bigin.
   */
  async updateEvent(uid: string, event: CalendarEvent): Promise<NewCalendarEventType> {
    this.log.debug(`Updating Event with uid ${uid}`);
    const token = await this.auth.getToken();
    const biginEvent = {
      id: uid,
      Event_Title: event.title,
      Start_DateTime: toISO8601String(new Date(event.startTime)),
      End_DateTime: toISO8601String(new Date(event.endTime)),
      Description: event.additionalNotes,
      Location: getLocation({
        videoCallData: event.videoCallData,
        additionalInformation: event.additionalInformation,
        location: event.location,
        uid: event.uid,
      }),
    };

    return axios
      .put(token.api_domain + this.eventsSlug, JSON.stringify({ data: [biginEvent] }), {
        headers: {
          "content-type": "application/json",
          authorization: `Zoho-oauthtoken ${token.access_token}`,
        },
      })
      .then((data) => data.data)
      .catch((e) => {
        this.log.error("Error in updating bigin event", JSON.stringify(e), e.response?.data);
      });
  }

  async deleteEvent(uid: string): Promise<void> {
    const token = await this.auth.getToken();
    return axios
      .delete(`${token.api_domain}${this.eventsSlug}?ids=${uid}`, {
        headers: {
          "content-type": "application/json",
          authorization: `Zoho-oauthtoken ${token.access_token}`,
        },
      })
      .then((data) => data.data)
      .catch((e) => this.log.error("Error deleting bigin event", JSON.stringify(e), e.response?.data));
  }

  async getAvailability(
    _dateFrom: string,
    _dateTo: string,
    _selectedCalendars: IntegrationCalendar[]
  ): Promise<EventBusyDate[]> {
    return Promise.resolve([]);
  }

  async listCalendars(_event?: CalendarEvent): Promise<IntegrationCalendar[]> {
    return Promise.resolve([]);
  }

  getAppOptions() {
    console.log("No options implemented");
  }

  async handleAttendeeNoShow() {
    console.log("Not implemented");
  }
}

/**
 * Factory function that creates a Zoho Bigin CRM service instance.
 * This is exported instead of the class to prevent internal types
 * from leaking into the emitted .d.ts file.
 */
export default function BuildCrmService(
  credential: CredentialPayload,
  _appOptions?: Record<string, unknown>
): CRM {
  return new BiginCrmService(credential);
}

const toISO8601String= (date: Date) => {
  const tzo = -date.getTimezoneOffset(),
    dif = tzo >= 0 ? "+" : "-",
    pad = function (num: number) {
      return (num < 10 ? "0" : "") + num;
    };

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${dif}${pad(Math.floor(Math.abs(tzo) / 60))}:${pad(
    Math.abs(tzo) % 60
  )}`;
};
