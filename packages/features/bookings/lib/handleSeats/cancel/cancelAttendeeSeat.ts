import { getCalendar } from "@calcom/app-store/_utils/getCalendar";
import {
  getAllDelegationCredentialsForUserIncludeServiceAccountKey,
  getDelegationCredentialOrFindRegularCredential,
} from "@calcom/app-store/delegationCredential";
import { sendCancelledSeatEmailsAndSMS } from "@calcom/emails/email-manager";
import { updateMeeting } from "@calcom/features/conferencing/lib/videoClient";
import type { WebhookVersion } from "@calcom/features/webhooks/lib/interface/IWebhookRepository";
import sendPayload from "@calcom/features/webhooks/lib/sendOrSchedulePayload";
import type { EventPayloadType, EventTypeInfo } from "@calcom/features/webhooks/lib/sendPayload";
import { getTranslation } from "@calcom/i18n/server";
import { getRichDescription } from "@calcom/lib/CalEventParser";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import prisma from "@calcom/prisma";
import { WebhookTriggerEvents } from "@calcom/prisma/enums";
import type { EventTypeMetadata } from "@calcom/prisma/zod-utils";
import { bookingCancelAttendeeSeatSchema } from "@calcom/prisma/zod-utils";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { PartialReference } from "@calcom/types/EventManager";
import type { BookingToDelete } from "../../handleCancelBooking";
import { getSeatCalendarReferences, OFFICE365_CALENDAR_TYPE } from "../lib/seatCalendarReferences";

/**
 * Booking-level fallback can contain multiple Office365 refs, so compare every provider identity
 * field before deciding which event was already handled.
 */
const getOffice365ReferenceKey = (
  reference: Pick<
    PartialReference,
    "type" | "uid" | "externalCalendarId" | "credentialId" | "delegationCredentialId"
  >
) =>
  JSON.stringify([
    reference.type,
    reference.uid,
    reference.externalCalendarId,
    reference.credentialId,
    reference.delegationCredentialId,
  ]);

/**
 * Seat cancellation must preserve the group booking while isolating provider cleanup to the
 * attendee who is leaving.
 */
async function cancelAttendeeSeat(
  data: {
    seatReferenceUid?: string;
    bookingToDelete: BookingToDelete;
  },
  dataForWebhooks: {
    webhooks: {
      id: string;
      subscriberUrl: string;
      payloadTemplate: string | null;
      appId: string | null;
      secret: string | null;
      version: WebhookVersion;
    }[];
    evt: CalendarEvent;
    eventTypeInfo: EventTypeInfo;
  },
  eventTypeMetadata: EventTypeMetadata
) {
  const input = bookingCancelAttendeeSeatSchema.safeParse({
    seatReferenceUid: data.seatReferenceUid,
  });
  const { webhooks, evt, eventTypeInfo } = dataForWebhooks;
  if (!input.success) return;
  const { seatReferenceUid } = input.data;
  const bookingToDelete = data.bookingToDelete;
  if (!bookingToDelete?.attendees.length || bookingToDelete.attendees.length < 2) return;

  if (!bookingToDelete.userId) {
    throw new HttpError({ statusCode: 400, message: "User not found" });
  }

  const seatReference = bookingToDelete.seatsReferences.find(
    (reference) => reference.referenceUid === seatReferenceUid
  );

  if (!seatReference) throw new HttpError({ statusCode: 400, message: "User not a part of this booking" });

  await Promise.all([
    prisma.bookingSeat.delete({
      where: {
        referenceUid: seatReferenceUid,
      },
    }),
    prisma.attendee.delete({
      where: {
        id: seatReference.attendeeId,
      },
    }),
  ]);

  const attendee = bookingToDelete?.attendees.find((attendee) => attendee.id === seatReference.attendeeId);
  const bookingToDeleteUser = bookingToDelete.user ?? null;
  const delegationCredentials = bookingToDeleteUser
    ? await getAllDelegationCredentialsForUserIncludeServiceAccountKey({
        user: { email: bookingToDeleteUser.email, id: bookingToDeleteUser.id },
      })
    : [];

  if (attendee) {
    const integrationsToUpdate: Promise<unknown>[] = [];
    const seatOffice365CalendarReferences = getSeatCalendarReferences(
      seatReference.metadata,
      OFFICE365_CALENDAR_TYPE
    );
    // Pre-fix seated bookings stored Office365 refs on the booking, so keep that fallback for cleanup.
    const bookingLevelOffice365References = bookingToDelete.references.filter(
      (reference) => reference.type === OFFICE365_CALENDAR_TYPE
    );
    const office365ReferencesToProcess = seatOffice365CalendarReferences.length
      ? seatOffice365CalendarReferences
      : bookingLevelOffice365References;
    const processedOffice365ReferenceKeys = new Set(
      office365ReferencesToProcess.map(getOffice365ReferenceKey)
    );

    for (const reference of office365ReferencesToProcess) {
      if (reference.credentialId || reference.delegationCredentialId) {
        const credential = await getDelegationCredentialOrFindRegularCredential({
          id: {
            credentialId: reference.credentialId,
            delegationCredentialId: reference.delegationCredentialId,
          },
          delegationCredentials,
        });

        if (credential) {
          const calendar = await getCalendar(credential, "booking");
          if (calendar) {
            integrationsToUpdate.push(calendar.deleteEvent(reference.uid, evt, reference.externalCalendarId));
          }
        }
      }
    }

    const sharedReferencesToUpdate = bookingToDelete.references.filter((reference) => {
      if (reference.type !== OFFICE365_CALENDAR_TYPE) {
        return true;
      }

      // Per-seat Office365 events are deleted directly; shared updates would notify attendees who are staying.
      if (seatOffice365CalendarReferences.length > 0) {
        return false;
      }

      return !processedOffice365ReferenceKeys.has(getOffice365ReferenceKey(reference));
    });

    for (const reference of sharedReferencesToUpdate) {
      if (reference.credentialId || reference.delegationCredentialId) {
        const credential = await getDelegationCredentialOrFindRegularCredential({
          id: {
            credentialId: reference.credentialId,
            delegationCredentialId: reference.delegationCredentialId,
          },
          delegationCredentials,
        });

        if (credential) {
          const videoCallReference = bookingToDelete.references.find((reference) =>
            reference.type.includes("_video")
          );

          if (videoCallReference) {
            evt.videoCallData = {
              type: videoCallReference.type,
              id: videoCallReference.meetingId,
              password: videoCallReference?.meetingPassword,
              url: videoCallReference.meetingUrl,
            };
          }

          // Shared non-Office365 integrations still update the attendee list, so keep the leaving seat out.
          const attendees = evt.attendees.filter((evtAttendee) => attendee.email !== evtAttendee.email);
          const updatedEvt = {
            ...evt,
            attendees,
            calendarDescription: getRichDescription({ ...evt, attendees }),
            onlyUpdateCalendarAttendees: true,
          };

          if (reference.type.includes("_video") && reference.type !== "google_meet_video") {
            integrationsToUpdate.push(updateMeeting(credential, updatedEvt, reference));
          }
          if (reference.type.includes("_calendar")) {
            const calendar = await getCalendar(credential, "booking");
            if (calendar) {
              integrationsToUpdate.push(
                calendar?.updateEvent(reference.uid, updatedEvt, reference.externalCalendarId)
              );
            }
          }
        }
      }
    }

    try {
      await Promise.all(integrationsToUpdate);
    } catch {
      // Shouldn't stop code execution if integrations fail
      // as integrations was already updated
    }

    const tAttendees = await getTranslation(attendee.locale ?? "en", "common");

    const emailEvt = {
      ...evt,
      attendees: [
        {
          name: attendee.name,
          email: attendee.email,
          timeZone: attendee.timeZone,
          phoneNumber: attendee.phoneNumber,
          language: { translate: tAttendees, locale: attendee.locale ?? "en" },
        },
      ],
    };

    await sendCancelledSeatEmailsAndSMS(
      emailEvt,
      {
        ...attendee,
        language: { translate: tAttendees, locale: attendee.locale ?? "en" },
      },
      eventTypeMetadata
    );
  }

  evt.attendees = attendee
    ? [
        {
          name: attendee.name,
          email: attendee.email,
          timeZone: attendee.timeZone,
          phoneNumber: attendee.phoneNumber,
          language: {
            translate: await getTranslation(attendee.locale ?? "en", "common"),
            locale: attendee.locale ?? "en",
          },
        },
      ]
    : [];

  const payload: EventPayloadType = {
    ...evt,
    ...eventTypeInfo,
    status: "CANCELLED",
    smsReminderNumber: bookingToDelete.smsReminderNumber || undefined,
    requestReschedule: false,
  };

  const promises = webhooks.map((webhook) =>
    sendPayload(
      webhook.secret,
      WebhookTriggerEvents.BOOKING_CANCELLED,
      new Date().toISOString(),
      webhook,
      payload
    ).catch((e) => {
      logger.error(
        `Error executing webhook for event: ${WebhookTriggerEvents.BOOKING_CANCELLED}, URL: ${webhook.subscriberUrl}, bookingId: ${evt.bookingId}, bookingUid: ${evt.uid}`,
        safeStringify(e)
      );
    })
  );
  await Promise.all(promises);

  return { success: true };
}

export default cancelAttendeeSeat;
