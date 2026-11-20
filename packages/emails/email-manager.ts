import { default as cloneDeep } from "lodash/cloneDeep";
import type { z } from "zod";

import dayjs from "@calcom/dayjs";
import type BaseEmail from "@calcom/emails/templates/_base-email";
import type { EventNameObjectType } from "@calcom/features/eventtypes/lib/eventNaming";
import { getEventName } from "@calcom/features/eventtypes/lib/eventNaming";
import { formatCalEvent } from "@calcom/lib/formatCalendarEvent";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import { withReporting } from "@calcom/lib/sentryWrapper";
import { prisma } from "@calcom/prisma";
import type { EventTypeMetaDataSchema } from "@calcom/prisma/zod-utils";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";

import AwaitingPaymentSMS from "../sms/attendee/awaiting-payment-sms";
import CancelledSeatSMS from "../sms/attendee/cancelled-seat-sms";
import EventCancelledSMS from "../sms/attendee/event-cancelled-sms";
import EventDeclinedSMS from "../sms/attendee/event-declined-sms";
import EventLocationChangedSMS from "../sms/attendee/event-location-changed-sms";
import EventRequestSMS from "../sms/attendee/event-request-sms";
import EventRequestToRescheduleSMS from "../sms/attendee/event-request-to-reschedule-sms";
import EventSuccessfullyReScheduledSMS from "../sms/attendee/event-rescheduled-sms";
import EventSuccessfullyScheduledSMS from "../sms/attendee/event-scheduled-sms";
import { EmailType } from "./email-types";
import AttendeeAddGuestsEmail from "./templates/attendee-add-guests-email";
import AttendeeAwaitingPaymentEmail from "./templates/attendee-awaiting-payment-email";
import AttendeeCancelledEmail from "./templates/attendee-cancelled-email";
import AttendeeCancelledSeatEmail from "./templates/attendee-cancelled-seat-email";
import AttendeeDeclinedEmail from "./templates/attendee-declined-email";
import AttendeeLocationChangeEmail from "./templates/attendee-location-change-email";
import AttendeeRequestEmail from "./templates/attendee-request-email";
import AttendeeRescheduledEmail from "./templates/attendee-rescheduled-email";
import AttendeeScheduledEmail from "./templates/attendee-scheduled-email";
import AttendeeUpdatedEmail from "./templates/attendee-updated-email";
import AttendeeWasRequestedToRescheduleEmail from "./templates/attendee-was-requested-to-reschedule-email";
import OrganizerAddGuestsEmail from "./templates/organizer-add-guests-email";
import OrganizerAttendeeCancelledSeatEmail from "./templates/organizer-attendee-cancelled-seat-email";
import OrganizerCancelledEmail from "./templates/organizer-cancelled-email";
import OrganizerLocationChangeEmail from "./templates/organizer-location-change-email";
import OrganizerReassignedEmail from "./templates/organizer-reassigned-email";
import OrganizerRequestEmail from "./templates/organizer-request-email";
import OrganizerRequestReminderEmail from "./templates/organizer-request-reminder-email";
import OrganizerRequestedToRescheduleEmail from "./templates/organizer-requested-to-reschedule-email";
import OrganizerRescheduledEmail from "./templates/organizer-rescheduled-email";
import OrganizerScheduledEmail from "./templates/organizer-scheduled-email";
import AttendeePendingRescheduledEmail from "./templates/attendee-pending-rescheduled-email";
import OrganizerPendingRescheduledEmail from "./templates/organizer-pending-rescheduled-email";
import { BookingStatus } from "@calcom/prisma/enums";

type EventTypeMetadata = z.infer<typeof EventTypeMetaDataSchema>;

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

// Organization settings removed (team/org only feature)
export const fetchOrganizationEmailSettings = async (_organizationId?: number | null | undefined) => {
  return null;
};

// Organization email settings removed (team/org only feature) - only check event type metadata
export const shouldSkipAttendeeEmailWithSettings = (
  metadata: EventTypeMetadata | undefined,
  _organizationSettings?: Awaited<ReturnType<typeof fetchOrganizationEmailSettings>>,
  _emailType?: EmailType
): boolean => {
  return !!metadata?.disableStandardEmails?.all?.attendee;
};

const eventTypeDisableHostEmail = (metadata?: EventTypeMetadata) => {
  return !!metadata?.disableStandardEmails?.all?.host;
};

const _sendScheduledEmailsAndSMS = async (
  calEvent: CalendarEvent,
  eventNameObject?: EventNameObjectType,
  hostEmailDisabled?: boolean,
  attendeeEmailDisabled?: boolean,
  eventTypeMetadata?: EventTypeMetadata
) => {
  const formattedCalEvent = formatCalEvent(calEvent);
  const emailsToSend: Promise<unknown>[] = [];
  const organizationSettings = await fetchOrganizationEmailSettings(calEvent.organizationId);

  if (!hostEmailDisabled && !eventTypeDisableHostEmail(eventTypeMetadata)) {
    emailsToSend.push(sendEmail(() => new OrganizerScheduledEmail({ calEvent: formattedCalEvent })));

    if (formattedCalEvent.team) {
      for (const teamMember of formattedCalEvent.team.members) {
        emailsToSend.push(
          sendEmail(() => new OrganizerScheduledEmail({ calEvent: formattedCalEvent, teamMember }))
        );
      }
    }
  }

  if (
    !attendeeEmailDisabled &&
    !shouldSkipAttendeeEmailWithSettings(eventTypeMetadata, organizationSettings, EmailType.CONFIRMATION)
  ) {
    emailsToSend.push(
      ...formattedCalEvent.attendees.map((attendee) => {
        return sendEmail(
          () =>
            new AttendeeScheduledEmail(
              {
                ...formattedCalEvent,
                ...(formattedCalEvent.hideCalendarNotes && { additionalNotes: undefined }),
                ...(eventNameObject && {
                  title: getEventName({ ...eventNameObject, t: attendee.language.translate }),
                }),
              },
              attendee
            )
        );
      })
    );
  }

  await Promise.all(emailsToSend);
  const successfullyScheduledSms = new EventSuccessfullyScheduledSMS(calEvent);
  await successfullyScheduledSms.sendSMSToAttendees();
};

export const sendScheduledEmailsAndSMS = withReporting(
  _sendScheduledEmailsAndSMS,
  "sendScheduledEmailsAndSMS"
);

// for rescheduled round robin booking that assigned new members
// or for reassignment of a managed event
export const sendReassignedScheduledEmailsAndSMS = async ({
  calEvent,
  members,
  eventTypeMetadata,
  reassigned,
}: {
  calEvent: CalendarEvent;
  members: Person[];
  eventTypeMetadata?: EventTypeMetadata;
  reassigned?: { name: string | null; email: string; reason?: string; byUser?: string };
}) => {
  if (eventTypeDisableHostEmail(eventTypeMetadata)) return;
  const formattedCalEvent = formatCalEvent(calEvent);
  const emailsAndSMSToSend: Promise<unknown>[] = [];
  const eventScheduledSMS = new EventSuccessfullyScheduledSMS(calEvent);

  for (const teamMember of members) {
    emailsAndSMSToSend.push(
      sendEmail(() => new OrganizerScheduledEmail({ calEvent: formattedCalEvent, teamMember, reassigned }))
    );
    if (teamMember.phoneNumber) {
      emailsAndSMSToSend.push(eventScheduledSMS.sendSMSToAttendee(teamMember));
    }
  }

  await Promise.all(emailsAndSMSToSend);
};

export const sendRoundRobinRescheduledEmailsAndSMS = async (
  calEvent: CalendarEvent,
  teamMembersAndAttendees: Person[],
  eventTypeMetadata?: EventTypeMetadata
) => {
  const calendarEvent = formatCalEvent(calEvent);
  const emailsAndSMSToSend: Promise<unknown>[] = [];
  const successfullyReScheduledSMS = new EventSuccessfullyReScheduledSMS(calEvent);
  const organizationSettings = await fetchOrganizationEmailSettings(calEvent.organizationId);

  for (const person of teamMembersAndAttendees) {
    const isAttendee = calendarEvent.attendees.some((attendee) => attendee.email === person.email);
    const isTeamMember = !!calendarEvent.team?.members.some((member) => member.email === person.email);

    if (isAttendee && !isTeamMember) {
      if (
        !shouldSkipAttendeeEmailWithSettings(eventTypeMetadata, organizationSettings, EmailType.RESCHEDULED)
      ) {
        emailsAndSMSToSend.push(
          sendEmail(
            () =>
              new AttendeeRescheduledEmail(
                {
                  ...calendarEvent,
                  ...(calendarEvent.hideCalendarNotes && { additionalNotes: undefined }),
                },
                person
              )
          )
        );
        if (person.phoneNumber) {
          emailsAndSMSToSend.push(successfullyReScheduledSMS.sendSMSToAttendee(person));
        }
      }
    } else if (!eventTypeDisableHostEmail(eventTypeMetadata)) {
      emailsAndSMSToSend.push(
        sendEmail(() => new OrganizerRescheduledEmail({ calEvent: calendarEvent, teamMember: person }))
      );
      if (person.phoneNumber) {
        emailsAndSMSToSend.push(successfullyReScheduledSMS.sendSMSToAttendee(person));
      }
    }
  }

  await Promise.all(emailsAndSMSToSend);
};

export const sendReassignedUpdatedEmailsAndSMS = async ({
  calEvent,
  eventTypeMetadata,
  showAttendees,
}: {
  calEvent: CalendarEvent;
  eventTypeMetadata?: EventTypeMetadata;
  showAttendees: boolean;
}) => {
  const organizationSettings = await fetchOrganizationEmailSettings(calEvent.organizationId);
  if (shouldSkipAttendeeEmailWithSettings(eventTypeMetadata, organizationSettings, EmailType.REASSIGNED))
    return;

  const emailsToSend = calEvent.attendees.map((attendee) =>
    sendEmail(() => new AttendeeUpdatedEmail(calEvent, attendee, showAttendees))
  );

  await Promise.all(emailsToSend);
};

export const sendRoundRobinCancelledEmailsAndSMS = async (
  calEvent: CalendarEvent,
  members: Person[],
  eventTypeMetadata?: EventTypeMetadata,
  reassignedTo?: { name: string | null; email: string; reason?: string }
) => {
  if (eventTypeDisableHostEmail(eventTypeMetadata)) return;
  const calendarEvent = formatCalEvent(calEvent);
  const emailsAndSMSToSend: Promise<unknown>[] = [];
  const successfullyReScheduledSMS = new EventCancelledSMS(calEvent);
  for (const teamMember of members) {
    emailsAndSMSToSend.push(
      sendEmail(
        () => new OrganizerCancelledEmail({ calEvent: calendarEvent, teamMember, reassigned: reassignedTo })
      )
    );

    if (teamMember.phoneNumber) {
      emailsAndSMSToSend.push(successfullyReScheduledSMS.sendSMSToAttendee(teamMember));
    }
  }

  await Promise.all(emailsAndSMSToSend);
};

export const sendReassignedEmailsAndSMS = async (args: {
  calEvent: CalendarEvent;
  members: Person[];
  reassignedTo: { name: string | null; email: string };
  eventTypeMetadata?: EventTypeMetadata;
}) => {
  const { calEvent, members, reassignedTo, eventTypeMetadata } = args;
  if (eventTypeDisableHostEmail(eventTypeMetadata)) return;
  const calendarEvent = formatCalEvent(calEvent);
  const emailsAndSMSToSend: Promise<unknown>[] = [];
  const successfullyReScheduledSMS = new EventCancelledSMS(calEvent);
  for (const teamMember of members) {
    emailsAndSMSToSend.push(
      sendEmail(
        () => new OrganizerReassignedEmail({ calEvent: calendarEvent, teamMember, reassigned: reassignedTo })
      )
    );

    if (teamMember.phoneNumber) {
      emailsAndSMSToSend.push(successfullyReScheduledSMS.sendSMSToAttendee(teamMember));
    }
  }

  await Promise.all(emailsAndSMSToSend);
};

const _sendRescheduledEmailsAndSMS = async (
  calEvent: CalendarEvent,
  eventTypeMetadata?: EventTypeMetadata,
    originalBookingStatus?: BookingStatus,
) => {
  const calendarEvent = formatCalEvent(calEvent);
  const emailsToSend: Promise<unknown>[] = [];
  const organizationSettings = await fetchOrganizationEmailSettings(calEvent.organizationId);

  const wasPending = originalBookingStatus === BookingStatus.PENDING;

  if (wasPending) {
    const attendeeCalEvent = {
      ...calendarEvent,
      ...(calendarEvent.hideCalendarNotes && { additionalNotes: undefined }),
    };

    if (!eventTypeDisableHostEmail(eventTypeMetadata)) {
      emailsToSend.push(sendEmail(() => new OrganizerPendingRescheduledEmail({ calEvent: calendarEvent })));

      if (calendarEvent.team) {
        for (const teamMember of calendarEvent.team.members) {
          emailsToSend.push(
            sendEmail(() => new OrganizerPendingRescheduledEmail({ calEvent: calendarEvent, teamMember }))
          );
        }
      }
    }

    if (!shouldSkipAttendeeEmailWithSettings(eventTypeMetadata, organizationSettings, EmailType.RESCHEDULED)) {
      emailsToSend.push(
        ...calendarEvent.attendees.map((attendee) =>
          sendEmail(() => new AttendeePendingRescheduledEmail(attendeeCalEvent, attendee))
        )
      );
    }

    await Promise.all(emailsToSend);
    return;
   }

  if (!eventTypeDisableHostEmail(eventTypeMetadata)) {
    emailsToSend.push(sendEmail(() => new OrganizerRescheduledEmail({ calEvent: calendarEvent })));

    if (calendarEvent.team) {
      for (const teamMember of calendarEvent.team.members) {
        emailsToSend.push(
          sendEmail(() => new OrganizerRescheduledEmail({ calEvent: calendarEvent, teamMember }))
        );
      }
    }
  }

  if (!shouldSkipAttendeeEmailWithSettings(eventTypeMetadata, organizationSettings, EmailType.RESCHEDULED)) {
    emailsToSend.push(
      ...calendarEvent.attendees.map((attendee) => {
        return sendEmail(
          () =>
            new AttendeeRescheduledEmail(
              {
                ...calendarEvent,
                ...(calendarEvent.hideCalendarNotes && { additionalNotes: undefined }),
              },
              attendee
            )
        );
      })
    );
  }

  await Promise.all(emailsToSend);
  const successfullyReScheduledSms = new EventSuccessfullyReScheduledSMS(calEvent);
  await successfullyReScheduledSms.sendSMSToAttendees();
};
export const sendRescheduledEmailsAndSMS = withReporting(
  _sendRescheduledEmailsAndSMS,
  "sendRescheduledEmailsAndSMS"
);

export const sendRescheduledSeatEmailAndSMS = async (
  calEvent: CalendarEvent,
  attendee: Person,
  eventTypeMetadata?: EventTypeMetadata
) => {
  const calendarEvent = formatCalEvent(calEvent);

  const clonedCalEvent = cloneDeep(calendarEvent);
  const emailsToSend: Promise<unknown>[] = [];
  const organizationSettings = await fetchOrganizationEmailSettings(calEvent.organizationId);

  if (!eventTypeDisableHostEmail(eventTypeMetadata))
    emailsToSend.push(sendEmail(() => new OrganizerRescheduledEmail({ calEvent: calendarEvent })));
  if (!shouldSkipAttendeeEmailWithSettings(eventTypeMetadata, organizationSettings, EmailType.RESCHEDULED))
    emailsToSend.push(
      sendEmail(
        () =>
          new AttendeeRescheduledEmail(
            {
              ...clonedCalEvent,
              ...(clonedCalEvent.hideCalendarNotes && { additionalNotes: undefined }),
            },
            attendee
          )
      )
    );

  const successfullyReScheduledSMS = new EventSuccessfullyReScheduledSMS(calEvent);
  await successfullyReScheduledSMS.sendSMSToAttendee(attendee);

  await Promise.all(emailsToSend);
};

export const sendScheduledSeatsEmailsAndSMS = async (
  calEvent: CalendarEvent,
  invitee: Person,
  newSeat: boolean,
  showAttendees: boolean,
  hostEmailDisabled?: boolean,
  attendeeEmailDisabled?: boolean,
  eventTypeMetadata?: EventTypeMetadata
) => {
  const calendarEvent = formatCalEvent(calEvent);

  const emailsToSend: Promise<unknown>[] = [];
  const organizationSettings = await fetchOrganizationEmailSettings(calEvent.organizationId);

  if (!hostEmailDisabled && !eventTypeDisableHostEmail(eventTypeMetadata)) {
    emailsToSend.push(sendEmail(() => new OrganizerScheduledEmail({ calEvent: calendarEvent, newSeat })));

    if (calendarEvent.team) {
      for (const teamMember of calendarEvent.team.members) {
        emailsToSend.push(
          sendEmail(() => new OrganizerScheduledEmail({ calEvent: calendarEvent, newSeat, teamMember }))
        );
      }
    }
  }

  if (
    !attendeeEmailDisabled &&
    !shouldSkipAttendeeEmailWithSettings(eventTypeMetadata, organizationSettings, EmailType.CONFIRMATION)
  ) {
    emailsToSend.push(
      sendEmail(
        () =>
          new AttendeeScheduledEmail(
            {
              ...calendarEvent,
              ...(calendarEvent.hideCalendarNotes && { additionalNotes: undefined }),
            },
            invitee,
            showAttendees
          )
      )
    );
  }
  await Promise.all(emailsToSend);
  const eventScheduledSMS = new EventSuccessfullyScheduledSMS(calendarEvent);
  await eventScheduledSMS.sendSMSToAttendee(invitee);
};

export const sendCancelledSeatEmailsAndSMS = async (
  calEvent: CalendarEvent,
  cancelledAttendee: Person,
  eventTypeMetadata?: EventTypeMetadata
) => {
  const formattedCalEvent = formatCalEvent(calEvent);
  const clonedCalEvent = cloneDeep(formattedCalEvent);
  const emailsToSend: Promise<unknown>[] = [];
  const organizationSettings = await fetchOrganizationEmailSettings(calEvent.organizationId);

  if (!shouldSkipAttendeeEmailWithSettings(eventTypeMetadata, organizationSettings, EmailType.CANCELLATION))
    emailsToSend.push(sendEmail(() => new AttendeeCancelledSeatEmail(clonedCalEvent, cancelledAttendee)));
  if (!eventTypeDisableHostEmail(eventTypeMetadata))
    emailsToSend.push(
      sendEmail(
        () =>
          new OrganizerAttendeeCancelledSeatEmail({
            calEvent: formattedCalEvent,
            attendee: cancelledAttendee,
          })
      )
    );

  await Promise.all(emailsToSend);
  const cancelledSeatSMS = new CancelledSeatSMS(clonedCalEvent);
  await cancelledSeatSMS.sendSMSToAttendee(cancelledAttendee);
};

const _sendOrganizerRequestEmail = async (calEvent: CalendarEvent, eventTypeMetadata?: EventTypeMetadata) => {
  if (eventTypeDisableHostEmail(eventTypeMetadata)) return;
  const calendarEvent = formatCalEvent(calEvent);

  const emailsToSend: Promise<unknown>[] = [];

  emailsToSend.push(sendEmail(() => new OrganizerRequestEmail({ calEvent: calendarEvent })));

  if (calendarEvent.team?.members) {
    for (const teamMember of calendarEvent.team.members) {
      emailsToSend.push(sendEmail(() => new OrganizerRequestEmail({ calEvent: calendarEvent, teamMember })));
    }
  }

  await Promise.all(emailsToSend);
};

export const sendOrganizerRequestEmail = withReporting(
  _sendOrganizerRequestEmail,
  "sendOrganizerRequestEmail"
);

const _sendAttendeeRequestEmailAndSMS = async (
  calEvent: CalendarEvent,
  attendee: Person,
  eventTypeMetadata?: EventTypeMetadata
) => {
  const organizationSettings = await fetchOrganizationEmailSettings(calEvent.organizationId);
  if (shouldSkipAttendeeEmailWithSettings(eventTypeMetadata, organizationSettings, EmailType.REQUEST)) return;

  const calendarEvent = formatCalEvent(calEvent);
  await sendEmail(() => new AttendeeRequestEmail(calendarEvent, attendee));
  const eventRequestSms = new EventRequestSMS(calendarEvent);
  await eventRequestSms.sendSMSToAttendee(attendee);
};

export const sendAttendeeRequestEmailAndSMS = withReporting(
  _sendAttendeeRequestEmailAndSMS,
  "sendAttendeeRequestEmailAndSMS"
);

export const sendDeclinedEmailsAndSMS = async (
  calEvent: CalendarEvent,
  eventTypeMetadata?: EventTypeMetadata
) => {
  const organizationSettings = await fetchOrganizationEmailSettings(calEvent.organizationId);
  if (shouldSkipAttendeeEmailWithSettings(eventTypeMetadata, organizationSettings, EmailType.REQUEST)) return;

  const calendarEvent = formatCalEvent(calEvent);
  const emailsToSend: Promise<unknown>[] = [];

  emailsToSend.push(
    ...calendarEvent.attendees.map((attendee) => {
      return sendEmail(() => new AttendeeDeclinedEmail(calendarEvent, attendee));
    })
  );

  await Promise.all(emailsToSend);
  const eventDeclindedSms = new EventDeclinedSMS(calEvent);
  await eventDeclindedSms.sendSMSToAttendees();
};

export const sendCancelledEmailsAndSMS = async (
  calEvent: CalendarEvent,
  eventNameObject: Pick<EventNameObjectType, "eventName">,
  eventTypeMetadata?: EventTypeMetadata
) => {
  const calendarEvent = formatCalEvent(calEvent);
  const emailsToSend: Promise<unknown>[] = [];
  const calEventLength = calendarEvent.length;
  const eventDuration = dayjs(calEvent.endTime).diff(calEvent.startTime, "minutes");
  const organizationSettings = await fetchOrganizationEmailSettings(calEvent.organizationId);

  if (typeof calEventLength !== "number") {
    logger.error(
      "`calEventLength` is not a number",
      safeStringify({ calEventLength, calEventTitle: calEvent.title, bookingId: calEvent.bookingId })
    );
  }

  if (!eventTypeDisableHostEmail(eventTypeMetadata)) {
    emailsToSend.push(sendEmail(() => new OrganizerCancelledEmail({ calEvent: calendarEvent })));

    if (calendarEvent.team?.members) {
      for (const teamMember of calendarEvent.team.members) {
        emailsToSend.push(
          sendEmail(() => new OrganizerCancelledEmail({ calEvent: calendarEvent, teamMember }))
        );
      }
    }
  }

  if (!shouldSkipAttendeeEmailWithSettings(eventTypeMetadata, organizationSettings, EmailType.CANCELLATION)) {
    emailsToSend.push(
      ...calendarEvent.attendees.map((attendee) => {
        return sendEmail(
          () =>
            new AttendeeCancelledEmail(
              {
                ...calendarEvent,
                title: getEventName({
                  ...eventNameObject,
                  t: attendee.language.translate,
                  attendeeName: attendee.name,
                  host: calendarEvent.organizer.name,
                  eventType: calendarEvent.title,
                  eventDuration,
                  ...(calendarEvent.responses && { bookingFields: calendarEvent.responses }),
                  ...(calendarEvent.location && { location: calendarEvent.location }),
                }),
              },
              attendee
            )
        );
      })
    );
  }

  await Promise.all(emailsToSend);
  const eventCancelledSms = new EventCancelledSMS(calEvent);
  await eventCancelledSms.sendSMSToAttendees();
};

export const sendOrganizerRequestReminderEmail = async (
  calEvent: CalendarEvent,
  eventTypeMetadata?: EventTypeMetadata
) => {
  if (eventTypeDisableHostEmail(eventTypeMetadata)) return;
  const calendarEvent = formatCalEvent(calEvent);

  const emailsToSend: Promise<unknown>[] = [];

  emailsToSend.push(sendEmail(() => new OrganizerRequestReminderEmail({ calEvent: calendarEvent })));

  if (calendarEvent.team?.members) {
    for (const teamMember of calendarEvent.team.members) {
      emailsToSend.push(
        sendEmail(() => new OrganizerRequestReminderEmail({ calEvent: calendarEvent, teamMember }))
      );
    }
  }
};

export const sendAwaitingPaymentEmailAndSMS = async (
  calEvent: CalendarEvent,
  eventTypeMetadata?: EventTypeMetadata
) => {
  const organizationSettings = await fetchOrganizationEmailSettings(calEvent.organizationId);
  const emailsToSend: Promise<unknown>[] = [];

  if (
    !shouldSkipAttendeeEmailWithSettings(eventTypeMetadata, organizationSettings, EmailType.AWAITING_PAYMENT)
  ) {
    emailsToSend.push(
      ...calEvent.attendees.map((attendee) => {
        return sendEmail(() => new AttendeeAwaitingPaymentEmail(calEvent, attendee));
      })
    );
  }

  await Promise.all(emailsToSend);
  const awaitingPaymentSMS = new AwaitingPaymentSMS(calEvent);
  await awaitingPaymentSMS.sendSMSToAttendees();
};

export const sendRequestRescheduleEmailAndSMS = async (
  calEvent: CalendarEvent,
  metadata: { rescheduleLink: string },
  eventTypeMetadata?: EventTypeMetadata
) => {
  const emailsToSend: Promise<unknown>[] = [];
  const calendarEvent = formatCalEvent(calEvent);
  const organizationSettings = await fetchOrganizationEmailSettings(calEvent.organizationId);

  if (!eventTypeDisableHostEmail(eventTypeMetadata)) {
    emailsToSend.push(sendEmail(() => new OrganizerRequestedToRescheduleEmail(calendarEvent, metadata)));
  }
  if (
    !shouldSkipAttendeeEmailWithSettings(
      eventTypeMetadata,
      organizationSettings,
      EmailType.RESCHEDULE_REQUEST
    )
  ) {
    emailsToSend.push(sendEmail(() => new AttendeeWasRequestedToRescheduleEmail(calendarEvent, metadata)));
  }

  await Promise.all(emailsToSend);
  const eventRequestToReschedule = new EventRequestToRescheduleSMS(calendarEvent);
  await eventRequestToReschedule.sendSMSToAttendees();
};

export const sendLocationChangeEmailsAndSMS = async (
  calEvent: CalendarEvent,
  eventTypeMetadata?: EventTypeMetadata
) => {
  const calendarEvent = formatCalEvent(calEvent);

  const emailsToSend: Promise<unknown>[] = [];
  const organizationSettings = await fetchOrganizationEmailSettings(calEvent.organizationId);

  if (!eventTypeDisableHostEmail(eventTypeMetadata)) {
    emailsToSend.push(sendEmail(() => new OrganizerLocationChangeEmail({ calEvent: calendarEvent })));

    if (calendarEvent.team?.members) {
      for (const teamMember of calendarEvent.team.members) {
        emailsToSend.push(
          sendEmail(() => new OrganizerLocationChangeEmail({ calEvent: calendarEvent, teamMember }))
        );
      }
    }
  }

  if (
    !shouldSkipAttendeeEmailWithSettings(eventTypeMetadata, organizationSettings, EmailType.LOCATION_CHANGE)
  ) {
    emailsToSend.push(
      ...calendarEvent.attendees.map((attendee) => {
        return sendEmail(() => new AttendeeLocationChangeEmail(calendarEvent, attendee));
      })
    );
  }

  await Promise.all(emailsToSend);
  const eventLocationChangedSMS = new EventLocationChangedSMS(calendarEvent);
  await eventLocationChangedSMS.sendSMSToAttendees();
};
export const sendAddGuestsEmails = async (calEvent: CalendarEvent, newGuests: string[]) => {
  const calendarEvent = formatCalEvent(calEvent);

  const emailsToSend: Promise<unknown>[] = [];
  emailsToSend.push(sendEmail(() => new OrganizerAddGuestsEmail({ calEvent: calendarEvent })));

  if (calendarEvent.team?.members) {
    for (const teamMember of calendarEvent.team.members) {
      emailsToSend.push(
        sendEmail(() => new OrganizerAddGuestsEmail({ calEvent: calendarEvent, teamMember }))
      );
    }
  }

  emailsToSend.push(
    ...calendarEvent.attendees.map((attendee) => {
      if (newGuests.includes(attendee.email)) {
        return sendEmail(() => new AttendeeScheduledEmail(calendarEvent, attendee));
      } else {
        return sendEmail(() => new AttendeeAddGuestsEmail(calendarEvent, attendee));
      }
    })
  );

  await Promise.all(emailsToSend);
};

export const sendAddGuestsEmailsAndSMS = async (args: {
  calEvent: CalendarEvent;
  newGuests: string[];
  eventTypeMetadata?: EventTypeMetadata;
}) => {
  const { calEvent, newGuests, eventTypeMetadata } = args;
  const calendarEvent = formatCalEvent(calEvent);

  const emailsAndSMSToSend: Promise<unknown>[] = [];

  if (!eventTypeDisableHostEmail(eventTypeMetadata)) {
    emailsAndSMSToSend.push(sendEmail(() => new OrganizerAddGuestsEmail({ calEvent: calendarEvent })));

    if (calendarEvent.team?.members) {
      for (const teamMember of calendarEvent.team.members) {
        emailsAndSMSToSend.push(
          sendEmail(() => new OrganizerAddGuestsEmail({ calEvent: calendarEvent, teamMember }))
        );
      }
    }
  }

  const eventScheduledSMS = new EventSuccessfullyScheduledSMS(calEvent);
  const organizationSettings = await fetchOrganizationEmailSettings(calEvent.organizationId);

  for (const attendee of calendarEvent.attendees) {
    if (newGuests.includes(attendee.email)) {
      // New guests get confirmation emails
      if (
        !shouldSkipAttendeeEmailWithSettings(eventTypeMetadata, organizationSettings, EmailType.CONFIRMATION)
      ) {
        emailsAndSMSToSend.push(sendEmail(() => new AttendeeScheduledEmail(calendarEvent, attendee)));

        if (attendee.phoneNumber) {
          emailsAndSMSToSend.push(eventScheduledSMS.sendSMSToAttendee(attendee));
        }
      }
    } else {
      if (
        !shouldSkipAttendeeEmailWithSettings(eventTypeMetadata, organizationSettings, EmailType.NEW_EVENT)
      ) {
        emailsAndSMSToSend.push(sendEmail(() => new AttendeeAddGuestsEmail(calendarEvent, attendee)));
      }
    }
  }

  await Promise.all(emailsAndSMSToSend);
};
