import type { TFunction } from "i18next";
import { RRule } from "rrule";

import dayjs from "@calcom/dayjs";
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

  function getPreviousRecipientStart(format: string): string | null {
    if(!props.calEvent.previousStartTime) return null
    return dayjs(props.calEvent.previousStartTime).tz(timeZone).locale(locale).format(format)
  }

  function getPreviousRecipientEnd(format: string): string | null  {
    if(!props.calEvent.previousEndTime) return null
    return dayjs(props.calEvent.previousEndTime).tz(timeZone).locale(locale).format(format)
  }

  function getRecipientStart(format: string) {
    return dayjs(props.calEvent.startTime).tz(timeZone).locale(locale).format(format);
  }

  const hasPreviousTime = !!(props.calEvent.previousStartTime && props.calEvent.previousEndTime);

  function getRecipientEnd(format: string) {
    return dayjs(props.calEvent.endTime).tz(timeZone).locale(locale).format(format);
  }

  const recurringInfo = getRecurringWhen({
    recurringEvent: props.calEvent.recurringEvent,
    attendee: props.calEvent.attendees[0],
  });

  return (
    <div>
      <Info
        label={`${t("when")}${recurringInfo ? ` - ${recurringInfo}` : ""}`}
        lineThrough={
          !!props.calEvent.cancellationReason &&
          !props.calEvent.cancellationReason.includes("$RCH$")
        }
        description={
          <div data-testid="when">
            {hasPreviousTime && (
              <div
                style={{ textDecoration: "line-through", opacity: 0.6 }}
                data-testid="previous-when">
                {recurringEvent?.count ? `${t("starting")} ` : ""}
                {getPreviousRecipientStart(`dddd, LL | ${timeFormat}`)} -{" "}
                {getPreviousRecipientEnd(timeFormat)}{" "}
                ({timeZone})
              </div>
            )}
            <div>
              {recurringEvent?.count ? `${t("starting")} ` : ""}
              {getRecipientStart(`dddd, LL | ${timeFormat}`)} -{" "}
              {getRecipientEnd(timeFormat)}{" "}
              ({timeZone})
            </div>
          </div>
        }
        withSpacer
      />
    </div>
  );
}
