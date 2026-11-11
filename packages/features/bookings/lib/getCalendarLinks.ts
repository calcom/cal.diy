import type { TFunction } from "i18next";
import { createEvent } from "ics";
import { RRule } from "rrule";
import type { z } from "zod";

import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import type { Prisma } from "@calcom/prisma/client";
import type { nameObjectSchema } from "@calcom/features/eventtypes/lib/eventNaming";
import { getEventName } from "@calcom/features/eventtypes/lib/eventNaming";
import { bookingMetadataSchema } from "@calcom/prisma/zod-utils";
import type { RecurringEvent } from "@calcom/types/Calendar";

type RecurringEventOrPrismaJsonObject = RecurringEvent | Prisma.JsonObject | null | undefined;
export const enum CalendarLinkType {
  GOOGLE_CALENDAR = "googleCalendar",
  MICROSOFT_OFFICE = "microsoftOffice",
  MICROSOFT_OUTLOOK = "microsoftOutlook",
  ICS = "ics",
}

const buildICalLink = ({
  startTime,
  endTime,
  title,
  description,
  location,
}: {
  startTime: Dayjs;
  endTime: Dayjs;
  title: string;
  description: string | null;
  location: string | null;
}) => {
  const durationInMinutes = endTime.diff(startTime, "minutes");

  const iCalEvent = createEvent({
    start: [
      startTime.toDate().getUTCFullYear(),
      (startTime.toDate().getUTCMonth() as number) + 1,
      startTime.toDate().getUTCDate(),
      startTime.toDate().getUTCHours(),
      startTime.toDate().getUTCMinutes(),
    ],
    startInputType: "utc",
    title,
    duration: {
      minutes: durationInMinutes,
    },
    ...(description ? { description } : {}),
    ...(location ? { location } : {}),
  });

  if (iCalEvent.error) {
    throw iCalEvent.error;
  }

  return `data:text/calendar,${encodeURIComponent(iCalEvent.value ? iCalEvent.value : false)}`;
};

const buildGoogleCalendarLink = ({
  startTime,
  endTime,
  eventName,
  eventDescription,
  bookingLocation,
  recurringEvent,
}: {
  startTime: Dayjs;
  endTime: Dayjs;
  eventName: string;
  eventDescription: string | null;
  bookingLocation: string | null;
  recurringEvent: RecurringEventOrPrismaJsonObject;
}) => {
  const startTimeInUtcFormat = startTime.utc().format("YYYYMMDDTHHmmss[Z]");
  const endTimeInUtcFormat = endTime.utc().format("YYYYMMDDTHHmmss[Z]");
  const recurrence = recurringEvent ? encodeURIComponent(new RRule(recurringEvent).toString()) : "";

  const location = bookingLocation ? encodeURIComponent(bookingLocation) : "";
  const description = encodeURIComponent(eventDescription ?? "");

  const googleCalendarLink = `https://calendar.google.com/calendar/r/eventedit?dates=${startTimeInUtcFormat}/${endTimeInUtcFormat}&text=${encodeURIComponent(eventName)}&details=${description}${
    location ? `&location=${location}` : ""
  }${recurrence ? `&recur=${recurrence}` : ""}`;

  return googleCalendarLink;
};

const buildMicrosoftOfficeLink = ({
  startTime,
  endTime,
  eventName,
  eventDescription,
  bookingLocation,
}: {
  startTime: Dayjs;
  endTime: Dayjs;
  eventName: string;
  eventDescription: string | null;
  bookingLocation: string | null;
}) => {
  const startTimeInUtcFormat = startTime.utc().format();
  const endTimeInUtcFormat = endTime.utc().format();
  const location = bookingLocation ? encodeURIComponent(bookingLocation) : "";
  const description = encodeURIComponent(eventDescription ?? "");

  const microsoftOfficeLink = `https://outlook.office.com/calendar/0/deeplink/compose?body=${description}&enddt=${endTimeInUtcFormat}&path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&startdt=${startTimeInUtcFormat}&subject=${encodeURIComponent(eventName)}${
    location ? `&location=${location}` : ""
  }`;
  return microsoftOfficeLink;
};

const buildMicrosoftOutlookLink = ({
  startTime,
  endTime,
  eventName,
  eventDescription,
  bookingLocation,
}: {
  startTime: Dayjs;
  endTime: Dayjs;
  eventName: string;
  eventDescription: string | null;
  bookingLocation: string | null;
}) => {
  const startTimeInUtcFormat = startTime.utc().format();
  const endTimeInUtcFormat = endTime.utc().format();
  const location = bookingLocation ? encodeURIComponent(bookingLocation) : "";

  const microsoftOutlookLink = `https://outlook.live.com/calendar/0/deeplink/compose?body=${encodeURIComponent(
    eventDescription ?? ""
  )}&enddt=${encodeURIComponent(endTimeInUtcFormat)}&path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&startdt=${encodeURIComponent(
    startTimeInUtcFormat
  )}&subject=${encodeURIComponent(eventName)}${location ? `&location=${location}` : ""}`;

  return microsoftOutlookLink;
};

export const getCalendarLinks = ({
  booking,
  eventType,
  t,
}: {
  booking: {
    startTime: Date;
    endTime: Date;
    location: string | null;
    title: string;
    responses: Prisma.JsonObject;
    metadata: Prisma.JsonObject | null;
  };
  eventType: {
    recurringEvent: RecurringEventOrPrismaJsonObject;
    description?: string | null;
    eventName?: string | null;
    isDynamic: boolean;
    length: number;
    team?: {
      name: string;
    } | null;
    users: {
      name: string | null;
    }[];
    title: string;
  };
  t: TFunction;
}) => {
  let evtName = eventType.eventName;
  const videoCallUrl = bookingMetadataSchema.parse(booking?.metadata || {})?.videoCallUrl ?? null;

  if (eventType.isDynamic && booking.responses.title) {
    evtName = booking.responses.title as string;
  }
  const eventNameObject = {
    attendeeName: booking.responses.name as z.infer<typeof nameObjectSchema> | string,
    eventType: eventType.title,
    eventName: evtName,
    host: eventType.team?.name || eventType.users[0]?.name || "Nameless",
    location: booking.location,
    bookingFields: booking.responses,
    eventDuration: dayjs(booking.endTime).diff(booking.startTime, "minutes"),
    t,
  };

  // Create event name and description
  const eventName = getEventName(eventNameObject, true);
  const eventDescription = eventType.description || "";

  // Calculate start and end times
  const startTime = dayjs(booking.startTime);
  const endTime = dayjs(booking.endTime);
  const recurringEvent = eventType.recurringEvent;

  const googleCalendarLink = buildGoogleCalendarLink({
    startTime,
    endTime,
    eventName,
    eventDescription,
    bookingLocation: videoCallUrl ?? null,
    recurringEvent,
  });

  const microsoftOfficeLink = buildMicrosoftOfficeLink({
    startTime,
    endTime,
    eventName,
    eventDescription,
    bookingLocation: videoCallUrl,
  });

  const microsoftOutlookLink = buildMicrosoftOutlookLink({
    startTime,
    endTime,
    eventName,
    eventDescription,
    bookingLocation: videoCallUrl,
  });

  // Generate ICS file link
  let icsFileLink = "";
  try {
    icsFileLink = buildICalLink({
      startTime,
      endTime,
      title: eventName,
      description: eventDescription ?? null,
      location: videoCallUrl ?? null,
    });
  } catch (error) {
    console.error("Error generating ICS file", error);
  }

  return [
    {
      label: "Google Calendar",
      id: CalendarLinkType.GOOGLE_CALENDAR,
      link: googleCalendarLink,
    },
    {
      label: "Microsoft Office",
      id: CalendarLinkType.MICROSOFT_OFFICE,
      link: microsoftOfficeLink,
    },
    {
      label: "Microsoft Outlook",
      id: CalendarLinkType.MICROSOFT_OUTLOOK,
      link: microsoftOutlookLink,
    },
    {
      label: "ICS",
      id: CalendarLinkType.ICS,
      link: icsFileLink,
    },
  ];
};
