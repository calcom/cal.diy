import { eventTypeAppMetadataOptionalSchema } from "@calcom/app-store/zod-utils";
import { sendScheduledSeatsEmailsAndSMS } from "@calcom/emails/email-manager";
import EventManager from "@calcom/features/bookings/lib/EventManager";
import { refreshCredentials } from "@calcom/features/bookings/lib/getAllCredentialsForUsersOnEvent/refreshCredentials";
import { handlePayment } from "@calcom/features/bookings/lib/handlePayment";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { HttpError } from "@calcom/lib/http-error";
import prisma from "@calcom/prisma";
import type { Prisma, PrismaClient } from "@calcom/prisma/client";
import { BookingStatus } from "@calcom/prisma/enums";
import { cloneDeep } from "lodash";
import { uuid } from "short-uuid";
import { findBookingQuery } from "../../handleNewBooking/findBookingQuery";
import type { IEventTypePaymentCredentialType } from "../../handleNewBooking/types";
import type { HandleSeatsResultBooking, NewSeatedBookingObject, SeatedBooking } from "../types";

export type AddSeatInput = {
  bookingUid: string;
  bookingId: number;
  bookingStatus: BookingStatus;
  seatsPerTimeSlot: number;
  attendee: {
    email: string;
    phoneNumber?: string;
    name: string;
    timeZone: string;
    locale: string;
  };
  seatData: {
    description?: string;
    responses?: Prisma.InputJsonValue | null;
  };
  metadata?: Record<string, string>;
};

/**
 * Atomically adds a seat to a booking with race condition protection.
 * Uses a transaction with a fresh read to prevent TOCTOU race conditions
 * where concurrent requests could exceed the seat limit.
 */
export async function addSeatToBooking(input: AddSeatInput, prismaClient: PrismaClient = prisma) {
  const referenceUid = uuid();

  return prismaClient.$transaction(async (tx) => {
    // Lock the booking row with FOR UPDATE to prevent concurrent modifications
    // This ensures only one transaction can read and modify seat count at a time
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE uid = ${input.bookingUid} FOR UPDATE`;

    // Fresh read inside transaction to get the current seat count
    const freshBooking = await tx.booking.findUnique({
      where: { uid: input.bookingUid },
      select: {
        attendees: {
          select: {
            bookingSeat: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!freshBooking) {
      throw new HttpError({ statusCode: 404, message: "Booking not found" });
    }

    // Check seat availability with fresh data
    // Only enforce the limit when seatsPerTimeSlot > 0 (matching original behavior
    // where falsy seatsPerTimeSlot would skip this check entirely)
    const currentSeatCount = freshBooking.attendees.filter((attendee) => !!attendee.bookingSeat).length;
    if (input.seatsPerTimeSlot > 0 && input.seatsPerTimeSlot <= currentSeatCount) {
      throw new HttpError({
        statusCode: 409,
        message: ErrorCode.BookingSeatsFull,
      });
    }

    // Create the attendee and seat atomically within the transaction
    await tx.booking.update({
      where: { uid: input.bookingUid },
      data: {
        attendees: {
          create: {
            email: input.attendee.email,
            phoneNumber: input.attendee.phoneNumber,
            name: input.attendee.name,
            timeZone: input.attendee.timeZone,
            locale: input.attendee.locale,
            bookingSeat: {
              create: {
                referenceUid,
                data: {
                  description: input.seatData.description,
                  responses: input.seatData.responses,
                },
                metadata: input.metadata,
                booking: {
                  connect: { id: input.bookingId },
                },
              },
            },
          },
        },
        ...(input.bookingStatus === BookingStatus.CANCELLED && {
          status: BookingStatus.ACCEPTED,
        }),
      },
    });

    return await tx.bookingSeat.findUnique({
      where: { referenceUid },
    });
  });
}

const createNewSeat = async (
  rescheduleSeatedBookingObject: NewSeatedBookingObject,
  seatedBooking: SeatedBooking,
  metadata?: Record<string, string>
) => {
  const {
    tAttendees,
    attendeeLanguage,
    invitee,
    eventType,
    additionalNotes,
    noEmail,
    paymentAppData,
    allCredentials,
    organizerUser,
    fullName,
    bookerEmail,
    responses,
    bookerPhoneNumber,
  } = rescheduleSeatedBookingObject;
  let { evt } = rescheduleSeatedBookingObject;
  let resultBooking: HandleSeatsResultBooking;
  // Need to add translation for attendees to pass type checks. Since these values are never written to the db we can just use the new attendee language
  const bookingAttendees = seatedBooking.attendees.map((attendee) => {
    return {
      ...attendee,
      language: { translate: tAttendees, locale: attendeeLanguage ?? "en" },
    };
  });

  const videoCallReference = seatedBooking.references.find((reference) => reference.type.includes("_video"));

  if (videoCallReference) {
    evt.videoCallData = {
      type: videoCallReference.type,
      id: videoCallReference.meetingId,
      password: videoCallReference?.meetingPassword,
      url: videoCallReference.meetingUrl,
    };
  }

  const inviteeToAdd = invitee[0];

  // Use addSeatToBooking which handles the race condition protection via transaction
  const newBookingSeat = await addSeatToBooking({
    bookingUid: seatedBooking.uid,
    bookingId: seatedBooking.id,
    bookingStatus: seatedBooking.status,
    seatsPerTimeSlot: eventType.seatsPerTimeSlot ?? 0,
    attendee: {
      email: inviteeToAdd.email,
      phoneNumber: inviteeToAdd.phoneNumber,
      name: inviteeToAdd.name,
      timeZone: inviteeToAdd.timeZone,
      locale: inviteeToAdd.language.locale,
    },
    seatData: {
      description: additionalNotes,
      responses,
    },
    metadata,
  });

  const attendeeUniqueId = newBookingSeat?.referenceUid ?? "";
  const attendeeWithSeat = {
    ...inviteeToAdd,
    bookingSeat: newBookingSeat ?? null,
  };

  evt = { ...evt, attendees: [...bookingAttendees, attendeeWithSeat] };
  evt.attendeeSeatId = attendeeUniqueId;
  const newSeat = seatedBooking.attendees.length !== 0;

  /**
   * Remember objects are passed into functions as references
   * so if you modify it in a inner function it will be modified in the outer function
   * deep cloning evt to avoid this
   */
  if (!evt?.uid) {
    evt.uid = seatedBooking?.uid ?? null;
  }
  const copyEvent = cloneDeep(evt);
  copyEvent.uid = seatedBooking.uid;
  if (noEmail !== true) {
    let isHostConfirmationEmailsDisabled = false;
    let isAttendeeConfirmationEmailDisabled = false;

    isHostConfirmationEmailsDisabled = eventType.metadata?.disableStandardEmails?.confirmation?.host || false;
    isAttendeeConfirmationEmailDisabled =
      eventType.metadata?.disableStandardEmails?.confirmation?.attendee || false;
    await sendScheduledSeatsEmailsAndSMS(
      copyEvent,
      inviteeToAdd,
      newSeat,
      !!eventType.seatsShowAttendees,
      isHostConfirmationEmailsDisabled,
      isAttendeeConfirmationEmailDisabled,
      eventType.metadata
    );
  }
  const credentials = await refreshCredentials(allCredentials);
  const apps = eventTypeAppMetadataOptionalSchema.parse(eventType?.metadata?.apps);
  const eventManager = new EventManager({ ...organizerUser, credentials }, apps);
  await eventManager.updateCalendarAttendees(evt, seatedBooking);

  const foundBooking = await findBookingQuery(seatedBooking.id);

  if (!Number.isNaN(paymentAppData.price) && paymentAppData.price > 0 && !!seatedBooking) {
    const credentialPaymentAppCategories = await prisma.credential.findMany({
      where: {
        ...(paymentAppData.credentialId ? { id: paymentAppData.credentialId } : { userId: organizerUser.id }),
        app: {
          categories: {
            hasSome: ["payment"],
          },
        },
      },
      select: {
        key: true,
        appId: true,
        app: {
          select: {
            categories: true,
            dirName: true,
          },
        },
      },
    });

    const eventTypePaymentAppCredential = credentialPaymentAppCategories.find((credential) => {
      return credential.appId === paymentAppData.appId;
    });

    if (!eventTypePaymentAppCredential) {
      throw new HttpError({
        statusCode: 400,
        message: ErrorCode.MissingPaymentCredential,
      });
    }
    if (!eventTypePaymentAppCredential?.appId) {
      throw new HttpError({
        statusCode: 400,
        message: ErrorCode.MissingPaymentAppId,
      });
    }

    const payment = await handlePayment({
      evt,
      selectedEventType: {
        ...eventType,
        metadata: eventType.metadata
          ? {
              ...eventType.metadata,
              apps: eventType.metadata?.apps as Prisma.JsonValue,
            }
          : {},
      },
      paymentAppCredentials: eventTypePaymentAppCredential as IEventTypePaymentCredentialType,
      booking: seatedBooking,
      bookerName: fullName,
      bookerEmail,
      bookerPhoneNumber,
      bookingFields: eventType.bookingFields,
      locale: attendeeLanguage ?? "en",
    });

    resultBooking = { ...foundBooking };
    resultBooking.message = "Payment required";
    resultBooking.paymentUid = payment?.uid;
    resultBooking.id = payment?.id;

    // Persist the payment reference on the seat so the booking confirmation page can resolve
    // this seat's own payment. All seats of a slot share one parent booking, so without this
    // link the confirmation page would fall back to the booking's first payment for every seat.
    if (payment?.uid && newBookingSeat?.referenceUid) {
      const existingSeatMetadata =
        newBookingSeat.metadata &&
        typeof newBookingSeat.metadata === "object" &&
        !Array.isArray(newBookingSeat.metadata)
          ? newBookingSeat.metadata
          : {};
      await prisma.bookingSeat.update({
        where: { referenceUid: newBookingSeat.referenceUid },
        data: {
          metadata: {
            ...existingSeatMetadata,
            paymentUid: payment.uid,
          },
        },
      });
    }
  } else {
    resultBooking = { ...foundBooking };
  }

  resultBooking.seatReferenceUid = evt.attendeeSeatId;

  return resultBooking;
};

export default createNewSeat;
