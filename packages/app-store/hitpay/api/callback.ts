import { HttpError as HttpCode } from "@calcom/lib/http-error";
import prisma from "@calcom/prisma";
import type { NextApiRequest, NextApiResponse } from "next";
import qs from "qs";
import { z } from "zod";

const PaymentDataSchema = z.object({
  id: z.string(),
  url: z.string(),
  defaultLink: z.string(),
  email: z.string(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { reference, status } = req.query;
  if (!reference) {
    throw new HttpCode({ statusCode: 204, message: "Reference not found" });
  }

  const payment = await prisma.payment.findFirst({
    where: {
      externalId: reference as string,
    },
    select: {
      id: true,
      amount: true,
      bookingId: true,
      data: true,
      booking: {
        select: {
          uid: true,
          userId: true,
          user: {
            select: {
              email: true,
              username: true,
            },
          },
          responses: true,
          eventType: {
            select: {
              slug: true,
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
    throw new HttpCode({ statusCode: 204, message: "Credential not found" });
  }

  if (!payment.booking || !payment.booking.user || !payment.booking.eventType) {
    throw new HttpCode({ statusCode: 204, message: "Booking not correct" });
  }

  if (status !== "completed") {
    await prisma.booking.update({
      where: {
        id: payment.bookingId,
      },
      data: {
        status: "CANCELLED",
      },
    });
    const url = `/${payment.booking.user.username}/${payment.booking.eventType.slug}`;
    return res.redirect(url);
  }

  const parsedData = PaymentDataSchema.parse(payment.data);
  const queryParams = {
    "flag.coep": false,
    isSuccessBookingPage: true,
    email: parsedData.email,
    eventTypeSlug: payment.booking.eventType.slug,
  };

  const query = qs.stringify(queryParams);
  const url = `/booking/${payment.booking.uid}?${query}`;

  return res.redirect(url);
}
