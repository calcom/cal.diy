import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";
import type {
  Calendar,
  CalendarEvent,
  EventBusyDate,
  GetAvailabilityParams,
  IntegrationCalendar,
  NewCalendarEventType,
} from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";

import getAppKeysFromSlug from "../../_utils/getAppKeysFromSlug";
import { refreshAccessToken as getNewTokens } from "./helpers";
import type { BasecampToken } from "./types";

function hasFileExtension(url: string): boolean {
  // Get the last portion of the URL (after the last '/')
  const fileName = url.substring(url.lastIndexOf("/") + 1);
  // Check if the file name has a '.' in it and no '/' after the '.'
  return fileName.includes(".") && !fileName.substring(fileName.lastIndexOf(".")).includes("/");
}

function getFileExtension(url: string): string {
  // Return null if the URL does not have a file extension
  if (!hasFileExtension(url)) return "ics";
  // Get the last portion of the URL (after the last '/')
  const fileName = url.substring(url.lastIndexOf("/") + 1);
  // Extract the file extension
  return fileName.substring(fileName.lastIndexOf(".") + 1);
}

class BasecampCalendarService implements Calendar {
  private credentials: Record<string, string> = {};
  private auth: Promise<{ configureToken: () => Promise<void> }>;
  private headers: Record<string, string> = {};
  private userAgent = "";
  protected integrationName = "";
  private accessToken = "";
  private scheduleId = 0;
  private userId = 0;
  private projectId = 0;
  private log: typeof logger;

  constructor(credential: CredentialPayload) {
    this.integrationName = "basecamp3";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getAppKeysFromSlug("basecamp3").then(({ user_agent }: any) => {
      this.userAgent = user_agent as string;
    });
    this.auth = this.basecampAuth(credential).then((c) => c);
    this.log = logger.getSubLogger({ prefix: [`[[lib] ${this.integrationName}`] });
  }

  private basecampAuth = async (credential: CredentialPayload) => {
    const credentialKey = credential.key as BasecampToken;
    this.scheduleId = credentialKey.scheduleId;
    this.userId = credentialKey.account.id;
    this.projectId = credentialKey.projectId;
    const isTokenValid = (credentialToken: BasecampToken) => {
      const isValid = credentialToken.access_token && credentialToken.expires_at > Date.now();
      if (isValid) this.accessToken = credentialToken.access_token;
      return isValid;
    };
    const refreshAccessToken = async (credentialToken: CredentialPayload) => {
      try {
        const newCredentialKey = (await getNewTokens(credentialToken)) as BasecampToken;
        this.accessToken = newCredentialKey.access_token;
      } catch (err) {
        this.log.error(err);
      }
    };

    return {
      configureToken: () =>
        isTokenValid(credentialKey) ? Promise.resolve() : refreshAccessToken(credential),
    };
  };

  private async getBasecampDescription(event: CalendarEvent): Promise<string> {
    const timeZone =
      (await this.getUserTimezoneFromDB(event.organizer?.id as number)) ?? event.organizer?.timeZone;
    // Format in the organizer's timezone, since that is the zone named in the description.
    // Without it the server's local time is shown next to the organizer's timezone label.
    const date = new Date(event.startTime).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone,
    });
    const startTime = new Date(event.startTime).toLocaleTimeString("en-US", {
      hour: "numeric",
      hour12: true,
      minute: "numeric",
      timeZone,
    });
    const endTime = new Date(event.endTime).toLocaleTimeString("en-US", {
      hour: "numeric",
      hour12: true,
      minute: "numeric",
      timeZone,
    });
    const baseString = `<div>Event title: ${event.title}<br/>Date and time: ${date}, ${startTime} - ${endTime} ${timeZone}<br/>View on Cal.diy: <a target="_blank" rel="noreferrer" class="autolinked" data-behavior="truncate" href="https://app.cal.com/booking/${event.uid}">https://app.cal.com/booking/${event.uid}</a> `;
    const guestString = `<br/>Guests: ${event.attendees.reduce((acc, attendee) => {
      return `${acc}<br/><a target="_blank" rel="noreferrer" class="autolinked" data-behavior="truncate" href="mailto:${attendee.email}">${attendee.email}</a>`;
    }, "")}`;

    const videoString = event.videoCallData
      ? `<br/>Join on video: ${event.videoCallData.url}</div>`
      : "</div>";
    return baseString + guestString + videoString;
  }

  async createEvent(event: CalendarEvent): Promise<NewCalendarEventType> {
    try {
      const auth = await this.auth;
      await auth.configureToken();
      const description = await this.getBasecampDescription(event);
      const basecampEvent = await fetch(
        `https://3.basecampapi.com/${this.userId}/buckets/${this.projectId}/schedules/${this.scheduleId}/entries.json`,
        {
          method: "POST",
          headers: {
            "User-Agent": this.userAgent,
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            description,
            summary: `Cal.diy: ${event.title}`,
            starts_at: new Date(event.startTime).toISOString(),
            ends_at: new Date(event.endTime).toISOString(),
          }),
        }
      );
      const meetingJson = await basecampEvent.json();
      const id = meetingJson.id;
      this.log.debug("event:creation:ok", { json: meetingJson });
      return Promise.resolve({
        id,
        uid: id,
        type: this.integrationName,
        password: "",
        url: "",
        additionalInfo: { meetingJson },
      });
    } catch (err) {
      this.log.debug("event:creation:notOk", err);
      return Promise.reject({ error: "Unable to book basecamp meeting" });
    }
  }

  async updateEvent(
    uid: string,
    event: CalendarEvent
  ): Promise<NewCalendarEventType | NewCalendarEventType[]> {
    try {
      const auth = await this.auth;
      await auth.configureToken();
      const description = await this.getBasecampDescription(event);

      const basecampEvent = await fetch(
        `https://3.basecampapi.com/${this.userId}/buckets/${this.projectId}/schedule_entries/${uid}.json`,
        {
          method: "PUT",
          headers: {
            "User-Agent": this.userAgent,
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            description,
            summary: `Cal.diy: ${event.title}`,
            starts_at: new Date(event.startTime).toISOString(),
            ends_at: new Date(event.endTime).toISOString(),
          }),
        }
      );
      const meetingJson = await basecampEvent.json();
      const id = meetingJson.id;

      return {
        uid: id,
        type: event.type,
        id,
        password: "",
        url: "",
        additionalInfo: { meetingJson },
      };
    } catch (reason) {
      this.log.error(reason);
      throw reason;
    }
  }

  async deleteEvent(uid: string): Promise<void> {
    try {
      const auth = await this.auth;
      await auth.configureToken();
      const deletedEventResponse = await fetch(
        `https://3.basecampapi.com/${this.userId}/buckets/${this.projectId}/recordings/${uid}/status/trashed.json`,
        {
          method: "PUT",
          headers: {
            "User-Agent": this.userAgent,
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (deletedEventResponse.ok) {
        Promise.resolve("Deleted basecamp meeting");
      } else Promise.reject("Error cancelling basecamp event");
    } catch (reason) {
      this.log.error(reason);
      throw reason;
    }
  }

  /**
   * getUserTimezoneFromDB() retrieves the timezone of a user from the database.
   *
   * @param {number} id - The user's unique identifier.
   * @returns {Promise<string | undefined>} - A Promise that resolves to the user's timezone or "Europe/London" as a default value if the timezone is not found.
   */
  getUserTimezoneFromDB = async (id: number): Promise<string | undefined> => {
    const user = await prisma.user.findUnique({
      where: {
        id,
      },
      select: {
        timeZone: true,
      },
    });
    return user?.timeZone;
  };

  /**
   * getUserId() extracts the user ID from the first calendar in an array of IntegrationCalendars.
   *
   * @param {IntegrationCalendar[]} selectedCalendars - An array of IntegrationCalendars.
   * @returns {number | null} - The user ID associated with the first calendar in the array, or null if the array is empty or the user ID is not found.
   */
  getUserId = (selectedCalendars: IntegrationCalendar[]): number | null => {
    if (selectedCalendars.length === 0) {
      return null;
    }
    return selectedCalendars[0].userId || null;
  };

  isValidFormat = (url: string): boolean => {
    const allowedExtensions = ["eml", "ics"];
    const urlExtension = getFileExtension(url);
    if (!allowedExtensions.includes(urlExtension)) {
      console.error(`Unsupported calendar object format: ${urlExtension}`);
      return false;
    }
    return true;
  };

  async getAvailability(_params: GetAvailabilityParams): Promise<EventBusyDate[]> {
    return Promise.resolve([]);
  }

  async listCalendars(_event?: CalendarEvent): Promise<IntegrationCalendar[]> {
    return Promise.resolve([]);
  }
}

/**
 * Factory function that creates a Basecamp Calendar service instance.
 * This is exported instead of the class to prevent internal types
 * from leaking into the emitted .d.ts file.
 */
export default function BuildCalendarService(credential: CredentialPayload): Calendar {
  return new BasecampCalendarService(credential);
}
