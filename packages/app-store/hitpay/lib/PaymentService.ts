import axios from "axios";
import qs from "qs";
import { v4 as uuidv4 } from "uuid";
import type z from "zod";

import { WEBAPP_URL } from "@calcom/lib/constants";
import {
  convertFromSmallestToPresentableCurrencyUnit,
  convertToSmallestCurrencyUnit,
} from "@calcom/lib/currencyConversions";
import { ErrorCode } from "@calcom/lib/errorCodes";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import prisma from "@calcom/prisma";
import type { Booking, Payment, PaymentOption, Prisma } from "@calcom/prisma/client";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { IAbstractPaymentService } from "@calcom/types/PaymentService";

import appConfig from "../config.json";
import { API_HITPAY, SANDBOX_API_HITPAY } from "./constants";
import { hitpayCredentialKeysSchema } from "./hitpayCredentialKeysSchema";
import type { PaidBooking } from "./types";

const log = logger.getSubLogger({ prefix: ["payment-service:hitpay"] });

class HitPayPaymentService implements IAbstractPaymentService {
  private credentials: z.infer<typeof hitpayCredentialKeysSchema> | null;

  constructor(credentials: { key: Prisma.JsonValue }) {
    const keyParsing = hitpayCredentialKeysSchema.safeParse(credentials.key);
    if (keyParsing.success) {
      this.credentials = keyParsing.data;
    } else {
      this.credentials = null;
    }
  }

  async create(
    payment: Pick<Prisma.PaymentUncheckedCreateInput, "amount" | "currency">,
    bookingId: Booking["id"],
    userId: Booking["userId"],
    username: string | null,
    bookerName: string,
    paymentOption: PaymentOption,
    bookerEmail: string
  ) {
    try {
      const booking: PaidBooking | null = await prisma.booking.findUnique({
        where: {
          id: bookingId,
        },
        select: {
          uid: true,
          title: true,
          startTime: true,
          endTime: true,
          eventTypeId: true,
          eventType: {
            select: {
              slug: true,
              seatsPerTimeSlot: true,
            },
          },
          attendees: { include: { bookingSeat: true } },
        },
      });

      if (!booking || !this.credentials) {
        throw new Error("Booking or API key not found");
      }

      const { startTime, endTime, eventTypeId } = booking;
      const bookingsWithSameTimeSlot = await prisma.booking.findMany({
        where: {
          eventTypeId,
          startTime,
          endTime,
          OR: [{ status: "PENDING" }, { status: "AWAITING_HOST" }],
        },
        select: {
          uid: true,
          title: true,
        },
      });

      if (booking.eventType?.seatsPerTimeSlot) {
        if (
          booking.eventType.seatsPerTimeSlot <=
            booking.attendees.filter((attendee) => !!attendee.bookingSeat).length ||
          bookingsWithSameTimeSlot.length > booking.eventType.seatsPerTimeSlot
        ) {
          throw new Error(ErrorCode.BookingSeatsFull);
        }
      } else {
        if (bookingsWithSameTimeSlot.length > 1) {
          throw new Error(ErrorCode.NoAvailableUsersFound);
        }
      }

      const { isSandbox } = this.credentials;
      const keyObj = isSandbox ? this.credentials.sandbox : this.credentials.prod;
      if (!keyObj || !keyObj?.apiKey) {
        throw new Error("API key not found");
      }

      const hitpayAPIurl = isSandbox ? SANDBOX_API_HITPAY : API_HITPAY;

      const requestUrl = `${hitpayAPIurl}/v1/payment-requests`;
      const redirectUri = `${WEBAPP_URL}/api/integrations/${appConfig.slug}/callback`;
      const webhookUri = `${WEBAPP_URL}/api/integrations/${appConfig.slug}/webhook`;

      const formData = {
        amount: convertFromSmallestToPresentableCurrencyUnit(payment.amount, payment.currency),
        currency: payment.currency,
        email: bookerEmail,
        name: bookerName,
        reference_number: bookingId.toString(),
        redirect_url: redirectUri,
        webhook: webhookUri,
        channel: "api_cal",
        purpose: booking.title,
      };

      const response = await axios.post(requestUrl, qs.stringify(formData), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
          "X-BUSINESS-API-KEY": keyObj.apiKey,
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      const data = response.data;

      const getRequestUrl = `${hitpayAPIurl}/v1/payment-requests?request_id=${data.id}&is_default=1`;
      const getResponse = await axios.get(getRequestUrl, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
          "X-BUSINESS-API-KEY": keyObj.apiKey,
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      const getData = getResponse.data;
      const defaultLink = getData.data[0].url;

      const uid = uuidv4();

      const paymentData = await prisma.payment.create({
        data: {
          uid,
          app: {
            connect: {
              slug: "hitpay",
            },
          },
          booking: {
            connect: {
              id: bookingId,
            },
          },
          amount: convertToSmallestCurrencyUnit(parseFloat(data.amount.replace(/,/g, "")), data.currency),
          externalId: data.id,
          currency: data.currency,
          data: Object.assign(
            {},
            { defaultLink, ...data },
            { bookingUserName: username, eventTypeSlug: booking.eventType?.slug, bookingUid: booking.uid },
            { isPaid: false }
          ) as unknown as Prisma.InputJsonValue,
          fee: 0,
          refunded: false,
          success: false,
        },
      });

      if (!paymentData) {
        throw new Error("Failed to store Payment data");
      }
      return paymentData;
    } catch (error: any) {
      log.error("Payment could not be created", bookingId, safeStringify(error));
      try {
        await prisma.booking.update({
          where: {
            id: bookingId,
          },
          data: {
            status: "CANCELLED",
          },
        });
      } catch (error) {
        throw new Error(ErrorCode.PaymentCreationFailure);
      }

      if (error.message === ErrorCode.BookingSeatsFull || error.message === ErrorCode.NoAvailableUsersFound) {
        throw error;
      }
      throw new Error(ErrorCode.PaymentCreationFailure);
    }
  }
  async update(): Promise<Payment> {
    throw new Error("Method not implemented.");
  }
  async refund(): Promise<Payment> {
    throw new Error("Method not implemented.");
  }

  async collectCard(
    _payment: Pick<Prisma.PaymentUncheckedCreateInput, "amount" | "currency">,
    _bookingId: number,
    _bookerEmail: string,
    _paymentOption: PaymentOption
  ): Promise<Payment> {
    throw new Error("Method not implemented");
  }
  chargeCard(
    _payment: Pick<Prisma.PaymentUncheckedCreateInput, "amount" | "currency">,
    _bookingId: number
  ): Promise<Payment> {
    throw new Error("Method not implemented.");
  }
  getPaymentPaidStatus(): Promise<string> {
    throw new Error("Method not implemented.");
  }
  getPaymentDetails(): Promise<Payment> {
    throw new Error("Method not implemented.");
  }
  afterPayment(
    _event: CalendarEvent,
    _booking: {
      user: { email: string | null; name: string | null; timeZone: string } | null;
      id: number;
      startTime: { toISOString: () => string };
      uid: string;
    },
    _paymentData: Payment
  ): Promise<void> {
    return Promise.resolve();
  }
  deletePayment(_paymentId: number): Promise<boolean> {
    return Promise.resolve(false);
  }

  isSetupAlready(): boolean {
    return !!this.credentials;
  }
}

/**
 * Factory function that creates a HitPay Payment service instance.
 * This is exported instead of the class to prevent internal types
 * from leaking into the emitted .d.ts file.
 */
export function BuildPaymentService(credentials: { key: Prisma.JsonValue }): IAbstractPaymentService {
  return new HitPayPaymentService(credentials);
}
