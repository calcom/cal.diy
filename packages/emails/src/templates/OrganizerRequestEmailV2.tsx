import { WEBAPP_URL } from "@calcom/lib/constants";
import { BookingConfirmationForm, CallToAction, CallToActionTable, Separator } from "../components";
import { OrganizerScheduledEmail } from "./OrganizerScheduledEmail";

export const OrganizerRequestEmailV2 = (props: React.ComponentProps<typeof OrganizerScheduledEmail>) => {
  const { uid } = props.calEvent;
  const userId = props.calEvent.organizer.id;
  const token = props.calEvent.oneTimePassword;
  //TODO: We should switch to using org domain if available
  const actionHref = `${WEBAPP_URL}/api/verify-booking-token/?token=${token}&userId=${userId}&bookingUid=${uid}`;
  return (
    <OrganizerScheduledEmail
      title={
        props.title || props.calEvent.recurringEvent?.count
          ? "event_awaiting_approval_recurring"
          : "event_awaiting_approval"
      }
      subtitle={<>{props.calEvent.organizer.language.translate("someone_requested_an_event")}</>}
      headerType="calendarCircle"
      subject="event_awaiting_approval_subject"
      callToAction={
        <BookingConfirmationForm action={`${actionHref}&action=reject`}>
          <CallToActionTable>
            <CallToAction
              label={props.calEvent.organizer.language.translate("confirm")}
              href={`${actionHref}&action=accept`}
              startIconName="confirmIcon"
            />
            <Separator />
            <CallToAction
              label={props.calEvent.organizer.language.translate("reject")}
              // href={`${actionHref}&action=reject`}
              startIconName="rejectIcon"
              secondary
            />
          </CallToActionTable>
        </BookingConfirmationForm>
      }
      {...props}
    />
  );
};
