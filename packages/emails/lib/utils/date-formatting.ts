import dayjs from "@calcom/dayjs";
import { TimeFormat } from "@calcom/lib/timeFormat";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";

export function getFormattedDate(calEvent: CalendarEvent, attendee: Person): string {
  const inviteeTimeFormat = calEvent.organizer.timeFormat || TimeFormat.TWELVE_HOUR;
  const timezone = attendee.timeZone;
  const locale = attendee.language.locale;
  const t = attendee.language.translate;

  const getFormattedRecipientTime = (time: string, format: string) => {
    const date = new Date(time);
    if (isNaN(date.getTime())) {
      return dayjs(time).tz(timezone).locale(locale).format(format);
    }

    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(date);

      const getPart = (type: string) => parts.find((p) => p.type === type)?.value;
      const localString = `${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart("hour")}:${getPart("minute")}:${getPart("second")}.000`;

      return dayjs.utc(localString).locale(locale).format(format);
    } catch (e) {
      return dayjs(time).tz(timezone).locale(locale).format(format);
    }
  };

  const getInviteeStart = (format: string) => {
    return getFormattedRecipientTime(calEvent.startTime, format);
  };

  const getInviteeEnd = (format: string) => {
    return getFormattedRecipientTime(calEvent.endTime, format);
  };

  return `${getInviteeStart(inviteeTimeFormat)} - ${getInviteeEnd(inviteeTimeFormat)}, ${t(
    getInviteeStart("dddd").toLowerCase()
  )}, ${t(getInviteeStart("MMMM").toLowerCase())} ${getInviteeStart("D, YYYY")}`;
}
