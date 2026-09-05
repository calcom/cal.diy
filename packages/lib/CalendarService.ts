/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../types/ical.d.ts"/>

import process from "node:process";
import dayjs from "@calcom/dayjs";
import sanitizeCalendarObject from "@calcom/lib/sanitizeCalendarObject";
import type {
  Person as AttendeeInCalendarEvent,
  Calendar,
  CalendarEvent,
  CalendarEventType,
  CalendarServiceEvent,
  EventBusyDate,
  GetAvailabilityParams,
  IntegrationCalendar,
  NewCalendarEventType,
  TeamMember,
} from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import ICAL from "ical.js";
import type { Attendee, DateArray, DurationObject } from "ics";
import { createEvent } from "ics";
import type { DAVAccount, DAVCalendar, DAVObject } from "tsdav";
import {
  createAccount,
  createCalendarObject,
  deleteCalendarObject,
  fetchCalendarObjects,
  fetchCalendars,
  getBasicAuthHeaders,
  updateCalendarObject,
} from "tsdav";
import { v4 as uuidv4 } from "uuid";
import { getLocation, getRichDescription } from "./CalEventParser";
import { symmetricDecrypt } from "./crypto";
import logger from "./logger";

const TIMEZONE_FORMAT = "YYYY-MM-DDTHH:mm:ss[Z]";
const DEFAULT_CALENDAR_TYPE = "caldav";

const CALENDSO_ENCRYPTION_KEY = process.env.CALENDSO_ENCRYPTION_KEY || "";

// Some feeds expose unbounded RRULEs; cap expansion to prevent pathological loops
// while still allowing multi-year daily recurrences to reach the requested window.
const MAX_RECURRENCE_ITERATIONS = 50_000;

type FetchObjectsWithOptionalExpandOptionsType = {
  selectedCalendars: IntegrationCalendar[];
  startISOString: string;
  dateTo: string;
  headers?: Record<string, string>;
};

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

// for Apple's Travel Time feature only (for now)
const getTravelDurationInSeconds = (vevent: ICAL.Component, log: typeof logger) => {
  const travelDuration: ICAL.Duration = vevent.getFirstPropertyValue("x-apple-travel-duration");
  if (!travelDuration) return 0;

  // we can't rely on this being a valid duration and it's painful to check, so just try and catch if anything throws
  try {
    const travelSeconds = travelDuration.toSeconds();
    // integer validation as we can never be sure with ical.js
    if (!Number.isInteger(travelSeconds)) return 0;
    return travelSeconds;
  } catch (e) {
    log.error("invalid travelDuration?", e);
    return 0;
  }
};

const applyTravelDuration = (event: ICAL.Event, seconds: number) => {
  if (seconds <= 0) return event;
  // move event start date back by the specified travel time
  event.startDate.second -= seconds;
  return event;
};

const convertDate = (date: string): DateArray =>
  dayjs(date)
    .utc()
    .toArray()
    .slice(0, 6)
    .map((v, i) => (i === 1 ? v + 1 : v)) as DateArray;

const getDuration = (start: string, end: string): DurationObject => ({
  minutes: dayjs(end).diff(dayjs(start), "minute"),
});

/** Folds lines per RFC 5545 (max 75 octets, UTF-8 aware) */
const foldLine = (line: string): string => {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const result: string[] = [];
  let segment = "";
  let byteCount = 0;

  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    const limit = result.length === 0 ? 75 : 74;

    if (byteCount + charBytes > limit) {
      result.push(segment);
      segment = char;
      byteCount = charBytes;
    } else {
      segment += char;
      byteCount += charBytes;
    }
  }
  if (segment) result.push(segment);
  return result.join("\r\n ");
};

/** Finds the value separator colon, skipping colons inside quoted strings */
const findValueColon = (str: string): number => {
  let inQuotes = false;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '"') inQuotes = !inQuotes;
    if (str[i] === ":" && !inQuotes) return i;
  }
  return -1;
};

/** Checks if SCHEDULE-AGENT parameter exists in the params portion */
const hasScheduleAgent = (params: string): boolean =>
  /;SCHEDULE-AGENT=/i.test(params) || /^SCHEDULE-AGENT=/i.test(params);

/**
 * Injects SCHEDULE-AGENT=CLIENT into ORGANIZER and ATTENDEE properties.
 * Prevents CalDAV servers from sending duplicate invitation emails (RFC 6638).
 */
const injectScheduleAgent = (iCalString: string): string => {
  // Remove METHOD:PUBLISH per RFC 4791 Section 4.1
  let result = iCalString.replace(/METHOD:[^\r\n]+[\r\n]+/g, "");

  // Process ORGANIZER and ATTENDEE lines (handles folded lines)
  result = result.replace(
    /^(ORGANIZER|ATTENDEE)((?:[^\r\n]|\r?\n[ \t])*)(\r?\n(?![ \t]))/gim,
    (match, property, rest, lineEnding) => {
      const unfolded = rest.replace(/\r?\n[ \t]/g, "");

      // Try to find colon via :mailto:/:http: pattern first
      const valueMatch = unfolded.match(/:(mailto:|http:|https:|urn:)/i);
      const colonIndex = valueMatch?.index ?? findValueColon(unfolded);

      if (colonIndex === -1) return match;

      const params = unfolded.slice(0, colonIndex);
      const value = unfolded.slice(colonIndex);

      if (hasScheduleAgent(params)) {
        return foldLine(property + unfolded) + lineEnding;
      }

      return foldLine(property + params + ";SCHEDULE-AGENT=CLIENT" + value) + lineEnding;
    }
  );

  return result;
};

/**
 * Finds the DST transition moment for a given year by binary-searching
 * when the UTC offset changes between two months.
 */
const findDSTTransition = (
  timezone: string,
  year: number,
  fromMonth: number,
  toMonth: number
): ReturnType<typeof dayjs> | null => {
  let low = dayjs.utc(new Date(year, fromMonth, 1)).valueOf();
  let high = dayjs.utc(new Date(year, toMonth, 1)).valueOf();
  const lowOffset = dayjs(low).tz(timezone).utcOffset();
  const highOffset = dayjs(high).tz(timezone).utcOffset();

  if (lowOffset === highOffset) return null;

  while (high - low > 60 * 1000) {
    const mid = Math.floor((low + high) / 2);
    const midOffset = dayjs(mid).tz(timezone).utcOffset();
    if (midOffset === lowOffset) {
      low = mid;
    } else {
      high = mid;
    }
  }

  // RFC 5545 requires DTSTART to be the local time interpreted with the
  // pre-transition offset (TZOFFSETFROM). Apply the pre-transition offset
  // to the UTC transition moment to get this local time.
  const preTransitionOffsetMs = lowOffset * 60 * 1000;
  return dayjs.utc(high + preTransitionOffsetMs);
};

/** Formats a transition moment as iCal DTSTART (e.g., 20260308T020000). */
const formatTransitionDtstart = (transition: ReturnType<typeof dayjs>): string => {
  const year = String(transition.year());
  const month = String(transition.month() + 1).padStart(2, "0");
  const day = String(transition.date()).padStart(2, "0");
  const hour = String(transition.hour()).padStart(2, "0");
  const minute = String(transition.minute()).padStart(2, "0");
  return `${year}${month}${day}T${hour}${minute}00`;
};

/** Generates BYDAY RRULE value (e.g., "2SU") for nth weekday occurrence in month. */
const getBydayRule = (d: ReturnType<typeof dayjs>): string => {
  const dayNames = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const dayOfWeek = dayNames[d.day()];
  const dayOfMonth = d.date();
  const weekNum = Math.ceil(dayOfMonth / 7);
  const daysInMonth = d.daysInMonth();
  if (dayOfMonth > daysInMonth - 7) {
    return `-1${dayOfWeek}`;
  }
  return `${weekNum}${dayOfWeek}`;
};

/**
 * Builds a VTIMEZONE component for the given IANA timezone.
 * Uses the event's year to compute actual DST transitions (not 1970),
 * ensuring correct BYDAY/BYMONTH for zones that changed rules post-1970.
 * RFC 5545 §3.6.5 requires VTIMEZONE when DTSTART uses TZID.
 */
const buildVTimezone = (timezone: string, eventStart: string): string => {
  const eventYear = dayjs(eventStart).tz(timezone).year();
  // Construct dates from scratch in the target timezone to get correct offsets.
  // Using .month() on an existing dayjs object may not recalculate the tz offset.
  const winterMoment = dayjs.tz(`${eventYear}-01-15T12:00:00`, timezone);
  const summerMoment = dayjs.tz(`${eventYear}-07-15T12:00:00`, timezone);

  const formatOffset = (d: ReturnType<typeof dayjs>): string => {
    const offsetMinutes = d.utcOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMinutes);
    const hours = String(Math.floor(abs / 60)).padStart(2, "0");
    const mins = String(abs % 60).padStart(2, "0");
    return `${sign}${hours}${mins}`;
  };

  const standardOffset = formatOffset(winterMoment);
  const daylightOffset = formatOffset(summerMoment);
  const hasDST = standardOffset !== daylightOffset;

  const lines: string[] = ["BEGIN:VTIMEZONE", `TZID:${timezone}`];

  if (hasDST) {
    const springTransition = findDSTTransition(timezone, eventYear, 0, 6);
    const fallTransition = findDSTTransition(timezone, eventYear, 6, 11);

    const winterUtcOffset = winterMoment.utcOffset();
    const summerUtcOffset = summerMoment.utcOffset();
    const trueStandardOffset = winterUtcOffset < summerUtcOffset ? standardOffset : daylightOffset;
    const trueDaylightOffset = winterUtcOffset < summerUtcOffset ? daylightOffset : standardOffset;
    const springIsDaylight = summerUtcOffset > winterUtcOffset;

    if (springTransition) {
      const dtstart = formatTransitionDtstart(springTransition);
      const byday = getBydayRule(springTransition);
      const bymonth = springTransition.month() + 1;

      if (springIsDaylight) {
        lines.push(
          "BEGIN:DAYLIGHT",
          `TZOFFSETFROM:${trueStandardOffset}`,
          `TZOFFSETTO:${trueDaylightOffset}`,
          "TZNAME:DST",
          `DTSTART:${dtstart}`,
          `RRULE:FREQ=YEARLY;BYMONTH=${bymonth};BYDAY=${byday}`,
          "END:DAYLIGHT"
        );
      } else {
        lines.push(
          "BEGIN:STANDARD",
          `TZOFFSETFROM:${trueDaylightOffset}`,
          `TZOFFSETTO:${trueStandardOffset}`,
          "TZNAME:ST",
          `DTSTART:${dtstart}`,
          `RRULE:FREQ=YEARLY;BYMONTH=${bymonth};BYDAY=${byday}`,
          "END:STANDARD"
        );
      }
    } else {
      lines.push(
        "BEGIN:DAYLIGHT",
        `TZOFFSETFROM:${trueStandardOffset}`,
        `TZOFFSETTO:${trueDaylightOffset}`,
        "TZNAME:DST",
        "DTSTART:19700101T000000",
        "END:DAYLIGHT"
      );
    }

    if (fallTransition) {
      const dtstart = formatTransitionDtstart(fallTransition);
      const byday = getBydayRule(fallTransition);
      const bymonth = fallTransition.month() + 1;

      if (springIsDaylight) {
        lines.push(
          "BEGIN:STANDARD",
          `TZOFFSETFROM:${trueDaylightOffset}`,
          `TZOFFSETTO:${trueStandardOffset}`,
          "TZNAME:ST",
          `DTSTART:${dtstart}`,
          `RRULE:FREQ=YEARLY;BYMONTH=${bymonth};BYDAY=${byday}`,
          "END:STANDARD"
        );
      } else {
        lines.push(
          "BEGIN:DAYLIGHT",
          `TZOFFSETFROM:${trueStandardOffset}`,
          `TZOFFSETTO:${trueDaylightOffset}`,
          "TZNAME:DST",
          `DTSTART:${dtstart}`,
          `RRULE:FREQ=YEARLY;BYMONTH=${bymonth};BYDAY=${byday}`,
          "END:DAYLIGHT"
        );
      }
    } else {
      lines.push(
        "BEGIN:STANDARD",
        `TZOFFSETFROM:${trueDaylightOffset}`,
        `TZOFFSETTO:${trueStandardOffset}`,
        "TZNAME:ST",
        "DTSTART:19700101T000000",
        "END:STANDARD"
      );
    }
  } else {
    lines.push(
      "BEGIN:STANDARD",
      `TZOFFSETFROM:${standardOffset}`,
      `TZOFFSETTO:${standardOffset}`,
      `TZNAME:${timezone}`,
      "DTSTART:19700101T000000",
      "END:STANDARD"
    );
  }

  lines.push("END:VTIMEZONE");
  return lines.join("\r\n");
};

/**
 * Injects a VTIMEZONE block and rewrites DTSTART/DTEND from UTC to timezone-local.
 */
const injectVTimezone = (
  iCalString: string,
  timezone: string,
  startTime: string,
  endTime: string
): string => {
  const formatLocalDateTime = (isoString: string, tz: string): string => {
    const local = dayjs(isoString).tz(tz);
    return local.format("YYYYMMDDTHHmmss");
  };

  const localStart = formatLocalDateTime(startTime, timezone);
  const localEnd = formatLocalDateTime(endTime, timezone);

  let result = iCalString
    .replace(/^DTSTART:[^\r\n]+/m, `DTSTART;TZID=${timezone}:${localStart}`)
    .replace(/^DTEND:[^\r\n]+/m, `DTEND;TZID=${timezone}:${localEnd}`);

  const vtimezone = buildVTimezone(timezone, startTime);
  result = result.replace(/^BEGIN:VEVENT/m, `${vtimezone}\r\nBEGIN:VEVENT`);

  return result;
};

const mapAttendees = (attendees: AttendeeInCalendarEvent[] | TeamMember[]): Attendee[] =>
  attendees.map(({ email, name }) => ({ name, email, partstat: "NEEDS-ACTION" }));

export default abstract class BaseCalendarService implements Calendar {
  private url = "";
  private credentials: Record<string, string> = {};
  private headers: Record<string, string> = {};
  protected integrationName = "";
  private log: typeof logger;
  private credential: CredentialPayload;

  constructor(credential: CredentialPayload, integrationName: string, url?: string) {
    this.integrationName = integrationName;

    const {
      username,
      password,
      url: credentialURL,
    } = JSON.parse(symmetricDecrypt(credential.key as string, CALENDSO_ENCRYPTION_KEY));

    this.url = url || credentialURL;

    this.credentials = { username, password };
    this.headers = getBasicAuthHeaders({ username, password });
    this.credential = credential;

    this.log = logger.getSubLogger({ prefix: [`[[lib] ${this.integrationName}`] });
  }

  private getAttendees(event: CalendarEvent) {
    const attendees = mapAttendees(event.attendees);

    if (event.team?.members) {
      const teamAttendeesWithoutCurrentUser = event.team.members.filter(
        (member) => member.email !== this.credential.user?.email
      );
      attendees.push(...mapAttendees(teamAttendeesWithoutCurrentUser));
    }

    return attendees;
  }

  async createEvent(event: CalendarServiceEvent, credentialId: number): Promise<NewCalendarEventType> {
    try {
      const calendars = await this.listCalendars(event);
      const uid = event.uid || uuidv4();

      // We create local ICS files
      const { error, value: iCalString } = createEvent({
        uid,
        startInputType: "utc",
        start: convertDate(event.startTime),
        duration: getDuration(event.startTime, event.endTime),
        title: event.title,
        description: event.calendarDescription,
        location: getLocation(event),
        organizer: { email: event.organizer.email, name: event.organizer.name },
        attendees: this.getAttendees(event),
        /** according to https://datatracker.ietf.org/doc/html/rfc2446#section-3.2.1, in a published iCalendar component.
         * "Attendees" MUST NOT be present
         * `attendees: this.getAttendees(event.attendees),`
         * [UPDATE]: Since we're not using the PUBLISH method to publish the iCalendar event and creating the event directly on iCal,
         * this shouldn't be an issue and we should be able to add attendees to the event right here.
         */
        ...(event.hideCalendarEventDetails ? { classification: "PRIVATE" } : {}),
      });

      if (error || !iCalString)
        throw new Error(`Error creating iCalString:=> ${error?.message} : ${error?.name} `);

      // Inject VTIMEZONE and rewrite DTSTART/DTEND to organizer's local timezone.
      // Without this, CalDAV servers send scheduling emails with UTC times.
      const timezone = event.organizer.timeZone;
      const iCalStringWithTimezone = injectVTimezone(iCalString, timezone, event.startTime, event.endTime);

      const mainHostDestinationCalendar = event.destinationCalendar
        ? (event.destinationCalendar.find((cal) => cal.credentialId === credentialId) ??
          event.destinationCalendar[0])
        : undefined;

      // We create the event directly on iCal
      const responses = await Promise.all(
        calendars
          .filter((c) =>
            mainHostDestinationCalendar?.externalId
              ? c.externalId === mainHostDestinationCalendar.externalId
              : true
          )
          .map((calendar) =>
            createCalendarObject({
              calendar: {
                url: calendar.externalId,
              },
              filename: `${uid}.ics`,
              iCalString: injectScheduleAgent(iCalStringWithTimezone),
              headers: this.headers,
            })
          )
      );

      if (responses.some((r) => !r.ok)) {
        throw new Error(
          `Error creating event: ${(await Promise.all(responses.map((r) => r.text()))).join(", ")}`
        );
      }

      return {
        uid,
        id: uid,
        type: this.integrationName,
        password: "",
        url: "",
        additionalInfo: {},
      };
    } catch (reason) {
      logger.error(reason);

      throw reason;
    }
  }

  async updateEvent(
    uid: string,
    event: CalendarEvent
  ): Promise<NewCalendarEventType | NewCalendarEventType[]> {
    try {
      const events = await this.getEventsByUID(uid);

      /** We generate the ICS files */
      const { error, value: iCalString } = createEvent({
        uid,
        startInputType: "utc",
        start: convertDate(event.startTime),
        duration: getDuration(event.startTime, event.endTime),
        title: event.title,
        description: getRichDescription(event),
        location: getLocation(event),
        organizer: { email: event.organizer.email, name: event.organizer.name },
        attendees: this.getAttendees(event),
      });

      if (error) {
        this.log.debug("Error creating iCalString");

        return {
          uid,
          type: event.type,
          id: typeof event.uid === "string" ? event.uid : "-1",
          password: "",
          url: typeof event.location === "string" ? event.location : "-1",
          additionalInfo: {},
        };
      }
      // Apply timezone fix to updated events as well
      const updateTimezone = event.organizer.timeZone;
      const iCalStringWithTimezone = iCalString
        ? injectVTimezone(iCalString, updateTimezone, event.startTime, event.endTime)
        : "";

      let calendarEvent: CalendarEventType;
      const eventsToUpdate = events.filter((e) => e.uid === uid);
      return Promise.all(
        eventsToUpdate.map((eventItem) => {
          calendarEvent = eventItem;
          return updateCalendarObject({
            calendarObject: {
              url: calendarEvent.url,
              data: injectScheduleAgent(iCalStringWithTimezone ?? ""),
              etag: calendarEvent?.etag,
            },
            headers: this.headers,
          });
        })
      ).then((responses) =>
        responses.map((response) => {
          if (response.status >= 200 && response.status < 300) {
            return {
              uid,
              type: this.credentials.type,
              id: typeof calendarEvent.uid === "string" ? calendarEvent.uid : "-1",
              password: "",
              url: calendarEvent.url,
              additionalInfo:
                typeof event.additionalInformation === "string" ? event.additionalInformation : {},
            };
          } else {
            this.log.error("Error: Status Code", response.status);
            return {
              uid,
              type: event.type,
              id: typeof event.uid === "string" ? event.uid : "-1",
              password: "",
              url: typeof event.location === "string" ? event.location : "-1",
              additionalInfo:
                typeof event.additionalInformation === "string" ? event.additionalInformation : {},
            };
          }
        })
      );
    } catch (reason) {
      this.log.error(reason);
      throw reason;
    }
  }

  async deleteEvent(uid: string): Promise<void> {
    try {
      const events = await this.getEventsByUID(uid);

      const eventsToDelete = events.filter((event) => event.uid === uid);
      await Promise.all(
        eventsToDelete.map((event) => {
          return deleteCalendarObject({
            calendarObject: {
              url: event.url,
              etag: event?.etag,
            },
            headers: this.headers,
          });
        })
      );
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
    const prisma = await import("@calcom/prisma").then((mod) => mod.default);
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
      logger.error(`Unsupported calendar object format: ${urlExtension}`);
      return false;
    }
    return true;
  };

  async getAvailability(params: GetAvailabilityParams): Promise<EventBusyDate[]> {
    const { dateFrom, dateTo, selectedCalendars } = params;
    const startISOString = new Date(dateFrom).toISOString();

    const objects = await this.fetchObjectsWithOptionalExpand({
      selectedCalendars,
      startISOString,
      dateTo,
      headers: this.headers,
    });

    const userId = this.getUserId(selectedCalendars);
    // we use the userId from selectedCalendars to fetch the user's timeZone from the database primarily for all-day events without any timezone information
    const userTimeZone = userId ? await this.getUserTimezoneFromDB(userId) : "Europe/London";
    const events: { start: string; end: string }[] = [];
    objects.forEach((object) => {
      if (!object || object.data == null || JSON.stringify(object.data) == "{}") return;
      let vcalendar: ICAL.Component;
      try {
        const jcalData = ICAL.parse(sanitizeCalendarObject(object));
        vcalendar = new ICAL.Component(jcalData);
      } catch (e) {
        logger.error("Error parsing calendar object: ", e);
        return;
      }
      const vevents = vcalendar.getAllSubcomponents("vevent");
      vevents.forEach((vevent) => {
        // if event status is free or transparent, return
        if (vevent?.getFirstPropertyValue("transp") === "TRANSPARENT") return;

        const event = new ICAL.Event(vevent);
        const dtstartProperty = vevent.getFirstProperty("dtstart");
        const tzidFromDtstart = dtstartProperty ? (dtstartProperty as any).jCal[1].tzid : undefined;
        const dtstart: { [key: string]: string } | undefined = vevent?.getFirstPropertyValue("dtstart");
        // biome-ignore lint/complexity/useLiteralKeys: accessing dynamic property from ICAL.js object
        const timezone = dtstart ? dtstart["timezone"] : undefined;
        // We check if the dtstart timezone is in UTC which is actually represented by Z instead, but not recognized as that in ICAL.js as UTC
        const isUTC = timezone === "Z";

        // Fix precedence: prioritize TZID from DTSTART property, then standalone TZID, then UTC, then fallback
        const tzid: string | undefined =
          tzidFromDtstart || vevent?.getFirstPropertyValue("tzid") || (isUTC ? "UTC" : timezone);
        // In case of icalendar, when only tzid is available without vtimezone, we need to add vtimezone explicitly to take care of timezone diff
        if (!vcalendar.getFirstSubcomponent("vtimezone")) {
          const timezoneToUse = tzid || userTimeZone;
          if (timezoneToUse) {
            try {
              const timezoneComp = new ICAL.Component("vtimezone");
              timezoneComp.addPropertyWithValue("tzid", timezoneToUse);
              const standard = new ICAL.Component("standard");

              // get timezone offset
              const tzoffsetfrom = dayjs(event.startDate.toJSDate()).tz(timezoneToUse).format("Z");
              const tzoffsetto = dayjs(event.endDate.toJSDate()).tz(timezoneToUse).format("Z");

              // set timezone offset
              standard.addPropertyWithValue("tzoffsetfrom", tzoffsetfrom);
              standard.addPropertyWithValue("tzoffsetto", tzoffsetto);
              // provide a standard dtstart
              standard.addPropertyWithValue("dtstart", "1601-01-01T00:00:00");
              timezoneComp.addSubcomponent(standard);
              vcalendar.addSubcomponent(timezoneComp);
            } catch (e) {
              // Adds try-catch to ensure the code proceeds when Apple Calendar provides non-standard TZIDs
              logger.warn("error in adding vtimezone", e);
            }
          } else {
            logger.warn("No timezone found");
          }
        }

        let vtimezone = null;
        if (tzid) {
          const allVtimezones = vcalendar.getAllSubcomponents("vtimezone");
          vtimezone = allVtimezones.find((vtz) => vtz.getFirstPropertyValue("tzid") === tzid);
        }

        if (!vtimezone) {
          vtimezone = vcalendar.getFirstSubcomponent("vtimezone");
        }

        // mutate event to consider travel time
        applyTravelDuration(event, getTravelDurationInSeconds(vevent, this.log));

        if (event.isRecurring()) {
          const recurrenceType = event.getRecurrenceTypes();
          if (["HOURLY", "SECONDLY", "MINUTELY"].includes(recurrenceType)) {
            logger.warn(`Won't handle [${recurrenceType}] recurrence`);
            return;
          }

          const start = dayjs(dateFrom);
          const end = dayjs(dateTo);
          const eventStart = dayjs(event.startDate.toJSDate());
          const daysUntilQueryEnd = Math.max(0, end.diff(eventStart, "day"));
          let maxIterations = Math.min(MAX_RECURRENCE_ITERATIONS, Math.max(365, daysUntilQueryEnd + 365));
          // Start iterator from actual event start to preserve weekday/monthday alignment
          const iterator = event.iterator(event.startDate);
          let current: ICAL.Time;
          let currentEvent: ReturnType<typeof event.getOccurrenceDetails> | undefined;
          let currentStart: ReturnType<typeof dayjs> | null = null;
          let currentError: string | undefined;

          while (
            maxIterations > 0 &&
            (currentStart === null || currentStart.isAfter(end) === false) &&
            // this iterator was poorly implemented, normally done is expected to be
            // returned
            (current = iterator.next())
          ) {
            maxIterations -= 1;

            try {
              // @see https://github.com/mozilla-comm/ical.js/issues/514
              currentEvent = event.getOccurrenceDetails(current);
            } catch (error) {
              if (error instanceof Error && error.message !== currentError) {
                currentError = error.message;
                this.log.error("error", error);
              }
            }
            if (!currentEvent) return;
            // do not mix up caldav and icalendar! For the recurring events here, the timezone
            // provided is relevant, not as pointed out in https://datatracker.ietf.org/doc/html/rfc4791#section-9.6.5
            // where recurring events are always in utc (in caldav!). Thus, apply the time zone here.
            if (vtimezone) {
              const zone = new ICAL.Timezone(vtimezone);
              currentEvent.startDate = currentEvent.startDate.convertToZone(zone);
              currentEvent.endDate = currentEvent.endDate.convertToZone(zone);
            }
            currentStart = dayjs(currentEvent.startDate.toJSDate());

            if (currentStart.isBetween(start, end) === true) {
              events.push({
                start: currentStart.toISOString(),
                end: dayjs(currentEvent.endDate.toJSDate()).toISOString(),
              });
            }
          }
          if (maxIterations <= 0) {
            logger.warn("Could not find any occurrence for recurring event in 365 iterations");
          }
          return;
        }

        if (vtimezone) {
          const zone = new ICAL.Timezone(vtimezone);
          event.startDate = event.startDate.convertToZone(zone);
          event.endDate = event.endDate.convertToZone(zone);
        }

        const finalStartISO = dayjs(event.startDate.toJSDate()).toISOString();
        const finalEndISO = dayjs(event.endDate.toJSDate()).toISOString();
        return events.push({
          start: finalStartISO,
          end: finalEndISO,
        });
      });
    });

    return Promise.resolve(events);
  }

  async listCalendars(event?: CalendarEvent): Promise<IntegrationCalendar[]> {
    try {
      const account = await this.getAccount();

      const calendars = (await fetchCalendars({
        account,
        headers: this.headers,
      })) /** @url https://github.com/natelindev/tsdav/pull/139 */ as (Omit<DAVCalendar, "displayName"> & {
        displayName?: string | Record<string, unknown>;
      })[];

      return calendars.reduce<IntegrationCalendar[]>((newCalendars, calendar) => {
        if (!calendar.components?.includes("VEVENT")) return newCalendars;
        const [mainHostDestinationCalendar] = event?.destinationCalendar ?? [];
        newCalendars.push({
          externalId: calendar.url,
          /** @url https://github.com/calcom/cal.diy/issues/7186 */
          name: typeof calendar.displayName === "string" ? calendar.displayName : "",
          primary: mainHostDestinationCalendar?.externalId
            ? mainHostDestinationCalendar.externalId === calendar.url
            : false,
          integration: this.integrationName,
          email: this.credentials.username ?? "",
        });
        return newCalendars;
      }, []);
    } catch (reason) {
      logger.error(reason);

      throw reason;
    }
  }

  /**
   * The fetchObjectsWithOptionalExpand function is responsible for fetching calendar objects
   * from an array of selectedCalendars. It attempts to fetch objects with the expand option
   * alone such that it works if a calendar supports it. If any calendar object has an undefined 'data' property
   * and etag isn't undefined, the function makes a new request without the expand option to retrieve the data.
   * The result is a flattened array of calendar objects with the structure { url: ..., etag: ..., data: ...}.
   *
   * @param {Object} options - The options object containing the following properties:
   *   @param {IntegrationCalendar[]} options.selectedCalendars - An array of IntegrationCalendar objects to fetch data from.
   *   @param {string} options.startISOString - The start date of the date range to fetch events from, in ISO 8601 format.
   *   @param {string} options.dateTo - The end date of the date range to fetch events from.
   *   @param {Object} options.headers - Headers to be included in the API requests.
   * @returns {Promise<Array>} - A promise that resolves to a flattened array of calendar objects with the structure { url: ..., etag: ..., data: ...}.
   */

  async fetchObjectsWithOptionalExpand({
    selectedCalendars,
    startISOString,
    dateTo,
    headers,
  }: FetchObjectsWithOptionalExpandOptionsType): Promise<DAVObject[]> {
    const filteredCalendars = selectedCalendars.filter((sc) => sc.externalId);
    const fetchPromises = filteredCalendars.map(async (sc) => {
      const response = await fetchCalendarObjects({
        urlFilter: (url) => this.isValidFormat(url),
        calendar: {
          url: sc.externalId,
        },
        headers,
        expand: true,
        timeRange: {
          start: startISOString,
          end: new Date(dateTo).toISOString(),
        },
      });

      const processedResponse = await Promise.all(
        response.map(async (calendarObject) => {
          const calendarObjectHasEtag = calendarObject.etag !== undefined;
          const calendarObjectDataUndefined = calendarObject.data === undefined;
          if (calendarObjectDataUndefined && calendarObjectHasEtag) {
            const responseWithoutExpand = await fetchCalendarObjects({
              urlFilter: (url) => this.isValidFormat(url),
              calendar: {
                url: sc.externalId,
              },
              headers,
              expand: false,
              timeRange: {
                start: startISOString,
                end: new Date(dateTo).toISOString(),
              },
            });

            return responseWithoutExpand.find(
              (obj) => obj.url === calendarObject.url && obj.etag === calendarObject.etag
            );
          }
          return calendarObject;
        })
      );
      return processedResponse;
    });
    const resolvedPromises = await Promise.allSettled(fetchPromises);
    const fulfilledPromises = resolvedPromises.filter(
      (promise): promise is PromiseFulfilledResult<(DAVObject | undefined)[]> =>
        promise.status === "fulfilled"
    );
    const flatResult = fulfilledPromises.flatMap((promise) => promise.value).filter((obj) => obj !== null);
    return flatResult as DAVObject[];
  }

  private async getEvents(
    calId: string,
    dateFrom: string | null,
    dateTo: string | null,
    objectUrls?: string[] | null
  ) {
    try {
      const objects = await fetchCalendarObjects({
        calendar: {
          url: calId,
        },
        objectUrls: objectUrls ? objectUrls : undefined,
        timeRange:
          dateFrom && dateTo
            ? {
                start: dayjs(dateFrom).utc().format(TIMEZONE_FORMAT),
                end: dayjs(dateTo).utc().format(TIMEZONE_FORMAT),
              }
            : undefined,
        headers: this.headers,
      });

      const events = objects
        .filter((e) => !!e.data)
        .map((object) => {
          const jcalData = ICAL.parse(sanitizeCalendarObject(object));

          const vcalendar = new ICAL.Component(jcalData);

          const vevent = vcalendar.getFirstSubcomponent("vevent");
          const event = new ICAL.Event(vevent);

          const calendarTimezone =
            vcalendar.getFirstSubcomponent("vtimezone")?.getFirstPropertyValue<string>("tzid") || "";

          const startDate = calendarTimezone
            ? dayjs.tz(event.startDate.toString(), calendarTimezone)
            : new Date(event.startDate.toUnixTime() * 1000);

          const endDate = calendarTimezone
            ? dayjs.tz(event.endDate.toString(), calendarTimezone)
            : new Date(event.endDate.toUnixTime() * 1000);

          return {
            uid: event.uid,
            etag: object.etag,
            url: object.url,
            summary: event.summary,
            description: event.description,
            location: event.location,
            sequence: event.sequence,
            startDate,
            endDate,
            duration: {
              weeks: event.duration.weeks,
              days: event.duration.days,
              hours: event.duration.hours,
              minutes: event.duration.minutes,
              seconds: event.duration.seconds,
              isNegative: event.duration.isNegative,
            },
            organizer: event.organizer,
            attendees: event.attendees.map((a) => a.getValues()),
            recurrenceId: event.recurrenceId,
            timezone: calendarTimezone,
          };
        });
      return events;
    } catch (reason) {
      logger.error(reason);
      throw reason;
    }
  }

  private async getEventsByUID(uid: string): Promise<CalendarEventType[]> {
    type EventsType = Awaited<ReturnType<typeof this.getEvents>>;
    const events: EventsType = [];
    const calendars = await this.listCalendars();

    for (const cal of calendars) {
      const calEvents = await this.getEvents(cal.externalId, null, null, [`${cal.externalId}${uid}.ics`]);

      for (const ev of calEvents) {
        events.push(ev);
      }
    }

    return events;
  }

  private async getAccount(): Promise<DAVAccount> {
    return createAccount({
      account: {
        serverUrl: this.url,
        accountType: DEFAULT_CALENDAR_TYPE,
        credentials: this.credentials,
      },
      headers: this.headers,
    });
  }
}
