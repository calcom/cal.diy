import { PaymentServiceMap } from "@calcom/app-store/payment.services.generated";
import { eventTypeMetaDataSchemaWithTypedApps } from "@calcom/app-store/zod-utils";
import dayjs from "@calcom/dayjs";
import { sendNoShowFeeChargedEmail } from "@calcom/emails/billing-email-service";
import { CredentialRepository } from "@calcom/features/credentials/repositories/CredentialRepository";
import {
  type EventTypeBrandingData,
  getEventTypeService,
} from "@calcom/features/eventtypes/di/EventTypeService.container";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import logger from "@calcom/lib/logger";
import { getTranslation } from "@calcom/i18n/server";
import prisma from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { IAbstractPaymentService } from "@calcom/types/PaymentService";

export const handleNoShowFee= async ({
  booking,
  payment,
}: {
  booking: {
    id: number;
    uid: string;
    title: string;
    startTime: Date;
    endTime: Date;
    userPrimaryEmail: string | null;
    eventTypeId: number | null;
    userId: number | null;
    user?: {
      id: number;
      email: string;
      name?: string | null;
      locale: string | null;
      timeZone: string;
      hideBranding: boolean | null;
      profiles: {
        organizationId: number | null;
        organization: { hideBranding: boolean | null } | null;
      }[];
    } | null;
    eventType: {
      title: string;
      hideOrganizerEmail: boolean;
      teamId: number | null;
      metadata?: Prisma.JsonValue;
      team?: {
        id: number;
        hideBranding: boolean | null;
        parent: { hideBranding: boolean | null } | null;
      } | null;
    } | null;
    attendees: {
      name: string;
      email: string;
      timeZone: string;
      locale: string | null;
    }[];
  };
  payment: {
    id: number;
    amount: number;
    currency: string;
    paymentOption: string | null;
    appId: string | null;
  };
}) => {
  const log = logger.getSubLogger({ prefix: [`[handleNoShowFee] bookingUid ${booking.uid}`] });
  const tOrganizer = await getTranslation(booking.user?.locale ?? "en", "common");

  const userId = booking.userId;
  const teamId = booking.eventType?.teamId;
  const appId = payment.appId;

  const eventTypeMetdata = eventTypeMetaDataSchemaWithTypedApps.parse(booking.eventType?.metadata ?? {});

  if (!userId) {
    log.error("User ID is required");
    throw new Error("User ID is required");
  }

  const bookingAttendee = booking.attendees[0];

  const attendee = {
    name: bookingAttendee.name,
    email: bookingAttendee.email,
    timeZone: bookingAttendee.timeZone,
    language: {
      translate: await getTranslation(bookingAttendee.locale ?? "en", "common"),
      locale: bookingAttendee.locale ?? "en",
    },
  };

  const evt: CalendarEvent = {
    type: (booking?.eventType?.title as string) || booking?.title,
    title: booking.title,
    startTime: dayjs(booking.startTime).format(),
    endTime: dayjs(booking.endTime).format(),
    organizer: {
      email: booking?.userPrimaryEmail ?? booking.user?.email ?? "",
      name: booking.user?.name || "Nameless",
      timeZone: booking.user?.timeZone || "",
      language: { translate: tOrganizer, locale: booking.user?.locale ?? "en" },
    },
    attendees: [attendee],
    hideOrganizerEmail: booking.eventType?.hideOrganizerEmail,
    paymentInfo: {
      amount: payment.amount,
      currency: payment.currency,
      paymentOption: payment.paymentOption,
    },
    organizationId: booking.user?.profiles?.[0]?.organizationId ?? null,
    hideBranding: booking.eventTypeId
      ? await getEventTypeService().shouldHideBrandingForEventType(booking.eventTypeId, {
          team: booking.eventType?.team
            ? { hideBranding: booking.eventType.team.hideBranding, parent: booking.eventType.team.parent }
            : null,
          owner: booking.user
            ? {
                id: booking.user.id,
                hideBranding: booking.user.hideBranding,
                profiles: booking.user.profiles ?? [],
              }
            : null,
        } satisfies EventTypeBrandingData)
      : false,
  };

  const paymentCredential = await CredentialRepository.findPaymentCredentialByAppIdAndUserIdOrTeamId({
    appId,
    userId,
    teamId,
  });

  if (!paymentCredential) {
    log.error(`No payment credential found for user ${userId} or team ${teamId}`);
    throw new Error("No payment credential found");
  }

  const key = paymentCredential?.app?.dirName;
  const paymentAppImportFn = PaymentServiceMap[key as keyof typeof PaymentServiceMap];
  if (!paymentAppImportFn) {
    log.error(`Payment app ${key} not implemented`);
    throw new Error("Payment app not implemented");
  }
  const paymentApp = await paymentAppImportFn;
  if (!paymentApp?.BuildPaymentService) {
    log.error(`Payment service not found for app ${key}`);
    throw new Error("Payment service not found");
  }
  const createPaymentService = paymentApp.BuildPaymentService;
  const paymentInstance = createPaymentService(paymentCredential) as IAbstractPaymentService;

  try {
    const paymentData = await paymentInstance.chargeCard(payment, booking.id);

    if (!paymentData) {
      log.error(`Error processing payment with paymentId ${payment.id}`);
      throw new Error("Payment processing failed");
    }

    // The card is already charged here, so a failed email should not report the charge as failed
    try {
      await sendNoShowFeeChargedEmail(attendee, evt, eventTypeMetdata);
    } catch (emailError) {
      log.error(`Failed to send no-show fee charged email for paymentId ${payment.id}`, emailError);
    }

    return paymentData;
  } catch (err) {
    if (err instanceof ErrorWithCode && err.code === ErrorCode.ChargeCardFailure) {
      log.error(err.message);
      throw err;
    }

    const errorMessage = `Error processing paymentId ${payment.id} with error ${err}`;
    log.error(errorMessage);
    throw new Error(tOrganizer(errorMessage));
  }
};
