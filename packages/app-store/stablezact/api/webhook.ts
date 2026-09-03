import crypto from "node:crypto";
import process from "node:process";
import { handlePaymentSuccess } from "@calcom/app-store/_utils/payments/handlePaymentSuccess";
import { HttpError as HttpCode } from "@calcom/lib/http-error";
import { distributedTracing } from "@calcom/lib/tracing/factory";
import prisma from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { buffer } from "micro";
import type { NextApiRequest, NextApiResponse } from "next";
import appConfig from "../config.json";

// Disable body parser to access raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Verify webhook signature from Stablezact
 */
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  try {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(payload);
    const digest = hmac.digest("hex");

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch (error) {
    console.error("[Stablezact Webhook] Signature verification error:", error);
    return false;
  }
}

/**
 * Webhook handler for Stablezact payment events
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get raw body
    const buf = await buffer(req);
    const payload = buf.toString("utf8");

    // Verify signature
    const signature = req.headers["x-stablezact-signature"] as string;
    const webhookSecret = process.env.STABLEZACT_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("[Stablezact Webhook] Webhook secret not configured");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    if (!signature || !verifyWebhookSignature(payload, signature, webhookSecret)) {
      console.error("[Stablezact Webhook] Invalid signature");
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Parse event
    const event = JSON.parse(payload);

    console.log("[Stablezact Webhook] Received event:", event.type, event.data?.paymentId);

    // Route to appropriate handler
    switch (event.type) {
      case "payment.pending":
        await handlePaymentPending(event);
        break;

      case "payment.confirmed":
        await handlePaymentConfirmed(event);
        break;

      case "payment.failed":
        await handlePaymentFailed(event);
        break;

      case "payment.refunded":
        await handlePaymentRefunded(event);
        break;

      default:
        console.log("[Stablezact Webhook] Unhandled event type:", event.type);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("[Stablezact Webhook] Error processing webhook:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Handle payment pending event (transaction submitted to blockchain)
 */
async function handlePaymentPending(event: {
  data: { paymentId: string; transactionHash?: string; network?: string; blockNumber?: number };
}) {
  const { paymentId, transactionHash, network, blockNumber } = event.data;

  // Find payment in database
  const payment = await prisma.payment.findUnique({
    where: { externalId: paymentId },
    select: {
      id: true,
      data: true,
      bookingId: true,
    },
  });

  if (!payment) {
    console.error("[Stablezact Webhook] Payment not found:", paymentId);
    return;
  }

  // Update payment with transaction details
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      data: {
        ...(payment.data as object),
        transactionHash,
        status: "pending",
        network,
        blockNumber,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  console.log("[Stablezact Webhook] Payment pending:", {
    paymentId,
    transactionHash,
    bookingId: payment.bookingId,
  });
}

/**
 * Handle payment confirmed event (transaction confirmed on blockchain)
 */
async function handlePaymentConfirmed(event: {
  data: {
    paymentId: string;
    transactionHash?: string;
    confirmations?: number;
    network?: string;
    blockNumber?: number;
    metadata?: { bookingId?: string };
  };
}) {
  const { paymentId, transactionHash, confirmations, network, blockNumber, metadata } = event.data;

  // Match strictly on externalId (the Stablezact payment id persisted at create()).
  // We deliberately do NOT fall back to metadata.bookingId: that would let a webhook
  // confirm a booking whose Cal.com payment record was never matched to this payment.
  const payment = await prisma.payment.findUnique({
    where: { externalId: paymentId },
    select: {
      id: true,
      data: true,
      bookingId: true,
      success: true,
    },
  });

  if (!payment) {
    console.error("[Stablezact Webhook] Payment not found:", paymentId, metadata);
    return;
  }

  // Idempotency: a re-delivered webhook (or a payment already confirmed via the
  // client confirm-payment route) must not re-send emails or re-fire webhooks.
  if (payment.success) {
    console.log("[Stablezact Webhook] Payment already confirmed:", paymentId);
    return;
  }

  if (!payment.bookingId) {
    console.error("[Stablezact Webhook] Payment has no booking:", paymentId);
    return;
  }

  // Persist the on-chain transaction details on the payment record.
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      data: {
        ...(payment.data as object),
        transactionHash,
        status: "confirmed",
        confirmations,
        network,
        blockNumber,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  // Confirm through cal.com's shared handler: marks the payment succeeded and the
  // booking paid, creates the calendar event, sends confirmation emails, and fires
  // BOOKING_PAID webhooks. It signals success by throwing HttpCode 200.
  const traceContext = distributedTracing.createTrace("stablezact_webhook", {
    meta: { paymentId: payment.id, bookingId: payment.bookingId },
  });
  try {
    await handlePaymentSuccess({
      paymentId: payment.id,
      bookingId: payment.bookingId,
      appSlug: appConfig.slug,
      traceContext,
    });
  } catch (err) {
    if (err instanceof HttpCode && err.statusCode >= 200 && err.statusCode < 300) {
      return;
    }
    throw err;
  }
}

/**
 * Handle payment failed event
 */
async function handlePaymentFailed(event: { data: { paymentId: string; reason?: string } }) {
  const { paymentId, reason } = event.data;

  const payment = await prisma.payment.findUnique({
    where: { externalId: paymentId },
    select: {
      id: true,
      data: true,
      bookingId: true,
    },
  });

  if (!payment) {
    console.error("[Stablezact Webhook] Payment not found:", paymentId);
    return;
  }

  // Update payment status
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      success: false,
      data: {
        ...(payment.data as object),
        status: "failed",
        failureReason: reason,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  // Cancel booking
  await prisma.booking.update({
    where: { id: payment.bookingId },
    data: {
      status: "CANCELLED",
      cancellationReason: `Payment failed: ${reason}`,
    },
  });

  console.log("[Stablezact Webhook] Payment failed:", {
    paymentId,
    reason,
    bookingId: payment.bookingId,
  });

  // TODO: Send failure notification email
}

/**
 * Handle payment refunded event
 */
async function handlePaymentRefunded(event: {
  data: { paymentId: string; refundTransactionHash?: string; refundAmount?: number };
}) {
  const { paymentId, refundTransactionHash, refundAmount } = event.data;

  const payment = await prisma.payment.findUnique({
    where: { externalId: paymentId },
    select: {
      id: true,
      data: true,
    },
  });

  if (!payment) {
    console.error("[Stablezact Webhook] Payment not found:", paymentId);
    return;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      refunded: true,
      data: {
        ...(payment.data as object),
        status: "refunded",
        refundTransactionHash,
        refundAmount,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  console.log("[Stablezact Webhook] Payment refunded:", {
    paymentId,
    refundTransactionHash,
  });

  // TODO: Send refund confirmation email
}
