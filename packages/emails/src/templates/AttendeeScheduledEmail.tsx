import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import { BaseScheduledEmail } from "./BaseScheduledEmail";

export const AttendeeScheduledEmail = (
  props: {
    calEvent: CalendarEvent;
    attendee: Person;
  } & Partial<React.ComponentProps<typeof BaseScheduledEmail>>
) => {
  return (
    <BaseScheduledEmail
      locale={props.attendee.language.locale}
      timeZone={props.attendee.timeZone}
      t={props.attendee.language.translate}
      timeFormat={props.attendee?.timeFormat}
      {...props}
    />
  );
};
