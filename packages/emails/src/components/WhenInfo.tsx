import dayjs from "@calcom/dayjs";
import type { TFunction } from "i18next";
import { RRule } from "rrule";
// TODO: Use browser locale, implement Intl in Dayjs maybe?
import "@calcom/dayjs/locales";
import { getEveryFreqFor } from "@calcom/lib/recurringStrings";
import type { TimeFormat } from "@calcom/lib/timeFormat";
import type { CalendarEvent, Person, RecurringEvent } from "@calcom/types/Calendar";
import { Info } from "./Info";

export function getRecurringWhen({
  recurringEvent,
  attendee,
}: {
  recurringEvent?: RecurringEvent | null;
  attendee: Pick<Person, "language">;
}) {
  if (recurringEvent) {
    const t = attendee.language.translate;
    const rruleOptions = new RRule(recurringEvent).options;
    const recurringEventConfig: RecurringEvent = {
      freq: rruleOptions.freq,
      count: rruleOptions.count || 1,
      interval: rruleOptions.interval,
    };
    return `${getEveryFreqFor({ t, recurringEvent: recurringEventConfig })}`;
  }
  return "";
}

export function WhenInfo(props: {
  calEvent: CalendarEvent;
  timeZone: string;
  t: TFunction;
  locale: string;
  timeFormat: TimeFormat;
}) {
  const { timeZone, t, calEvent: { recurringEvent } = {}, locale, timeFormat } = props;

  const getFormattedDate = (time: string, format: string) => {
    const date = new Date(time);
    if (isNaN(date.getTime())) {
      return dayjs(time).tz(timeZone).locale(locale).format(format);
    }
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
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
      return dayjs(time).tz(timeZone).locale(locale).format(format);
    }
  };

  function getRecipientStart(format: string) {
    return getFormattedDate(props.calEvent.startTime, format);
  }

  function getRecipientEnd(format: string) {
    return getFormattedDate(props.calEvent.endTime, format);
  }

  const recurringInfo = getRecurringWhen({
    recurringEvent: props.calEvent.recurringEvent,
    attendee: props.calEvent.attendees[0],
  });

  return (
    <div>
      <Info
        label={`${t("when")} ${recurringInfo !== "" ? ` - ${recurringInfo}` : ""}`}
        lineThrough={
          !!props.calEvent.cancellationReason && !props.calEvent.cancellationReason.includes("$RCH$")
        }
        description={
          <span data-testid="when">
            {recurringEvent?.count ? `${t("starting")} ` : ""}
            {getRecipientStart(`dddd, LL | ${timeFormat}`)} - {getRecipientEnd(timeFormat)}{" "}
            <span style={{ color: "#4B5563" }}>({timeZone})</span>
          </span>
        }
        withSpacer
      />
    </div>
  );
}
