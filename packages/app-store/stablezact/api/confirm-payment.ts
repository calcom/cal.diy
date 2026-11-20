import process from "node:process";
import { handlePaymentSuccess } from "@calcom/app-store/_utils/payments/handlePaymentSuccess";
import { HttpError as HttpCode } from "@calcom/lib/http-error";
import { distributedTracing } from "@calcom/lib/tracing/factory";
import prisma from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import axios from "axios";
import type { NextApiRequest, NextApiResponse } from "next";
import appConfig from "../config.json";
import { appKeysSchema } from "../zod";

/**
 * Confirm payment from frontend after Stablezact SDK onSuccess callback
 * IMPORTANT: Verifies payment status with Stablezact API before marking booking as paid
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { bookingId, paymentId, transactionHash } = req.body;

    // paymentId must be a string: it is interpolated into the Stablezact API URL below and
    // persisted as externalId, so a non-string (object/array) from the JSON body is rejected.
    if (!bookingId || !paymentId || typeof paymentId !== "string") {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Find the payment record and associated booking
    const payment = await prisma.payment.findFirst({
      where: {
        bookingId: parseInt(bookingId, 10),
        appId: "stablezact",
      },
      select: {
        id: true,
        amount: true,
        data: true,
        success: true,
        booking: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // Idempotency: if this payment is already confirmed, don't re-run confirmation
    // (which would re-send emails and re-fire webhooks).
    if (payment.success) {
      return res.status(200).json({ success: true, message: "Payment already confirmed" });
    }

    // Check if booking exists and has a user
    if (!payment.booking || !payment.booking.userId) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Get merchant credentials to verify payment with Stablezact API
    const credential = await prisma.credential.findFirst({
      where: {
        appId: "stablezact",
        userId: payment.booking.userId,
      },
      select: {
        key: true,
      },
    });

    if (!credential) {
      return res.status(400).json({ error: "Merchant credentials not found" });
    }

    // Validate credentials format (not used for public endpoint, but validates merchant setup)
    const _credentials = appKeysSchema.parse(credential.key);

    // Verify payment status with Stablezact API
    // API URL is configured via environment variable
    const baseURL = process.env.STABLEZACT_API_URL || "https://hub.stablezact.com";
    const apiUrl = baseURL.endsWith("/api") ? baseURL : `${baseURL}/api`;

    try {
      // Encode paymentId — it is caller-supplied, so encoding prevents path/query injection.
      const statusResponse = await axios.get(`${apiUrl}/payments/public/${encodeURIComponent(paymentId)}`, {
        timeout: 10000,
      });

      const paymentData = statusResponse.data?.payment;
      const paymentStatus = paymentData?.status;

      // Only mark as paid once Stablezact confirms the payment succeeded. "swept" means
      // the funds were received and already swept to the merchant wallet — also a success.
      const successStatuses = ["confirmed", "completed", "swept"];
      if (!successStatuses.includes(paymentStatus)) {
        return res.status(400).json({
          error: "Payment not confirmed",
          status: paymentStatus,
        });
      }

      // OWNERSHIP CHECK: the payment's metadata.bookingId (set by our PaymentService at
      // creation and returned by the public status endpoint) must match this booking.
      // Require it and compare unconditionally — a missing bookingId is rejected, not
      // skipped, so a confirmed paymentId from another context cannot confirm this booking.
      const metadataBookingId = paymentData?.metadata?.bookingId?.toString();
      if (!metadataBookingId || metadataBookingId !== bookingId.toString()) {
        return res.status(403).json({ error: "Payment does not belong to this booking" });
      }

      // Defense in depth: the confirmed amount must equal what this booking's payment was
      // created for. We compare against the canonical payment.amount column (stored in
      // cents), not the provider payload. Lenient only when the provider omits an amount.
      const expectedAmount = payment.amount / 100;
      const actualAmount = Number(paymentData?.amount);
      if (Number.isFinite(actualAmount) && Math.abs(expectedAmount - actualAmount) > 1e-9) {
        return res.status(403).json({ error: "Payment amount does not match this booking" });
      }
    } catch {
      return res.status(500).json({
        error: "Failed to verify payment status",
      });
    }

    // Single-use guard: a given Stablezact paymentId may confirm only one booking.
    // This prevents a confirmed paymentId from being replayed against another booking.
    const alreadyUsed = await prisma.payment.findFirst({
      where: {
        externalId: paymentId,
        success: true,
        NOT: { id: payment.id },
      },
      select: { id: true },
    });

    if (alreadyUsed) {
      return res.status(409).json({ error: "This payment has already been used to confirm a booking" });
    }

    // Persist the on-chain transaction hash on the payment record before confirming.
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        externalId: paymentId,
        data: {
          ...(payment.data as object),
          transactionHash,
          confirmedAt: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    // Confirm through cal.com's shared handler: it marks the payment succeeded and
    // the booking paid, creates the calendar event, sends confirmation emails, and
    // fires BOOKING_PAID webhooks. Success is signalled by throwing HttpCode 200.
    try {
      await handlePaymentSuccess({
        paymentId: payment.id,
        bookingId: parseInt(bookingId, 10),
        appSlug: appConfig.slug,
        traceContext: distributedTracing.createTrace("stablezact_confirm_payment", {
          meta: { paymentId: payment.id, bookingId: parseInt(bookingId, 10) },
        }),
      });
    } catch (err) {
      if (err instanceof HttpCode && err.statusCode >= 200 && err.statusCode < 300) {
        return res.status(200).json({ success: true, message: "Payment confirmed" });
      }
      console.error("[Stablezact] Failed to confirm booking", err);
      return res.status(500).json({ error: "Failed to confirm booking" });
    }

    return res.status(200).json({ success: true, message: "Payment confirmed" });
  } catch {
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}
