import Stripe from "stripe";
import { v4 as uuidv4 } from "uuid";
import z from "zod";

import dayjs from "@calcom/dayjs";
import { BookingRepository } from "@calcom/features/bookings/repositories/BookingRepository";
import tasker from "@calcom/features/tasker";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import { getServerErrorFromUnknown } from "@calcom/lib/server/getServerErrorFromUnknown";
import prisma from "@calcom/prisma";
import type { Booking, Payment, PaymentOption, Prisma } from "@calcom/prisma/client";
import type { EventTypeMetadata } from "@calcom/prisma/zod-utils";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { IAbstractPaymentService } from "@calcom/types/PaymentService";

import { paymentOptionEnum } from "../zod";
import { retrieveOrCreateStripeCustomerByEmail } from "./customer";
import type { StripePaymentData, StripeSetupIntentData } from "./server";

const log = logger.getSubLogger({ prefix: ["payment-service:stripe"] });

export const stripeCredentialKeysSchema = z.object({
  stripe_user_id: z.string(),
  default_currency: z.string(),
  stripe_publishable_key: z.string(),
});

class StripePaymentService implements IAbstractPaymentService {
  private stripe: Stripe;
  private credentials: z.infer<typeof stripeCredentialKeysSchema> | null;

  constructor(credentials: { key: Prisma.JsonValue }) {
    const keyParsing = stripeCredentialKeysSchema.safeParse(credentials.key);
    if (keyParsing.success) {
      this.credentials = keyParsing.data;
    } else {
      this.credentials = null;
    }
    this.stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY || "", {
      apiVersion: "2020-08-27",
    });
  }

  private async getPayment(where: Prisma.PaymentWhereInput) {
    const payment = await prisma.payment.findFirst({ where });
    // if payment isn't found, return null.
    if (!payment) {
      return null;
    }
    // if it is found, but there's no externalId - it indicates invalid state and an error should be thrown.
    if (!payment.externalId) {
      throw new Error("Payment externalId not found");
    }
    return { ...payment, externalId: payment.externalId };
  }

  /* This method is for creating charges at the time of booking */
  async create(
    payment: Pick<Prisma.PaymentUncheckedCreateInput, "amount" | "currency">,
    bookingId: Booking["id"],
    userId: Booking["userId"],
    username: string | null,
    bookerName: string,
    paymentOption: PaymentOption,
    bookerEmail: string,
    bookerPhoneNumber?: string | null,
    eventTitle?: string,
    bookingTitle?: string
  ) {
    try {
      // Ensure that the payment service can support the passed payment option
      if (paymentOptionEnum.parse(paymentOption) !== "ON_BOOKING") {
        throw new Error("Payment option is not compatible with create method");
      }

      if (!this.credentials) {
        throw new Error("Stripe credentials not found");
      }

      const customer = await retrieveOrCreateStripeCustomerByEmail(
        this.credentials.stripe_user_id,
        bookerEmail,
        bookerPhoneNumber
      );

      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { startTime: true },
      });
      const bookingDate = booking?.startTime ? booking.startTime.toISOString() : "";

      const params: Stripe.PaymentIntentCreateParams = {
        amount: payment.amount,
        currency: payment.currency,
        customer: customer.id,
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: this.generateMetadata({
          bookingId,
          userId,
          username,
          bookerName,
          bookerEmail: bookerEmail,
          bookerPhoneNumber: bookerPhoneNumber ?? null,
          eventTitle: eventTitle || "",
          bookingTitle: bookingTitle || "",
          bookingDate,
        }),
      };

      const paymentIntent = await this.stripe.paymentIntents.create(params, {
        stripeAccount: this.credentials.stripe_user_id,
      });

      const paymentData = await prisma.payment.create({
        data: {
          uid: uuidv4(),
          app: {
            connect: {
              slug: "stripe",
            },
          },
          booking: {
            connect: {
              id: bookingId,
            },
          },
          amount: payment.amount,
          currency: payment.currency,
          externalId: paymentIntent.id,
          data: Object.assign({}, paymentIntent, {
            stripe_publishable_key: this.credentials.stripe_publishable_key,
            stripeAccount: this.credentials.stripe_user_id,
          }) as unknown as Prisma.InputJsonValue,
          fee: 0,
          refunded: false,
          success: false,
          paymentOption: paymentOption || "ON_BOOKING",
        },
      });
      if (!paymentData) {
        throw new Error();
      }
      return paymentData;
    } catch (error) {
      log.error("Stripe: Payment could not be created", bookingId, safeStringify(error));
      throw new Error("payment_not_created_error");
    }
  }

  async collectCard(
    payment: Pick<Prisma.PaymentUncheckedCreateInput, "amount" | "currency">,
    bookingId: Booking["id"],
    paymentOption: PaymentOption,
    bookerEmail: string,
    bookerPhoneNumber?: string | null
  ): Promise<Payment> {
    try {
      if (!this.credentials) {
        throw new Error("Stripe credentials not found");
      }

      // Ensure that the payment service can support the passed payment option
      if (paymentOptionEnum.parse(paymentOption) !== "HOLD") {
        throw new Error("Payment option is not compatible with create method");
      }

      const customer = await retrieveOrCreateStripeCustomerByEmail(
        this.credentials.stripe_user_id,
        bookerEmail,
        bookerPhoneNumber
      );

      const params = {
        customer: customer.id,
        payment_method_types: ["card"],
        metadata: {
          bookingId,
          bookerPhoneNumber: bookerPhoneNumber ?? null,
        },
      };

      const setupIntent = await this.stripe.setupIntents.create(params, {
        stripeAccount: this.credentials.stripe_user_id,
      });

      const paymentData = await prisma.payment.create({
        data: {
          uid: uuidv4(),
          app: {
            connect: {
              slug: "stripe",
            },
          },
          booking: {
            connect: {
              id: bookingId,
            },
          },
          amount: payment.amount,
          currency: payment.currency,
          externalId: setupIntent.id,
          data: Object.assign(
            {},
            {
              setupIntent,
              stripe_publishable_key: this.credentials.stripe_publishable_key,
              stripeAccount: this.credentials.stripe_user_id,
            }
          ) as unknown as Prisma.InputJsonValue,
          fee: 0,
          refunded: false,
          success: false,
          paymentOption: paymentOption || "ON_BOOKING",
        },
      });

      return paymentData;
    } catch (error) {
      log.error(
        "Stripe: Payment method could not be collected for bookingId",
        bookingId,
        safeStringify(error)
      );

      throw new ErrorWithCode(ErrorCode.CollectCardFailure, "Stripe: Payment method could not be collected");
    }
  }

  async chargeCard(payment: Payment, bookingId: Booking["id"]): Promise<Payment> {
    try {
      if (!this.credentials) {
        throw new Error("Stripe credentials not found");
      }

      const bookingRepository = new BookingRepository(prisma);
      const booking = await bookingRepository.findByIdIncludeUserAndAttendees(bookingId);

      if (!booking) {
        throw new Error(`Booking ${bookingId} not found`);
      }

      const paymentObject = payment.data as unknown as StripeSetupIntentData;

      const setupIntent = paymentObject.setupIntent;

      // Ensure that the stripe customer & payment method still exists
      const customer = await this.stripe.customers.retrieve(setupIntent.customer as string, {
        stripeAccount: this.credentials.stripe_user_id,
      });
      const paymentMethod = await this.stripe.paymentMethods.retrieve(setupIntent.payment_method as string, {
        stripeAccount: this.credentials.stripe_user_id,
      });

      if (!customer) {
        throw new Error(`Stripe customer does not exist for setupIntent ${setupIntent.id}`);
      }

      if (!paymentMethod) {
        throw new Error(`Stripe paymentMethod does not exist for setupIntent ${setupIntent.id}`);
      }

      if (!booking.attendees[0]) {
        throw new Error(`Booking attendees are empty for setupIntent ${setupIntent.id}`);
      }

      const params: Stripe.PaymentIntentCreateParams = {
        amount: payment.amount,
        currency: payment.currency,
        customer: setupIntent.customer as string,
        payment_method: setupIntent.payment_method as string,
        off_session: true,
        confirm: true,
        metadata: this.generateMetadata({
          bookingId,
          userId: booking.user?.id,
          username: booking.user?.username,
          bookerName: booking.attendees[0].name,
          bookerEmail: booking.attendees[0].email,
          bookerPhoneNumber: booking.attendees[0].phoneNumber ?? null,
          eventTitle: booking.eventType?.title || null,
          bookingTitle: booking.title,
          bookingDate: booking.startTime.toISOString(),
        }),
      };

      const paymentIntent = await this.stripe.paymentIntents.create(params, {
        stripeAccount: this.credentials.stripe_user_id,
      });

      const paymentData = await prisma.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          success: true,
          data: {
            ...paymentObject,
            paymentIntent,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      if (!paymentData) {
        throw new Error();
      }

      return paymentData;
    } catch (error) {
      log.error("Stripe: Could not charge card for payment", bookingId, safeStringify(error));

      const errorMappings = {
        "your card was declined": "your_card_was_declined",
        "your card does not support this type of purchase":
          "your_card_does_not_support_this_type_of_purchase",
        "amount must convert to at least": "amount_must_convert_to_at_least",
      };

      let userMessage = "could_not_charge_card";

      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();

        for (const [key, message] of Object.entries(errorMappings)) {
          if (errorMessage.includes(key)) {
            userMessage = message;
            break;
          }
        }
      }

      throw new ErrorWithCode(ErrorCode.ChargeCardFailure, userMessage);
    }
  }

  async update(): Promise<Payment> {
    throw new Error("Method not implemented.");
  }

  async refund(paymentId: Payment["id"]): Promise<Payment | null> {
    const payment = await this.getPayment({
      id: paymentId,
    });
    if (!payment) {
      return null;
    }
    if (!payment.success) {
      throw new Error("Unable to refund failed payment");
    }
    if (payment.refunded) {
      // refunded already, bail early as success without throwing an error.
      return payment;
    }
    try {
      const refund = await this.stripe.refunds.create(
        {
          payment_intent: payment.externalId,
        },
        { stripeAccount: (payment.data as unknown as StripePaymentData)["stripeAccount"] }
      );

      if (!refund || refund.status === "failed") {
        throw new Error("Refund failed");
      }

      const updatedPayment = await prisma.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          refunded: true,
        },
      });
      return updatedPayment;
    } catch (e) {
      const err = getServerErrorFromUnknown(e);
      throw err;
    }
  }

  async afterPayment(
    event: CalendarEvent,
    booking: {
      user: { email: string | null; name: string | null; timeZone: string } | null;
      id: number;
      startTime: { toISOString: () => string };
      uid: string;
    },
    paymentData: Payment,
    _eventTypeMetadata?: EventTypeMetadata
  ): Promise<void> {
    const delayMinutes = Number(process.env.AWAITING_PAYMENT_EMAIL_DELAY_MINUTES) || 15;
    const scheduledEmailAt = dayjs().add(delayMinutes, "minutes").toDate();

    // we give the user 15 minutes to complete the payment
    // if the payment is still not processed after 15 minutes, we send an awaiting payment email
    await tasker.create(
      "sendAwaitingPaymentEmail",
      {
        bookingId: booking.id,
        paymentId: paymentData.id,
        attendeeSeatId: event.attendeeSeatId || null,
      },
      {
        scheduledAt: scheduledEmailAt,
        referenceUid: booking.uid,
      }
    );
  }

  async deletePayment(paymentId: Payment["id"]): Promise<boolean> {
    try {
      const payment = await this.getPayment({
        id: paymentId,
      });
      // no payment found, return false.
      if (!payment) {
        return false;
      }

      const stripeAccount = (payment.data as unknown as StripePaymentData).stripeAccount;
      if (!stripeAccount) {
        throw new Error("Stripe account not found");
      }
      // Expire all current sessions
      const sessions = await this.stripe.checkout.sessions.list(
        {
          payment_intent: payment.externalId,
        },
        { stripeAccount }
      );
      for (const session of sessions.data) {
        await this.stripe.checkout.sessions.expire(session.id, { stripeAccount });
      }
      // Then cancel the payment intent
      await this.stripe.paymentIntents.cancel(payment.externalId, { stripeAccount });
      return true;
    } catch (e) {
      log.error("Stripe: Unable to delete Payment in stripe of paymentId", paymentId, safeStringify(e));
      return false;
    }
  }

  getPaymentPaidStatus(): Promise<string> {
    throw new Error("Method not implemented.");
  }

  getPaymentDetails(): Promise<Payment> {
    throw new Error("Method not implemented.");
  }

  isSetupAlready(): boolean {
    return !!this.credentials;
  }

  private generateMetadata({
    bookingId,
    userId,
    username,
    bookerName,
    bookerEmail,
    bookerPhoneNumber,
    eventTitle,
    bookingTitle,
    bookingDate,
  }: {
    bookingId: number;
    userId: number | null | undefined;
    username: string | null | undefined;
    bookerName: string;
    bookerEmail: string;
    bookerPhoneNumber: string | null;
    eventTitle: string | null;
    bookingTitle: string;
    bookingDate: string;
  }) {
    return {
      identifier: "cal.com",
      bookingId,
      calAccountId: userId ?? null,
      calUsername: username ?? null,
      bookerName,
      bookerEmail: bookerEmail,
      bookerPhoneNumber: bookerPhoneNumber ?? null,
      eventTitle: eventTitle || "",
      bookingTitle: bookingTitle || "",
      bookingDate,
    };
  }
}

/**
 * Factory function that creates a Stripe Payment service instance.
 * This is exported instead of the class to prevent SDK types (Stripe)
 * from leaking into the emitted .d.ts file.
 */
export function BuildPaymentService(credentials: { key: Prisma.JsonValue }): IAbstractPaymentService {
  return new StripePaymentService(credentials);
}
