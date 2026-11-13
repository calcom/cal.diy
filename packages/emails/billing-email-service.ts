import type BaseEmail from "@calcom/emails/templates/_base-email";
import type { EventTypeMetadata } from "@calcom/prisma/zod-utils";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import NoShowFeeChargedEmail from "./templates/no-show-fee-charged-email";
import OrganizerPaymentRefundFailedEmail from "./templates/organizer-payment-refund-failed-email";

const sendEmail = (prepare: () => BaseEmail) => {
  return new Promise((resolve, reject) => {
    try {
      const email = prepare();
      resolve(email.sendEmail());
    } catch (e) {
      reject(console.error(`${prepare.constructor.name}.sendEmail failed`, e));
    }
  });
};

const eventTypeDisableAttendeeEmail = (metadata?: EventTypeMetadata) => {
  return !!metadata?.disableStandardEmails?.all?.attendee;
};

export const sendOrganizerPaymentRefundFailedEmail = async (calEvent: CalendarEvent) => {
  const emailsToSend: Promise<unknown>[] = [];
  emailsToSend.push(sendEmail(() => new OrganizerPaymentRefundFailedEmail({ calEvent })));

  if (calEvent.team?.members) {
    for (const teamMember of calEvent.team.members) {
      emailsToSend.push(sendEmail(() => new OrganizerPaymentRefundFailedEmail({ calEvent, teamMember })));
    }
  }

  await Promise.all(emailsToSend);
};

export const sendNoShowFeeChargedEmail = async (
  attendee: Person,
  evt: CalendarEvent,
  eventTypeMetadata?: EventTypeMetadata
) => {
  if (eventTypeDisableAttendeeEmail(eventTypeMetadata)) return;
  await sendEmail(() => new NoShowFeeChargedEmail(evt, attendee));
};
