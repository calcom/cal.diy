import {
  APP_CREDENTIAL_SHARING_ENABLED,
  CREDENTIAL_SYNC_ENDPOINT,
  CREDENTIAL_SYNC_SECRET,
  CREDENTIAL_SYNC_SECRET_HEADER_NAME,
} from "@calcom/lib/constants";
import { getLocation } from "@calcom/lib/CalEventParser";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import type {
  CalendarEvent,
  EventBusyDate,
  IntegrationCalendar,
  NewCalendarEventType,
} from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import type { ContactCreateInput, CRM, Contact } from "@calcom/types/CrmService";

import { invalidateCredential } from "../../_utils/invalidateCredential";
import { OAuthManager } from "../../_utils/oauth/OAuthManager";
import { getTokenObjectFromCredential } from "../../_utils/oauth/getTokenObjectFromCredential";
import { markTokenAsExpired } from "../../_utils/oauth/markTokenAsExpired";
import { updateTokenObjectInDb } from "../../_utils/oauth/updateTokenObject";
import appConfig from "../config.json";
import { getPipedriveAppKeys } from "./getPipedriveAppKeys";

type PipedriveContact = {
  id: number;
  name: string;
  first_name: string;
  last_name: string;
  email: Array<{ value: string; primary: boolean }>;
};

type PipedriveActivity = {
  id: number;
  subject: string;
  due_date: string;
  due_time: string;
  duration: string;
  note: string;
  location: string;
  person_id: number;
};

class PipedriveCrmService implements CRM {
  private credential: CredentialPayload;
  private log: typeof logger;
  private auth: OAuthManager;
  private apiDomain: string;

  constructor(credential: CredentialPayload) {
    this.credential = credential;
    this.log = logger.getSubLogger({ prefix: [`[[lib] ${appConfig.slug}`] });

    const tokenResponse = getTokenObjectFromCredential(credential);
    // Pipedrive stores api_domain in the token object
    const key = credential.key as { api_domain?: string };
    this.apiDomain = key.api_domain || "";

    this.auth = new OAuthManager({
      credentialSyncVariables: {
        APP_CREDENTIAL_SHARING_ENABLED: APP_CREDENTIAL_SHARING_ENABLED,
        CREDENTIAL_SYNC_ENDPOINT: CREDENTIAL_SYNC_ENDPOINT,
        CREDENTIAL_SYNC_SECRET: CREDENTIAL_SYNC_SECRET,
        CREDENTIAL_SYNC_SECRET_HEADER_NAME: CREDENTIAL_SYNC_SECRET_HEADER_NAME,
      },
      resourceOwner: {
        type: credential.teamId ? "team" : "user",
        id: credential.teamId ?? credential.userId,
      },
      appSlug: appConfig.slug,
      currentTokenObject: tokenResponse,
      fetchNewTokenObject: async ({ refreshToken }: { refreshToken: string | null }) => {
        if (!refreshToken) {
          return null;
        }
        const { client_id, client_secret } = await getPipedriveAppKeys();
        const authHeader = `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString("base64")}`;
        return fetch("https://oauth.pipedrive.com/oauth/token", {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
          }),
        });
      },
      isTokenObjectUnusable: async function (response) {
        const myLog = logger.getSubLogger({ prefix: ["pipedrive-crm:isTokenObjectUnusable"] });
        myLog.debug(safeStringify({ status: response.status, ok: response.ok }));
        if (!response.ok) {
          let responseBody;
          try {
            responseBody = await response.clone().json();
          } catch {
            return null;
          }
          myLog.debug(safeStringify({ responseBody }));
          // Pipedrive returns "invalid_grant" when refresh token is invalid
          if (responseBody.error === "invalid_grant") {
            return { reason: responseBody.error };
          }
        }
        return null;
      },
      isAccessTokenUnusable: async function (response) {
        const myLog = logger.getSubLogger({ prefix: ["pipedrive-crm:isAccessTokenUnusable"] });
        myLog.debug(safeStringify({ status: response.status, ok: response.ok }));
        if (!response.ok && response.status === 401) {
          let responseBody;
          try {
            responseBody = await response.clone().json();
          } catch {
            return null;
          }
          myLog.debug(safeStringify({ responseBody }));
          // Pipedrive returns 401 with error when access token is invalid
          if (responseBody.error) {
            return { reason: responseBody.error };
          }
        }
        return null;
      },
      invalidateTokenObject: () => invalidateCredential(credential.id),
      expireAccessToken: () => markTokenAsExpired(credential),
      updateTokenObject: async (newTokenObject) => {
        // Update api_domain in instance if it changed
        if (newTokenObject.api_domain) {
          this.apiDomain = newTokenObject.api_domain as string;
        }
        await updateTokenObjectInDb({
          authStrategy: "oauth",
          credentialId: credential.id,
          tokenObject: newTokenObject,
        });
      },
    });
  }

  private async requestPipedrive<T = unknown>(endpoint: string, options?: RequestInit): Promise<T> {
    // Ensure we have a valid token and get the latest api_domain
    const { token } = await this.auth.getTokenObjectOrFetch();
    const apiDomain = (token as { api_domain?: string }).api_domain || this.apiDomain;

    const { json } = await this.auth.request({
      url: `${apiDomain}/api/v1/${endpoint}`,
      options: {
        method: "GET",
        ...options,
      },
    });

    return json as T;
  }

  async createContacts(contactsToCreate: ContactCreateInput[]): Promise<Contact[]> {
    const result = contactsToCreate.map(async (attendee) => {
      const [firstName, lastName] = attendee.name ? attendee.name.split(" ") : [attendee.email, ""];

      const bodyData = {
        name: attendee.name || attendee.email,
        first_name: firstName,
        last_name: lastName || "",
        email: [{ value: attendee.email, primary: true }],
      };

      try {
        const response = await this.requestPipedrive<{ success: boolean; data: PipedriveContact }>(
          "persons",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(bodyData),
          }
        );

        if (response.success && response.data) {
          const contact = response.data;
          return {
            id: contact.id.toString(),
            email: contact.email[0]?.value || attendee.email,
            firstName: contact.first_name,
            lastName: contact.last_name,
            name: contact.name,
          };
        }
        throw new Error("Failed to create contact");
      } catch (error) {
        this.log.error("Error creating contact:", error);
        throw error;
      }
    });

    return await Promise.all(result);
  }

  async getContacts({ emails }: { emails: string | string[] }): Promise<Contact[]> {
    const emailArray = Array.isArray(emails) ? emails : [emails];

    const result = emailArray.map(async (email) => {
      try {
        const response = await this.requestPipedrive<{
          success: boolean;
          data: { items: Array<{ item: PipedriveContact }> };
        }>(`persons/search?term=${encodeURIComponent(email)}&fields=email`);

        if (response.success && response.data?.items) {
          return response.data.items.map((item) => {
            const contact = item.item;
            return {
              id: contact.id.toString(),
              email: contact.email[0]?.value || email,
              firstName: contact.first_name,
              lastName: contact.last_name,
              name: contact.name,
            };
          });
        }
        return [];
      } catch (error) {
        this.log.error("Error searching contacts:", error);
        return [];
      }
    });

    const results = await Promise.all(result);
    return results.flat();
  }

  private getMeetingBody = (event: CalendarEvent): string => {
    return `${event.organizer.language.translate("invitee_timezone")}: ${
      event.attendees[0].timeZone
    }\n\n${event.organizer.language.translate("share_additional_notes")}\n${event.additionalNotes || "-"}`;
  };

  private createPipedriveActivity = async (event: CalendarEvent, contacts: Contact[]) => {
    const startDate = new Date(event.startTime);
    const endDate = new Date(event.endTime);
    const duration = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));

    const activityPayload = {
      subject: event.title,
      type: "meeting",
      due_date: startDate.toISOString().split("T")[0],
      due_time: startDate.toISOString().split("T")[1].substring(0, 5),
      duration: `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")}`,
      note: this.getMeetingBody(event),
      location: getLocation({
        videoCallData: event.videoCallData,
        additionalInformation: event.additionalInformation,
        location: event.location,
        uid: event.uid,
      }),
     person_id: parseInt(contacts[0].id),
    };

    return this.requestPipedrive<{ success: boolean; data: PipedriveActivity }>("activities", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(activityPayload),
    });
  };

  private updateActivity = async (uid: string, event: CalendarEvent) => {
    const startDate = new Date(event.startTime);
    const endDate = new Date(event.endTime);
    const duration = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));

    const activityPayload = {
      subject: event.title,
      due_date: startDate.toISOString().split("T")[0],
      due_time: startDate.toISOString().split("T")[1].substring(0, 5),
      duration: `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")}`,
      note: this.getMeetingBody(event),
      location: getLocation({
        videoCallData: event.videoCallData,
        additionalInformation: event.additionalInformation,
        location: event.location,
        uid: event.uid,
      }),
    };

    return this.requestPipedrive<{ success: boolean; data: PipedriveActivity }>(`activities/${uid}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(activityPayload),
    });
  };

  private deleteActivity = async (uid: string) => {
    return this.requestPipedrive<{ success: boolean }>(`activities/${uid}`, {
      method: "DELETE",
    });
  };

  async handleEventCreation(event: CalendarEvent, contacts: Contact[]) {
    const meetingEvent = await this.createPipedriveActivity(event, contacts);

    if (meetingEvent.success && meetingEvent.data) {
      this.log.debug("event:creation:ok", { meetingEvent });
      return Promise.resolve({
        uid: meetingEvent.data.id.toString(),
        id: meetingEvent.data.id.toString(),
        type: appConfig.slug,
        password: "",
        url: "",
        additionalInfo: { contacts, meetingEvent },
      });
    }

    this.log.debug("meeting:creation:notOk", { meetingEvent, event, contacts });
    return Promise.reject("Something went wrong when creating a meeting in PipedriveCRM");
  }

  async createEvent(event: CalendarEvent, contacts: Contact[]): Promise<NewCalendarEventType> {
    return await this.handleEventCreation(event, contacts);
  }

  async updateEvent(uid: string, event: CalendarEvent): Promise<NewCalendarEventType> {
    const meetingEvent = await this.updateActivity(uid, event);

    if (meetingEvent.success && meetingEvent.data) {
      this.log.debug("event:updation:ok", { meetingEvent });
      return Promise.resolve({
        uid: meetingEvent.data.id.toString(),
        id: meetingEvent.data.id.toString(),
        type: appConfig.slug,
        password: "",
        url: "",
        additionalInfo: { meetingEvent },
      });
    }

    this.log.debug("meeting:updation:notOk", { meetingEvent, event });
    return Promise.reject("Something went wrong when updating a meeting in PipedriveCRM");
  }

  async deleteEvent(uid: string): Promise<void> {
    await this.deleteActivity(uid);
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
 * Factory function that creates a Pipedrive CRM service instance.
 * This is exported instead of the class to prevent internal types
 * from leaking into the emitted .d.ts file.
 */
export default function BuildCrmService(
  credential: CredentialPayload,
  _appOptions?: Record<string, unknown>
): CRM {
  return new PipedriveCrmService(credential);
}
