/* eslint-disable @typescript-eslint/no-explicit-any */

import { MeetLocationType } from "@calcom/app-store/constants";
import { getDestinationCalendarRepository } from "@calcom/features/di/containers/DestinationCalendar";
import { SelectedCalendarRepository } from "@calcom/features/selectedCalendar/repositories/SelectedCalendarRepository";
import { getLocation, getRichDescription } from "@calcom/lib/CalEventParser";
import { ORGANIZER_EMAIL_EXEMPT_DOMAINS } from "@calcom/lib/constants";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import type { Prisma } from "@calcom/prisma/client";
import type {
  Calendar,
  CalendarEvent,
  CalendarServiceEvent,
  EventBusyDate,
  GetAvailabilityParams,
  IntegrationCalendar,
  NewCalendarEventType,
  SelectedCalendarEventTypeIds,
} from "@calcom/types/Calendar";
import type { CredentialForCalendarServiceWithEmail } from "@calcom/types/Credential";
import type { calendar_v3 } from "@googleapis/calendar";
import type { GaxiosResponse } from "googleapis-common";
import { RRule } from "rrule";

import { AxiosLikeResponseToFetchResponse } from "../../_utils/oauth/AxiosLikeResponseToFetchResponse";
import { CalendarAuth } from "./CalendarAuth";

type FreeBusyArgs = { timeMin: string; timeMax: string; items: { id: string }[] };

const log = logger.getSubLogger({ prefix: ["app-store/googlecalendar/lib/CalendarService"] });

/**
 * Google system calendars that don't return proper free/busy information,
 * making them useless for availability checking. These include:
 * - Holiday calendars (e.g., "en.usa#holiday@group.v.calendar.google.com")
 * - Birthdays/contacts calendar ("addressbook#contacts@group.v.calendar.google.com")
 */
const GOOGLE_SYSTEM_CALENDAR_SUFFIXES = [
  "#holiday@group.v.calendar.google.com",
  "#contacts@group.v.calendar.google.com",
];

function isGoogleSystemCalendar(calendarId: string | null | undefined): boolean {
  if (!calendarId) return false;
  return GOOGLE_SYSTEM_CALENDAR_SUFFIXES.some((suffix) => calendarId.endsWith(suffix));
}

/**
 * Extended interface for Google Calendar service that includes Google-specific methods.
 * This interface is used by internal Google Calendar modules (callback, tests, etc.)
 * that need access to Google-specific functionality beyond the generic Calendar interface.
 */
export interface GoogleCalendar extends Calendar {
  getPrimaryCalendar(calendar?: unknown): Promise<{ id?: string | null; timeZone?: string | null } | null>;

  upsertSelectedCalendar(
    data: Omit<Prisma.SelectedCalendarUncheckedCreateInput, "integration" | "credentialId" | "userId">
  ): Promise<unknown>;

  createSelectedCalendar(
    data: Omit<Prisma.SelectedCalendarUncheckedCreateInput, "integration" | "credentialId">
  ): Promise<unknown>;

  authedCalendar(): Promise<calendar_v3.Calendar>;
}

interface GoogleCalError extends Error {
  code?: number;
}

const isGaxiosResponse = (error: unknown): error is GaxiosResponse<calendar_v3.Schema$Event> =>
  // biome-ignore lint/suspicious/noPrototypeBuiltins: Object.hasOwn not available in all build targets
  typeof error === "object" && !!error && Object.prototype.hasOwnProperty.call(error, "config");

class GoogleCalendarService implements Calendar {
  private integrationName = "";
  private auth: CalendarAuth;
  private log: typeof logger;
  private credential: CredentialForCalendarServiceWithEmail;

  constructor(credential: CredentialForCalendarServiceWithEmail) {
    this.integrationName = "google_calendar";
    this.credential = credential;
    this.auth = new CalendarAuth(credential);
    this.log = log.getSubLogger({ prefix: [`[[lib] ${this.integrationName}`] });
  }

  private async getReminderDuration(credentialId: number): Promise<number | null> {
    try {
      const destinationCalendarRepository = getDestinationCalendarRepository();
      return await destinationCalendarRepository.getCustomReminderByCredentialId(credentialId);
    } catch (error) {
      this.log.warn("Failed to fetch custom calendar reminder", safeStringify(error));
      return null;
    }
  }

  private getReminders(customReminderMinutes: number | null): {
    useDefault: boolean;
    overrides?: { method: string; minutes: number }[];
  } {
    if (customReminderMinutes !== null) {
      return {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: customReminderMinutes },
          { method: "email", minutes: customReminderMinutes },
        ],
      };
    }
    return { useDefault: true };
  }

  public getCredentialId() {
    return this.credential.id;
  }

  public async authedCalendar(): Promise<calendar_v3.Calendar> {
    this.log.debug("Getting authed calendar");
    return this.auth.getClient();
  }

  private getAttendees = ({
    event,
    hostExternalCalendarId,
  }: {
    event: CalendarEvent;
    hostExternalCalendarId?: string;
  }) => {
    // When rescheduling events we know the external id of the calendar so we can just look for it in the destinationCalendar array.
    const selectedHostDestinationCalendar = event.destinationCalendar?.find(
      (cal) => cal.credentialId === this.credential.id
    );

    const isOrganizerExempt = ORGANIZER_EMAIL_EXEMPT_DOMAINS?.split(",")
      .filter((domain) => domain.trim() !== "")
      .some((domain) => event.organizer.email.toLowerCase().endsWith(domain.toLowerCase()));

    const eventAttendees = event.attendees.map(({ id: _id, ...rest }) => ({
      ...rest,
      responseStatus: "accepted",
    }));

    const attendees: calendar_v3.Schema$EventAttendee[] = [
      {
        ...event.organizer,
        id: String(event.organizer.id),
        responseStatus: "accepted",
        organizer: true,
        // Tried changing the display name to the user but GCal will not let you do that. It will only display the name of the external calendar. Leaving this in just incase it works in the future.
        displayName: event.organizer.name,
        // We use || instead of ?? here to handle empty strings
        email: hostExternalCalendarId || selectedHostDestinationCalendar?.externalId || event.organizer.email,
      },
      ...(event.hideOrganizerEmail && !isOrganizerExempt ? [] : eventAttendees),
    ];

    if (event.team?.members) {
      // TODO: Check every other CalendarService for team members
      const teamAttendeesWithoutCurrentUser = event.team.members
        .filter((member) => member.email !== this.credential.user?.email)
        .map((m) => {
          const teamMemberDestinationCalendar = event.destinationCalendar?.find(
            (calendar) => calendar.integration === "google_calendar" && calendar.userId === m.id
          );
          return {
            email: teamMemberDestinationCalendar?.externalId ?? m.email,
            displayName: m.name,
            responseStatus: "accepted",
          };
        });
      attendees.push(...teamAttendeesWithoutCurrentUser);
    }

    return attendees;
  };

  async createEvent(
    calEvent: CalendarServiceEvent,
    credentialId: number,
    externalCalendarId?: string
  ): Promise<NewCalendarEventType> {
    this.log.debug("Creating event");

    // Fetch custom reminder duration for this credential's destination calendar
    const customReminderMinutes = await this.getReminderDuration(credentialId);

    const payload: calendar_v3.Schema$Event = {
      summary: calEvent.title,
      description: calEvent.calendarDescription,
      start: {
        dateTime: calEvent.startTime,
        timeZone: calEvent.organizer.timeZone,
      },
      end: {
        dateTime: calEvent.endTime,
        timeZone: calEvent.organizer.timeZone,
      },
      attendees: this.getAttendees({ event: calEvent, hostExternalCalendarId: externalCalendarId }),
      reminders: this.getReminders(customReminderMinutes),
      guestsCanSeeOtherGuests: calEvent.seatsPerTimeSlot ? calEvent.seatsShowAttendees : true,
      iCalUID: calEvent.iCalUID,
    };
    if (calEvent.hideCalendarEventDetails) {
      payload.visibility = "private";
    }

    if (calEvent.location) {
      payload["location"] = getLocation({
        videoCallData: calEvent.videoCallData,
        additionalInformation: calEvent.additionalInformation,
        location: calEvent.location,
        uid: calEvent.uid,
      });
    }

    if (calEvent.recurringEvent) {
      const rule = new RRule({
        freq: calEvent.recurringEvent.freq,
        interval: calEvent.recurringEvent.interval,
        count: calEvent.recurringEvent.count,
      });

      payload["recurrence"] = [rule.toString()];
    }

    if (calEvent.conferenceData && calEvent.location === MeetLocationType) {
      payload["conferenceData"] = calEvent.conferenceData;
    }
    const calendar = await this.authedCalendar();
    // Find in formattedCalEvent.destinationCalendar the one with the same credentialId

    const selectedCalendar =
      externalCalendarId ??
      (calEvent.destinationCalendar?.find((cal) => cal.credentialId === credentialId)?.externalId ||
        "primary");

    try {
      let event: calendar_v3.Schema$Event | undefined;
      let recurringEventId = null;
      if (calEvent.existingRecurringEvent) {
        recurringEventId = calEvent.existingRecurringEvent.recurringEventId;
        const recurringEventInstances = await calendar.events.instances({
          calendarId: selectedCalendar,
          eventId: calEvent.existingRecurringEvent.recurringEventId,
        });
        if (recurringEventInstances.data.items) {
          // Compare timestamps directly for more reliable and faster matching
          const calComEventStartTimeMs = new Date(calEvent.startTime).getTime();
          for (let i = 0; i < recurringEventInstances.data.items.length; i++) {
            const instance = recurringEventInstances.data.items[i];
            const instanceStartTimeMs = new Date(instance.start?.dateTime || "").getTime();

            if (instanceStartTimeMs === calComEventStartTimeMs) {
              event = instance;
              break;
            }
          }

          if (!event) {
            event = recurringEventInstances.data.items[0];
            this.log.error(
              "Unable to find matching event amongst recurring event instances",
              safeStringify({ selectedCalendar, credentialId })
            );
          }
          await calendar.events.patch({
            calendarId: selectedCalendar,
            eventId: event.id || "",
            requestBody: {
              location: getLocation({
                videoCallData: calEvent.videoCallData,
                additionalInformation: calEvent.additionalInformation,
                location: calEvent.location,
                uid: calEvent.uid,
              }),
              description: calEvent.calendarDescription,
            },
          });
        }
      } else {
        const eventResponse = await calendar.events.insert({
          calendarId: selectedCalendar,
          requestBody: payload,
          conferenceDataVersion: 1,
          sendUpdates: "none",
        });
        event = eventResponse.data;
        if (event.recurrence) {
          if (event.recurrence.length > 0) {
            recurringEventId = event.id;
            event = await this.getFirstEventInRecurrence(recurringEventId, selectedCalendar, calendar);
          }
        }
      }

      if (event && event.id && event.hangoutLink) {
        await calendar.events.patch({
          // Update the same event but this time we know the hangout link
          calendarId: selectedCalendar,
          eventId: event.id || "",
          sendUpdates: "none",
          requestBody: {
            description: getRichDescription({
              ...calEvent,
              additionalInformation: { hangoutLink: event.hangoutLink },
            }),
            location: getLocation({
              videoCallData: calEvent.videoCallData,
              additionalInformation: {
                ...calEvent.additionalInformation,
                hangoutLink: event.hangoutLink,
              },
              location: calEvent.location,
              uid: calEvent.uid,
            }),
          },
        });
      }

      return {
        uid: "",
        ...event,
        id: event?.id || "",
        thirdPartyRecurringEventId: recurringEventId,
        additionalInfo: {
          hangoutLink: event?.hangoutLink || "",
        },
        type: "google_calendar",
        password: "",
        url: "",
        iCalUID: event?.iCalUID,
      };
    } catch (error) {
      if (isGaxiosResponse(error)) {
        // Prevent clogging up the logs with the body of the request
        // Plus, we already have this data in error.data.summary
        delete error.config.body;
      }
      this.log.error(
        "There was an error creating event in google calendar: ",
        safeStringify({ error, selectedCalendar, credentialId })
      );
      throw error;
    }
  }
  async getFirstEventInRecurrence(
    recurringEventId: string | null | undefined,
    selectedCalendar: string,
    calendar: calendar_v3.Calendar
  ): Promise<calendar_v3.Schema$Event> {
    const recurringEventInstances = await calendar.events.instances({
      calendarId: selectedCalendar,
      eventId: recurringEventId || "",
    });

    if (recurringEventInstances.data.items) {
      return recurringEventInstances.data.items[0];
    } else {
      return {} as calendar_v3.Schema$Event;
    }
  }

  async updateEvent(uid: string, event: CalendarServiceEvent, externalCalendarId: string): Promise<any> {
    // Fetch custom reminder duration for this credential's destination calendar
    const customReminderMinutes = await this.getReminderDuration(this.credential.id);

    const payload: calendar_v3.Schema$Event = {
      summary: event.title,
      description: event.calendarDescription,
      start: {
        dateTime: event.startTime,
        timeZone: event.organizer.timeZone,
      },
      end: {
        dateTime: event.endTime,
        timeZone: event.organizer.timeZone,
      },
      attendees: this.getAttendees({ event, hostExternalCalendarId: externalCalendarId }),
      reminders: this.getReminders(customReminderMinutes),
      guestsCanSeeOtherGuests: event.seatsPerTimeSlot ? event.seatsShowAttendees : true,
    };

    if (event.location) {
      payload["location"] = getLocation({
        videoCallData: event.videoCallData,
        additionalInformation: event.additionalInformation,
        location: event.location,
        uid: event.uid,
      });
    }

    if (event.conferenceData && event.location === MeetLocationType) {
      payload["conferenceData"] = event.conferenceData;
    }

    const calendar = await this.authedCalendar();

    const selectedCalendar =
      (externalCalendarId
        ? event.destinationCalendar?.find((cal) => cal.externalId === externalCalendarId)?.externalId
        : undefined) || "primary";

    try {
      const evt = await calendar.events.update({
        calendarId: selectedCalendar,
        eventId: uid,
        sendNotifications: true,
        sendUpdates: "none",
        requestBody: payload,
        conferenceDataVersion: 1,
      });

      this.log.debug("Updated Google Calendar Event", {
        startTime: evt?.data.start,
        endTime: evt?.data.end,
      });

      if (evt && evt.data.id && evt.data.hangoutLink && event.location === MeetLocationType) {
        await calendar.events.patch({
          // Update the same event but this time we know the hangout link
          calendarId: selectedCalendar,
          eventId: evt.data.id || "",
          requestBody: {
            description: getRichDescription({
              ...event,
              additionalInformation: { hangoutLink: evt.data.hangoutLink },
            }),
            location: getLocation({
              videoCallData: event.videoCallData,
              additionalInformation: {
                ...event.additionalInformation,
                hangoutLink: evt.data.hangoutLink,
              },
              location: event.location,
              uid: event.uid,
            }),
          },
        });
        return {
          uid: "",
          ...evt.data,
          id: evt.data.id || "",
          additionalInfo: {
            hangoutLink: evt.data.hangoutLink || "",
          },
          type: "google_calendar",
          password: "",
          url: "",
          iCalUID: evt.data.iCalUID,
        };
      }
      return evt?.data;
    } catch (error) {
      this.log.error(
        "There was an error updating event in google calendar: ",
        safeStringify({ error, event, uid })
      );
      throw error;
    }
  }

  async deleteEvent(uid: string, event: CalendarEvent, externalCalendarId?: string | null): Promise<void> {
    const calendar = await this.authedCalendar();

    const selectedCalendar = externalCalendarId || "primary";

    try {
      const event = await calendar.events.delete({
        calendarId: selectedCalendar,
        eventId: uid,
        sendNotifications: false,
        sendUpdates: "none",
      });
      return event?.data;
    } catch (error) {
      this.log.error(
        "There was an error deleting event from google calendar: ",
        safeStringify({ error, event, externalCalendarId })
      );
      const err = error as GoogleCalError;
      /**
       *  410 is when an event is already deleted on the Google cal before on cal.com
       *  404 is when the event is on a different calendar
       */
      if (err.code === 410) return;
      console.error("There was an error contacting google calendar service: ", err);
      if (err.code === 404) return;
      throw err;
    }
  }

  async fetchAvailability(requestBody: FreeBusyArgs): Promise<calendar_v3.Schema$FreeBusyResponse> {
    log.debug("fetchAvailability", safeStringify({ requestBody }));
    const calendar = await this.authedCalendar();
    const apiResponse = await this.auth.authManager.request(
      async () => new AxiosLikeResponseToFetchResponse(await calendar.freebusy.query({ requestBody }))
    );
    return apiResponse.json;
  }

  async getFreeBusyResult(args: FreeBusyArgs): Promise<calendar_v3.Schema$FreeBusyResponse> {
    return await this.fetchAvailability(args);
  }

  getValidCalendars<T extends { id?: string | null }>(cals: T[]) {
    return cals.filter((cal): cal is T & { id: string } => !!cal.id);
  }

  filterPrimaryCalendar(cals: calendar_v3.Schema$CalendarListEntry[]) {
    const validCals = this.getValidCalendars(cals);
    const primaryCal = validCals.find((cal) => !!cal.primary);
    if (primaryCal) {
      return primaryCal;
    }
    return validCals[0];
  }

  async getFreeBusyData(args: FreeBusyArgs): Promise<(EventBusyDate & { id: string })[] | null> {
    const freeBusyResult = await this.getFreeBusyResult(args);
    if (!freeBusyResult.calendars) return null;

    const result = Object.entries(freeBusyResult.calendars).reduce(
      (c, [id, i]) => {
        i.busy?.forEach((busyTime) => {
          c.push({
            id,
            start: busyTime.start || "",
            end: busyTime.end || "",
          });
        });
        return c;
      },
      [] as (EventBusyDate & { id: string })[]
    );

    return result;
  }

  async getAvailabilityWithTimeZones(params: GetAvailabilityParams): Promise<EventBusyDate[]> {
    const { dateFrom, dateTo, selectedCalendars, fallbackToPrimary } = params;
    const calendar = await this.authedCalendar();
    const selectedCalendarIds = selectedCalendars
      .filter((e) => e.integration === this.integrationName)
      .map((e) => e.externalId);
    if (selectedCalendarIds.length === 0 && selectedCalendars.length > 0) {
      // Only calendars of other integrations selected
      return [];
    }

    const getCalIdsWithTimeZone = async () => {
      const cals = await this.getAllCalendars(calendar, ["id", "timeZone"]);
      if (!cals.length) return [];

      if (selectedCalendarIds.length !== 0) {
        return selectedCalendarIds.map((selectedCalendarId) => {
          const calWithTz = cals.find((cal) => cal.id === selectedCalendarId);
          return {
            id: selectedCalendarId,
            timeZone: calWithTz?.timeZone || "",
          };
        });
      }
      if (!fallbackToPrimary) return [];

      const primaryCalendar = this.filterPrimaryCalendar(cals);
      if (!primaryCalendar) return [];
      return [
        {
          id: primaryCalendar.id,
          timeZone: primaryCalendar.timeZone || "",
        },
      ];
    };

    try {
      const calIdsWithTimeZone = await getCalIdsWithTimeZone();
      const calIds = calIdsWithTimeZone.map((calIdWithTimeZone) => ({ id: calIdWithTimeZone.id }));
      const freeBusyData = await this.getFreeBusyData({
        timeMin: dateFrom,
        timeMax: dateTo,
        items: calIds,
      });
      if (!freeBusyData) throw new Error("No response from google calendar");

      const timeZoneMap = new Map(calIdsWithTimeZone.map((cal) => [cal.id, cal.timeZone]));

      const freeBusyDataWithTimeZone = freeBusyData.map((freeBusy) => {
        return {
          start: freeBusy.start,
          end: freeBusy.end,
          timeZone: timeZoneMap.get(freeBusy.id) || "",
        };
      });

      return freeBusyDataWithTimeZone;
    } catch (error) {
      this.log.error(
        "There was an error getting availability from google calendar: ",
        safeStringify({ error, selectedCalendars })
      );
      throw error;
    }
  }

  /**
   * Converts FreeBusy response data to EventBusyDate array
   */
  private convertFreeBusyToEventBusyDates(
    freeBusyResult: calendar_v3.Schema$FreeBusyResponse
  ): EventBusyDate[] {
    if (!freeBusyResult.calendars) return [];

    return Object.values(freeBusyResult.calendars).flatMap(
      (calendar) =>
        calendar.busy?.map((busyTime) => ({
          start: busyTime.start || "",
          end: busyTime.end || "",
        })) || []
    );
  }

  /**
   * Gets calendar IDs for the request, either from selected calendars or fallback logic
   */
  private async getCalendarIds(
    selectedCalendarIds: string[],
    fallbackToPrimary?: boolean
  ): Promise<string[]> {
    if (selectedCalendarIds.length !== 0) return selectedCalendarIds;

    const calendar = await this.authedCalendar();
    const cals = await this.getAllCalendars(calendar, ["id", "primary"]);
    if (!cals.length) return [];

    if (!fallbackToPrimary) {
      return this.getValidCalendars(cals).map((cal) => cal.id);
    }

    const primaryCalendar = this.filterPrimaryCalendar(cals);
    return primaryCalendar ? [primaryCalendar.id] : [];
  }

  /**
   * Fetches availability data using the cache-or-fetch pattern
   */
  private async fetchAvailabilityData(
    calendarIds: string[],
    dateFrom: string,
    dateTo: string
  ): Promise<EventBusyDate[]> {
    // More efficient date difference calculation using native Date objects
    // Use Math.floor to match dayjs diff behavior (truncates, doesn't round up)
    const fromDate = new Date(dateFrom);
    const toDate = new Date(dateTo);
    const oneDayMs = 1000 * 60 * 60 * 24;
    const diff = Math.floor((toDate.getTime() - fromDate.getTime()) / oneDayMs);

    // Google API only allows a date range of 90 days for /freebusy
    if (diff <= 90) {
      const freeBusyData = await this.getFreeBusyData({
        timeMin: dateFrom,
        timeMax: dateTo,
        items: calendarIds.map((id) => ({ id })),
      });

      if (!freeBusyData) throw new Error("No response from google calendar");
      return freeBusyData.map((freeBusy) => ({ start: freeBusy.start, end: freeBusy.end }));
    }

    // Handle longer periods by chunking into 90-day periods
    const busyData: EventBusyDate[] = [];
    const loopsNumber = Math.ceil(diff / 90);
    let currentStartTime = fromDate.getTime();
    const originalEndTime = toDate.getTime();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const oneMinuteMs = 60 * 1000;

    for (let i = 0; i < loopsNumber; i++) {
      let currentEndTime = currentStartTime + ninetyDaysMs;

      // Don't go beyond the original end date
      if (currentEndTime > originalEndTime) {
        currentEndTime = originalEndTime;
      }

      const chunkData = await this.getFreeBusyData({
        timeMin: new Date(currentStartTime).toISOString(),
        timeMax: new Date(currentEndTime).toISOString(),
        items: calendarIds.map((id) => ({ id })),
      });

      if (chunkData) {
        busyData.push(...chunkData.map((freeBusy) => ({ start: freeBusy.start, end: freeBusy.end })));
      }

      currentStartTime = currentEndTime + oneMinuteMs;
    }

    return busyData;
  }

  async getAvailability(params: GetAvailabilityParams): Promise<EventBusyDate[]> {
    const { dateFrom, dateTo, selectedCalendars, fallbackToPrimary } = params;
    this.log.debug("Getting availability", safeStringify({ dateFrom, dateTo, selectedCalendars }));

    const selectedCalendarIds = selectedCalendars
      .filter((e) => e.integration === this.integrationName)
      .map((e) => e.externalId);

    // Early return if only other integrations are selected
    if (selectedCalendarIds.length === 0 && selectedCalendars.length > 0) {
      return [];
    }

    try {
      const calendarIds = await this.getCalendarIds(selectedCalendarIds, fallbackToPrimary);
      return await this.fetchAvailabilityData(calendarIds, dateFrom, dateTo);
    } catch (error) {
      this.log.error(
        "There was an error getting availability from google calendar: ",
        safeStringify({ error, selectedCalendars })
      );
      throw error;
    }
  }

  async listCalendars(): Promise<IntegrationCalendar[]> {
    this.log.debug("Listing calendars");
    const calendar = await this.authedCalendar();
    try {
      const { json: cals } = await this.auth.authManager.request(
        async () =>
          new AxiosLikeResponseToFetchResponse({
            status: 200,
            statusText: "OK",
            data: {
              items: await this.getAllCalendars(calendar),
            },
          })
      );

      if (!cals.items) return [];

      // Filter out Google system calendars (holidays, birthdays) as they don't return proper free/busy information
      const filteredCalendars = cals.items.filter((cal) => !isGoogleSystemCalendar(cal.id));

      return filteredCalendars.map(
        (cal) =>
          ({
            externalId: cal.id ?? "No id",
            integration: this.integrationName,
            name: cal.summary ?? "No name",
            primary: cal.primary ?? false,
            readOnly: !(cal.accessRole === "writer" || cal.accessRole === "owner") && true,
            email: cal.id ?? "",
          }) satisfies IntegrationCalendar
      );
    } catch (error) {
      this.log.error("There was an error getting calendars: ", safeStringify(error));
      throw error;
    }
  }

  async testDelegationCredentialSetup(): Promise<void> {
    log.debug("Testing delegation credential setup");
    try {
      const calendar = await this.authedCalendar();
      const cals = await calendar.calendarList.list({ fields: "items(id)" });
      if (!cals.data.items) {
        throw new Error("No calendars found - delegation credential may not have proper access");
      }
    } catch (error) {
      const googleError = error as { code?: number; message?: string };
      if (googleError.code === 401) {
        throw new Error(
          `Google API authentication failed: ${googleError.message || "Invalid credentials or insufficient permissions"}`
        );
      }
      if (googleError.code === 403) {
        throw new Error(
          `Google API access denied: ${googleError.message || "The service account may not have domain-wide delegation enabled or the required scopes"}`
        );
      }
      throw error;
    }
  }

  async createSelectedCalendar(
    data: Omit<Prisma.SelectedCalendarUncheckedCreateInput, "integration" | "credentialId">
  ) {
    return await SelectedCalendarRepository.create({
      ...data,
      integration: this.integrationName,
      credentialId: this.credential.id,
    });
  }

  async upsertSelectedCalendar(
    data: Omit<Prisma.SelectedCalendarUncheckedCreateInput, "integration" | "credentialId" | "userId">
  ) {
    if (!this.credential.userId) {
      logger.error("upsertSelectedCalendar failed. userId is missing.");
      return;
    }
    return await SelectedCalendarRepository.upsert({
      ...data,
      eventTypeId: data.eventTypeId ?? null,
      integration: this.integrationName,
      credentialId: this.credential.id,
      userId: this.credential.userId,
    });
  }

  async upsertSelectedCalendarsForEventTypeIds(
    data: Omit<Prisma.SelectedCalendarUncheckedCreateInput, "integration" | "credentialId" | "userId">,
    eventTypeIds: SelectedCalendarEventTypeIds
  ) {
    log.debug(
      "upsertSelectedCalendarsForEventTypeIds",
      safeStringify({ data, eventTypeIds, credential: this.credential })
    );
    if (!this.credential.userId) {
      logger.error("upsertSelectedCalendarsForEventTypeIds failed. userId is missing.");
      return;
    }

    await SelectedCalendarRepository.upsertManyForEventTypeIds({
      data: {
        ...data,
        integration: this.integrationName,
        credentialId: this.credential.id,
        delegationCredentialId: this.credential.delegatedToId ?? null,
        userId: this.credential.userId,
      },
      eventTypeIds,
    });
  }

  async getAllCalendars(
    calendar: calendar_v3.Calendar,
    fields: string[] = ["id", "summary", "primary", "accessRole"]
  ): Promise<calendar_v3.Schema$CalendarListEntry[]> {
    let allCalendars: calendar_v3.Schema$CalendarListEntry[] = [];
    let pageToken: string | undefined;

    try {
      do {
        const response: any = await calendar.calendarList.list({
          fields: `items(${fields.join(",")}),nextPageToken`,
          pageToken,
          maxResults: 250, // 250 is max
        });

        allCalendars = [...allCalendars, ...(response.data.items ?? [])];
        pageToken = response.data.nextPageToken;
      } while (pageToken);

      return allCalendars;
    } catch (error) {
      logger.error("Error fetching all Google Calendars", { error });
      throw error;
    }
  }

  async getPrimaryCalendar(_calendar?: calendar_v3.Calendar): Promise<calendar_v3.Schema$Calendar | null> {
    try {
      const calendar = _calendar ?? (await this.authedCalendar());
      const response = await calendar.calendars.get({
        calendarId: "primary",
      });
      return response.data;
    } catch (error) {
      // should not be reached because Google Cal always has a primary cal
      logger.error("Error getting primary calendar", { error });
      throw error;
    }
  }

  async getMainTimeZone(): Promise<string> {
    try {
      const primaryCalendar = await this.getPrimaryCalendar();
      if (!primaryCalendar?.timeZone) {
        this.log.warn("No timezone found in primary calendar, defaulting to UTC");
        return "UTC";
      }
      return primaryCalendar.timeZone;
    } catch (error) {
      this.log.error("Error getting main timezone from Google Calendar", { error });
      throw error;
    }
  }
}

/**
 * Factory function that creates a Google Calendar service instance.
 * This is exported instead of the class to prevent SDK types (like calendar_v3.Calendar)
 * from leaking into the emitted .d.ts file, which would cause TypeScript to load
 * all Google API SDK declaration files when type-checking dependent packages.
 */
export default function BuildCalendarService(credential: CredentialForCalendarServiceWithEmail): Calendar {
  return new GoogleCalendarService(credential);
}

/**
 * Factory function that creates a Google Calendar service instance with the extended GoogleCalendar type.
 * This is used by internal Google Calendar modules (callback, tests, etc.) that need access to
 * Google-specific methods beyond the generic Calendar interface.
 */
export function createGoogleCalendarServiceWithGoogleType(
  credential: CredentialForCalendarServiceWithEmail
): GoogleCalendar {
  return new GoogleCalendarService(credential);
}
