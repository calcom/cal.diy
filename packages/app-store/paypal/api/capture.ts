import type { NextApiRequest, NextApiResponse } from "next";
import z from "zod";

import { findPaymentCredentials } from "@calcom/app-store/paypal/api/webhook";
import Paypal from "@calcom/app-store/paypal/lib/Paypal";
import { IS_PRODUCTION } from "@calcom/lib/constants";
import prisma from "@calcom/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Look if it's get
    if (req.method !== "GET") {
      throw new Error("Invalid method");
    }

    // Look if bookingUid it's provided in query params using zod
    const parseRequest = captureRequestSchema.safeParse(req.query);
    if (!parseRequest.success) {
      throw new Error("Request is malformed");
    }

    // Get bookingUid and token from query params
    const { bookingUid, token } = parseRequest.data;

    // Get booking credentials
    const booking = await prisma.booking.findUnique({
      where: {
        uid: bookingUid,
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!booking) {
      throw new Error("Booking not found");
    }

    const credentials = await findPaymentCredentials(booking?.id);

    if (!credentials) {
      throw new Error("Credentials not found");
    }

    // Get paypal instance
    const paypalClient = new Paypal(credentials);

    // capture payment
    const capture = await paypalClient.captureOrder(token);

    if (!capture) {
      res.redirect(`/booking/${bookingUid}?paypalPaymentStatus=failed`);
      return;
    }
    if (IS_PRODUCTION) {
      res.redirect(`/booking/${bookingUid}?paypalPaymentStatus=success`);
    } else {
      // For cal.dev, paypal sandbox doesn't send webhooks
      const updateBooking = prisma.booking.update({
        where: {
          uid: bookingUid,
        },
        data: {
          paid: true,
        },
      });
      const updatePayment = prisma.payment.update({
        where: {
          id: booking?.id,
        },
        data: {
          success: true,
        },
      });
      await Promise.all([updateBooking, updatePayment]);
      res.redirect(`/booking/${bookingUid}?paypalPaymentStatus=success`);
    }
    return;
  } catch (_err) {
    res.redirect(`/booking/${req.query.bookingUid}?paypalPaymentStatus=failed`);
  }
}

const captureRequestSchema = z.object({
  bookingUid: z.string(),
  token: z.string(),
});
