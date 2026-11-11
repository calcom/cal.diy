import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import renderEmail from "../src/renderEmail";
import AttendeeScheduledEmail from "./attendee-scheduled-email";

export default class AttendeePendingRescheduledEmail extends AttendeeScheduledEmail {
  constructor(calEvent: CalendarEvent, attendee: Person) {
    super(calEvent, attendee);
    this.name = "SEND_PENDING_RESCHEDULE_NOTIFICATION";
  }

  protected async getNodeMailerPayload(): Promise<Record<string, unknown>> {
    // No ICS attachment: booking is still PENDING, no calendar event should be
    // created yet. We deliberately omit the icalEvent field here.
    return {
      to: `${this.attendee.name} <${this.attendee.email}>`,
      from: `${this.calEvent.organizer.name} <${this.getMailerOptions().from}>`,
      subject: this.attendee.language.translate(
       "rescheduled_pending_event_type_subject",
       {
         title: this.calEvent.title,
         date: this.getFormattedDate(),
       }
     ),
      html: await this.getHtml(this.calEvent, this.attendee),
      text: this.getTextBody(
       "rescheduled_pending_attendee_email_title",
      "rescheduled_pending_attendee_email_subtitle"
     ),
    };
  }

  async getHtml(calEvent: CalendarEvent, attendee: Person) {
    return await renderEmail("AttendeeRescheduledEmail", {
      calEvent,
      attendee,
    });
  }
}