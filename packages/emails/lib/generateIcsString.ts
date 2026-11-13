import { getRichDescription, getVideoCallUrlFromCalEvent } from "@calcom/lib/CalEventParser";
import { ORGANIZER_EMAIL_EXEMPT_DOMAINS } from "@calcom/lib/constants";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import type { DateArray, EventStatus, ParticipationRole, ParticipationStatus } from "ics";
import { createEvent } from "ics";
import { RRule } from "rrule";

export enum BookingAction {
  Create = "create",
  Cancel = "cancel",
  Reschedule = "reschedule",
  RequestReschedule = "request_reschedule",
  LocationChange = "location_change",
}

export type ICSCalendarEvent = Pick<
  CalendarEvent,
  | "uid"
  | "iCalUID"
  | "iCalSequence"
  | "startTime"
  | "endTime"
  | "title"
  | "organizer"
  | "attendees"
  | "location"
  | "recurringEvent"
  | "team"
  | "type"
  | "hideCalendarEventDetails"
  | "hideOrganizerEmail"
>;

const toICalDateArray = (date: string): DateArray => {
  const d = new Date(date);
  return [
    d.getUTCFullYear(),
    d.getUTCMonth() + 1, // Convert 0-based month to 1-based
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
  ] satisfies DateArray;
};

const generateIcsString = ({
  event,
  status,
  partstat = "ACCEPTED",
  t,
}: {
  event: ICSCalendarEvent;
  status: EventStatus;
  partstat?: ParticipationStatus;
  t?: TFunction;
}): string | undefined => {
  const location = getVideoCallUrlFromCalEvent(event) || event.location;

  // Taking care of recurrence rule
  let recurrenceRule: string | undefined;
  const icsRole: ParticipationRole = "REQ-PARTICIPANT";
  if (event.recurringEvent?.count) {
    // ics appends "RRULE:" already, so removing it from RRule generated string
    recurrenceRule = new RRule(event.recurringEvent).toString().replace("RRULE:", "");
  }

  const isOrganizerExempt = ORGANIZER_EMAIL_EXEMPT_DOMAINS?.split(",")
    .filter((domain) => domain.trim() !== "")
    .some((domain) => event.organizer.email.toLowerCase().endsWith(domain.toLowerCase()));

  const icsEvent = createEvent({
    uid: event.iCalUID || event.uid!,
    sequence: event.iCalSequence || 0,
    start: toICalDateArray(event.startTime),
    end: toICalDateArray(event.endTime),
    startInputType: "utc",
    productId: "calcom/ics",
    title: event.title,
    description: getRichDescription(event, t),
    organizer: {
      name: event.organizer.name,
      ...(event.hideOrganizerEmail && !isOrganizerExempt
        ? { email: "no-reply@cal.com" }
        : { email: event.organizer.email }),
    },
    ...{ recurrenceRule },
    attendees: [
      ...event.attendees.map((attendee: Person) => ({
        name: attendee.name,
        email: attendee.email,
        partstat,
        role: icsRole,
        rsvp: true,
      })),
      ...(event.team?.members
        ? event.team?.members.map((member: Person) => ({
            name: member.name,
            email: member.email,
            partstat,
            role: icsRole,
            rsvp: true,
          }))
        : []),
    ],
    location: location ?? undefined,
    method: status === "CANCELLED" ? "CANCEL" : "REQUEST",
    status,
    ...(event.hideCalendarEventDetails ? { classification: "PRIVATE" } : {}),
    busyStatus: "BUSY",
  });
  if (icsEvent.error) {
    // The ics library throws Yup ValidationError objects (not Error instances) for invalid data like invalid email formats.
    // Convert these to ErrorWithCode.BadRequest so they return 400 instead of falling through to a generic 500.
    if (icsEvent.error.name === "ValidationError") {
      throw new ErrorWithCode(ErrorCode.BadRequest, icsEvent.error.message);
    }
    throw icsEvent.error;
  }
  return icsEvent.value;
};

export default generateIcsString;
