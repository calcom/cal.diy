import type { NextApiRequest, NextApiResponse } from "next";
import type z from "zod";

import { handlePaymentSuccess } from "@calcom/app-store/_utils/payments/handlePaymentSuccess";
import { distributedTracing } from "@calcom/lib/tracing/factory";
import { IS_PRODUCTION } from "@calcom/lib/constants";
import { HttpError as HttpCode } from "@calcom/lib/http-error";
import { getServerErrorFromUnknown } from "@calcom/lib/server/getServerErrorFromUnknown";
import prisma from "@calcom/prisma";

import appConfig from "../config.json";
import type { hitpayCredentialKeysSchema } from "../lib/hitpayCredentialKeysSchema";
import { isValidWebhookSignature } from "../lib/verifyWebhookSignature";

export const config = {
  api: {
    bodyParser: false,
  },
};

interface WebhookReturn {
  payment_id: string;
  payment_request_id: string;
  phone: string;
  amount: string;
  currency: string;
  status: string;
  reference_number: string;
  hmac: string;
}

type ExcludedWebhookReturn = Omit<WebhookReturn, "hmac">;

/**
 * Handles incoming HitPay payment webhooks with constant-time HMAC signature verification.
 *
 * @param req - The incoming Next.js API request.
 * @param res - The outgoing Next.js API response.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      throw new HttpCode({ statusCode: 405, message: "Method Not Allowed" });
    }

    const obj: WebhookReturn = req.body as WebhookReturn;
    const excluded = { ...obj } as Partial<WebhookReturn>;
    delete excluded.hmac;

    const payment = await prisma.payment.findFirst({
      where: {
        externalId: obj.payment_request_id,
      },
      select: {
        id: true,
        amount: true,
        bookingId: true,
        booking: {
          select: {
            userId: true,
            eventType: {
              select: {
                teamId: true,
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new HttpCode({ statusCode: 204, message: "Payment not found" });
    }

    const credential = await prisma.credential.findFirst({
      where: {
        type: "hitpay_payment",
        ...(payment.booking?.eventType?.teamId
          ? { teamId: payment.booking.eventType.teamId }
          : { userId: payment.booking?.userId }),
      },
    });

    const key = credential?.key;
    if (!key) {
      throw new HttpCode({ statusCode: 204, message: "Credentials not found" });
    }

    const { isSandbox, prod, sandbox } = key as z.infer<typeof hitpayCredentialKeysSchema>;
    const keyObj = isSandbox ? sandbox : prod;
    if (!keyObj) {
      throw new HttpCode({
        statusCode: 204,
        message: `${isSandbox ? "Sandbox" : "Production"} Credentials not found`,
      });
    }

    const { saltKey } = keyObj;
    if (!isValidWebhookSignature(saltKey, excluded as ExcludedWebhookReturn, obj.hmac)) {
      throw new HttpCode({ statusCode: 400, message: "Bad Request" });
    }

    if (excluded.status !== "completed") {
      throw new HttpCode({ statusCode: 204, message: `Payment is ${excluded.status}` });
    }
    const traceContext = distributedTracing.createTrace("hitpay_webhook", {
      meta: { paymentId: payment.id, bookingId: payment.bookingId },
    });
    return await handlePaymentSuccess({
      paymentId: payment.id,
      bookingId: payment.bookingId,
      appSlug: appConfig.slug,
      traceContext,
    });
  } catch (_err) {
    const err = getServerErrorFromUnknown(_err);
    console.error(`Webhook Error: ${err.message}`);
    return res.status(200).send({
      message: err.message,
      stack: IS_PRODUCTION ? undefined : err.cause?.stack,
    });
  }
}
