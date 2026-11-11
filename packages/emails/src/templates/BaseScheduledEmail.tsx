import dayjs from "@calcom/dayjs";
import { formatPrice } from "@calcom/lib/currencyConversions";
import { TimeFormat } from "@calcom/lib/timeFormat";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import {
  AppsStatus,
  BaseEmailHtml,
  Info,
  LocationInfo,
  ManageLink,
  UserFieldsResponses,
  WhenInfo,
  WhoInfo,
} from "../components";
import { PersonInfo } from "../components/WhoInfo";

export const BaseScheduledEmail = (
  props: {
    calEvent: CalendarEvent;
    attendee: Person;
    timeZone: string;
    includeAppsStatus?: boolean;
    t: TFunction;
    locale: string;
    timeFormat: TimeFormat | undefined;
    isOrganizer?: boolean;
    reassigned?: { name: string | null; email: string; reason?: string; byUser?: string };
  } & Partial<React.ComponentProps<typeof BaseEmailHtml>>
) => {
  const { t, timeZone, locale, timeFormat: timeFormat_ } = props;

  const timeFormat = timeFormat_ ?? TimeFormat.TWELVE_HOUR;

  function getRecipientStart(format: string) {
    return dayjs(props.calEvent.startTime).tz(timeZone).format(format);
  }

  function getRecipientEnd(format: string) {
    return dayjs(props.calEvent.endTime).tz(timeZone).format(format);
  }

  // When a custom event name is configured, calEvent.title already resolves booking-field
  // placeholders (e.g. "{company}"), so prefer it over the default templated subject. An explicit
  // props.subject still wins to preserve existing per-template overrides.
  const subject =
    !props.subject && props.calEvent.hasCustomEventName
      ? props.calEvent.title
      : t(props.subject || "confirmed_event_type_subject", {
          eventType: props.calEvent.type,
          name: props.calEvent.team?.name || props.calEvent.organizer.name,
          date: `${getRecipientStart("h:mma")} - ${getRecipientEnd("h:mma")}, ${t(
            getRecipientStart("dddd").toLowerCase()
          )}, ${t(getRecipientStart("MMMM").toLowerCase())} ${getRecipientStart("D, YYYY")}`,
          interpolation: { escapeValue: false },
        });

  let rescheduledBy = props.calEvent.rescheduledBy;
  if (
    rescheduledBy &&
    rescheduledBy === props.calEvent.organizer.email &&
    props.calEvent.hideOrganizerEmail
  ) {
    const personWhoRescheduled = [props.calEvent.organizer, ...props.calEvent.attendees].find(
      (person) => person.email === rescheduledBy
    );
    rescheduledBy = personWhoRescheduled?.name;
  }

  return (
    <BaseEmailHtml
      hideLogo={Boolean(props.calEvent.platformClientId) || Boolean(props.calEvent.hideBranding)}
      headerType={props.headerType || "checkCircle"}
      subject={props.subject || subject}
      title={t(
        props.title
          ? props.title
          : props.calEvent.recurringEvent?.count
            ? "your_event_has_been_scheduled_recurring"
            : "your_event_has_been_scheduled"
      )}
      callToAction={
        props.callToAction === null
          ? null
          : props.callToAction || <ManageLink attendee={props.attendee} calEvent={props.calEvent} />
      }
      subtitle={props.subtitle || <>{t("emailed_you_and_any_other_attendees")}</>}>
      {props.calEvent.rejectionReason && (
        <>
          <Info label={t("rejection_reason")} description={props.calEvent.rejectionReason} withSpacer />
        </>
      )}
      {props.calEvent.cancellationReason && (
        <Info
          label={t(
            props.calEvent.cancellationReason.startsWith("$RCH$")
              ? "reason_for_reschedule"
              : "cancellation_reason"
          )}
          description={
            !!props.calEvent.cancellationReason && props.calEvent.cancellationReason.replace("$RCH$", "")
          } // Removing flag to distinguish reschedule from cancellation
          withSpacer
        />
      )}
      {props.reassigned && !props.reassigned.byUser && (
        <>
          <Info
            label={t("reassigned_to")}
            description={
              <PersonInfo name={props.reassigned.name || undefined} email={props.reassigned.email} />
            }
            withSpacer
          />
          {props.reassigned?.reason && (
            <Info label={t("reason")} description={props.reassigned.reason} withSpacer />
          )}
        </>
      )}
      {props.reassigned && props.reassigned.byUser && (
        <>
          <Info label={t("reassigned_by")} description={props.reassigned.byUser} withSpacer />
          {props.reassigned?.reason && (
            <Info label={t("reason")} description={props.reassigned.reason} withSpacer />
          )}
        </>
      )}
      {rescheduledBy && <Info label={t("rescheduled_by")} description={rescheduledBy} withSpacer />}
      <Info label={t("what")} description={props.calEvent.title} withSpacer />
      <WhenInfo timeFormat={timeFormat} calEvent={props.calEvent} t={t} timeZone={timeZone} locale={locale} />
      <WhoInfo calEvent={props.calEvent} t={t} />
      <LocationInfo calEvent={props.calEvent} t={t} />
      <Info label={t("description")} description={props.calEvent.description} withSpacer formatted />
      <Info label={t("additional_notes")} description={props.calEvent.additionalNotes} withSpacer />
      {props.includeAppsStatus && <AppsStatus calEvent={props.calEvent} t={t} />}
      {props.isOrganizer && props.calEvent.assignmentReason && (
        <Info
          label={t("assignment_reason")}
          description={`${t(props.calEvent.assignmentReason.category)}${props.calEvent.assignmentReason.details ? `: ${props.calEvent.assignmentReason.details}` : ""}`}
          withSpacer
        />
      )}
      <UserFieldsResponses t={t} calEvent={props.calEvent} isOrganizer={props.isOrganizer} />
      {props.calEvent.paymentInfo?.amount && (
        <Info
          label={props.calEvent.paymentInfo.paymentOption === "HOLD" ? t("no_show_fee") : t("price")}
          description={formatPrice(
            props.calEvent.paymentInfo.amount,
            props.calEvent.paymentInfo.currency,
            props.attendee.language.locale
          )}
          withSpacer
        />
      )}
    </BaseEmailHtml>
  );
};
