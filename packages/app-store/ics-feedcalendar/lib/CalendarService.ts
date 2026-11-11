/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../../../types/ical.d.ts"/>

import process from "node:process";
import dayjs from "@calcom/dayjs";
import { symmetricDecrypt } from "@calcom/lib/crypto";
import type {
  Calendar,
  CalendarEvent,
  EventBusyDate,
  GetAvailabilityParams,
  IntegrationCalendar,
  NewCalendarEventType,
} from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import ICAL from "ical.js";

// for Apple's Travel Time feature only (for now)
const getTravelDurationInSeconds = (vevent: ICAL.Component) => {
  const travelDuration: ICAL.Duration = vevent.getFirstPropertyValue("x-apple-travel-duration");
  if (!travelDuration) return 0;

  // we can't rely on this being a valid duration and it's painful to check, so just try and catch if anything throws
  try {
    const travelSeconds = travelDuration.toSeconds();
    // integer validation as we can never be sure with ical.js
    if (!Number.isInteger(travelSeconds)) return 0;
    return travelSeconds;
  } catch {
    return 0;
  }
};

const applyTravelDuration = (event: ICAL.Event, seconds: number) => {
  if (seconds <= 0) return event;
  // move event start date back by the specified travel time
  event.startDate.second -= seconds;
  return event;
};

const CALENDSO_ENCRYPTION_KEY = process.env.CALENDSO_ENCRYPTION_KEY || "";

class ICSFeedCalendarService implements Calendar {
  private urls: string[] = [];
  protected integrationName = "ics-feed_calendar";

  constructor(credential: CredentialPayload) {
    const { urls } = JSON.parse(symmetricDecrypt(credential.key as string, CALENDSO_ENCRYPTION_KEY));
    this.urls = urls;
  }

  createEvent(_event: CalendarEvent, _credentialId: number): Promise<NewCalendarEventType> {
    console.warn("createEvent called on ICS (read-only) feed");
    return Promise.resolve({
      uid: _event.uid || "",
      type: this.integrationName,
      id: "",
      password: "",
      url: "",
      additionalInfo: { calWarnings: ["ICS feed is read-only"] },
    });
  }

  deleteEvent(_uid: string, _event: CalendarEvent, _externalCalendarId?: string): Promise<unknown> {
    console.warn("deleteEvent called on ICS (read-only) feed");
    return Promise.resolve();
  }

  updateEvent(
    _uid: string,
    _event: CalendarEvent,
    _externalCalendarId?: string
  ): Promise<NewCalendarEventType | NewCalendarEventType[]> {
    console.warn("updateEvent called on ICS (read-only) feed");
    return Promise.resolve({
      uid: _event.uid || "",
      type: this.integrationName,
      id: "",
      password: "",
      url: "",
      additionalInfo: { calWarnings: ["ICS feed is read-only"] },
    });
  }

  fetchCalendars = async (): Promise<{ url: string; vcalendar: ICAL.Component }[]> => {
    const reqPromises = await Promise.allSettled(this.urls.map((x) => fetch(x).then((y) => [x, y])));
    const reqs = reqPromises
      .filter((x) => x.status === "fulfilled")
      .map((x) => (x as PromiseFulfilledResult<[string, Response]>).value);
    const res = await Promise.all(reqs.map((x) => x[1].text().then((y) => [x[0], y])));
    return res
      .map((x) => {
        try {
          const jcalData = ICAL.parse(x[1]);
          return {
            url: x[0],
            vcalendar: new ICAL.Component(jcalData),
          };
        } catch (e) {
          console.error("Error parsing calendar object: ", e);
          return null;
        }
      })
      .filter((x) => x !== null) as { url: string; vcalendar: ICAL.Component }[];
  };

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

  async getAvailability(params: GetAvailabilityParams): Promise<EventBusyDate[]> {
    const { dateFrom, dateTo, selectedCalendars } = params;
    const startISOString = new Date(dateFrom).toISOString();

    const calendars = await this.fetchCalendars();

    const userId = this.getUserId(selectedCalendars);
    // we use the userId from selectedCalendars to fetch the user's timeZone from the database primarily for all-day events without any timezone information
    const userTimeZone = userId ? await this.getUserTimezoneFromDB(userId) : "Europe/London";
    const events: { start: string; end: string; title: string }[] = [];

    calendars.forEach(({ vcalendar }) => {
      const vevents = vcalendar.getAllSubcomponents("vevent");
      const recurringMasterUids = new Set(
        vevents
          .filter((v) => !v.hasProperty("recurrence-id") && (v.hasProperty("rrule") || v.hasProperty("rdate")))
          .map((v) => String(v.getFirstPropertyValue("uid")))
      );

      vevents.forEach((vevent) => {
        // if event status is free or transparent, DON'T return (unlike usual getAvailability)
        //
        // commented out because a lot of public ICS feeds that describe stuff like
        // public holidays have them marked as transparent. if that is explicitly
        // added to cal.com as an ICS feed, it should probably not be ignored.
        // if (vevent?.getFirstPropertyValue("transp") === "TRANSPARENT") return;

        // Skip standalone recurrence exceptions because they are handled by the master recurring event
        if (vevent.hasProperty("recurrence-id") && recurringMasterUids.has(String(vevent.getFirstPropertyValue("uid")))) {
          return;
        }

        const event = new ICAL.Event(vevent);
        const title = String(vevent.getFirstPropertyValue("summary"));
        const dtstartProperty = vevent.getFirstProperty("dtstart");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tzidFromDtstart = dtstartProperty ? (dtstartProperty as any).jCal[1].tzid : undefined;

        const dtstart: { [key: string]: string } | undefined = vevent?.getFirstPropertyValue("dtstart");
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
              console.log("error in adding vtimezone", e);
            }
          } else {
            console.error("No timezone found");
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
        applyTravelDuration(event, getTravelDurationInSeconds(vevent));

        if (event.isRecurring()) {
          if (["HOURLY", "SECONDLY", "MINUTELY"].includes(event.getRecurrenceTypes())) {
            console.error(`Won't handle [${event.getRecurrenceTypes()}] recurrence`);
            return;
          }

          const start = dayjs(dateFrom);
          const end = dayjs(dateTo);

          // For single daily or weekly recurrence rules without COUNT, seed the iterator a whole number
          // of periods after DTSTART, ending at least one period before the query window. This preserves
          // the weekday and interval phase without walking years of historical occurrences.
          let iterator: ICAL.RecurExpansion;
          const rrules = event.component.getAllProperties("rrule");
          const isSingleRule = rrules.length === 1;
          const recur = isSingleRule
            ? (rrules[0].getFirstValue() as ICAL.Recur & { interval?: number })
            : null;

          if (recur && !recur.count && (recur.freq === "DAILY" || recur.freq === "WEEKLY")) {
            const interval = recur.interval || 1;
            const periodDays = recur.freq === "DAILY" ? interval : 7 * interval;
            const diffDays = start.diff(dayjs(event.startDate.toJSDate()), "day");
            const periodsBefore = Math.floor(diffDays / periodDays);

            if (periodsBefore > 1) {
              const jumpDays = (periodsBefore - 1) * periodDays;
              const seedTime = event.startDate.clone();
              seedTime.adjust(jumpDays, 0, 0, 0);
              iterator = event.iterator(seedTime);
            } else {
              iterator = event.iterator();
            }
          } else {
            iterator = event.iterator();
          }

          // Handle recurrence exceptions separately so exceptions moved into the query window are
          // captured, and exceptions moved outside the window do not prematurely terminate recurrence expansion.
          const handledExceptionIds = new Set<string>();
          const exceptions = (event as unknown as { exceptions?: Record<string, ICAL.Event> }).exceptions;

          if (exceptions) {
            for (const exceptionKey of Object.keys(exceptions)) {
              const ex = exceptions[exceptionKey];
              if (!ex || ex.uid !== event.uid) continue;
              handledExceptionIds.add(exceptionKey);
              if (ex.recurrenceId) {
                handledExceptionIds.add(ex.recurrenceId.toString());
                try {
                  const utcZone = (ICAL.Timezone as unknown as { utcTimezone: ICAL.Timezone }).utcTimezone;
                  if (utcZone) {
                    handledExceptionIds.add(ex.recurrenceId.convertToZone(utcZone).toString());
                  }
                } catch {
                  // ignore zone conversion error for lookup key
                }
              }

              const status = ex.component?.getFirstPropertyValue("status");
              if (typeof status === "string" && status.toUpperCase() === "CANCELLED") {
                continue;
              }

              let exStart = ex.startDate;
              let exEnd = ex.endDate;
              if (vtimezone) {
                const zone = new ICAL.Timezone(vtimezone);
                exStart = exStart.convertToZone(zone);
                exEnd = exEnd.convertToZone(zone);
              }

              const exStartDayjs = dayjs(exStart.toJSDate());
              if (exStartDayjs.isBetween(start, end) === true) {
                const exTitle = String(ex.component?.getFirstPropertyValue("summary") || title);
                events.push({
                  start: exStartDayjs.toISOString(),
                  end: dayjs(exEnd.toJSDate()).toISOString(),
                  title: exTitle,
                });
              }
            }
          }

          let maxIterations = 5000;
          let current: ICAL.Time | null = null;
          let currentEvent;
          let currentStart = null;
          let currentError;

          while (maxIterations > 0) {
            maxIterations -= 1;

            try {
              current = iterator.next();
            } catch (error) {
              console.warn("Error advancing recurring event iterator:", error);
              break;
            }

            if (!current) break;

            // Recurrence progression check: if the scheduled recurrence time is after the query window,
            // subsequent occurrences in the series cannot fall within the window.
            let recurrenceZoneTime = current;
            if (vtimezone) {
              const zone = new ICAL.Timezone(vtimezone);
              recurrenceZoneTime = current.convertToZone(zone);
            }
            if (dayjs(recurrenceZoneTime.toJSDate()).isAfter(end)) {
              break;
            }

            // If this recurrence ID was handled as an exception, skip the base recurrence occurrence
            const currentKey = current.toString();
            let currentUtcKey: string | null = null;
            try {
              const utcZone = (ICAL.Timezone as unknown as { utcTimezone: ICAL.Timezone }).utcTimezone;
              if (utcZone) {
                currentUtcKey = current.convertToZone(utcZone).toString();
              }
            } catch {
              // ignore zone conversion error
            }
            if (
              handledExceptionIds.has(currentKey) ||
              (currentUtcKey && handledExceptionIds.has(currentUtcKey))
            ) {
              continue;
            }

            try {
              // @see https://github.com/mozilla-comm/ical.js/issues/514
              currentEvent = event.getOccurrenceDetails(current);
            } catch (error) {
              if (error instanceof Error && error.message !== currentError) {
                currentError = error.message;
              }
            }
            if (!currentEvent) break;

            const occStatus = currentEvent.item?.component?.getFirstPropertyValue("status");
            if (typeof occStatus === "string" && occStatus.toUpperCase() === "CANCELLED") {
              continue;
            }

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
                title,
              });
            }
          }
          if (maxIterations <= 0) {
            console.warn("could not find all occurrences for recurring event within 5000 iterations");
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
          title,
        });
      });
    });

    return Promise.resolve(events);
  }

  async listCalendars(): Promise<IntegrationCalendar[]> {
    const vcals = await this.fetchCalendars();

    return vcals.map(({ url, vcalendar }) => {
      const name: string = vcalendar.getFirstPropertyValue("x-wr-calname");
      return {
        name,
        readOnly: true,
        externalId: url,
        integration: this.integrationName,
      };
    });
  }
}

/**
 * Factory function that creates an ICS Feed Calendar service instance.
 * This is exported instead of the class to prevent internal types
 * from leaking into the emitted .d.ts file.
 */
export default function BuildCalendarService(credential: CredentialPayload): Calendar {
  return new ICSFeedCalendarService(credential);
}
