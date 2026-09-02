import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { shouldHideBrandingForEvent } from "@calcom/features/profile/lib/hideBranding";
import prisma from "@calcom/prisma";
import type { Payment } from "@calcom/prisma/client";
import { BookingStatus } from "@calcom/prisma/enums";
import { paymentDataSelect } from "@calcom/prisma/selects/payment";
import { EventTypeMetaDataSchema } from "@calcom/prisma/zod-utils";
import type { inferSSRProps } from "@lib/types/inferSSRProps";
import type { GetServerSidePropsContext } from "next";
import { z } from "zod";

export type PageProps = inferSSRProps<typeof getServerSideProps>;

const querySchema = z.object({
  uid: z.string(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getClientSecretFromPayment(
  payment: Omit<Partial<Payment>, "data"> & { data: Record<string, unknown> }
) {
  if (
    payment.paymentOption === "HOLD" &&
    isRecord(payment.data.setupIntent) &&
    typeof payment.data.setupIntent.client_secret === "string"
  ) {
    return payment.data.setupIntent.client_secret;
  }
  if (typeof payment.data.client_secret === "string") {
    return payment.data.client_secret;
  }
  return "";
}

export const getServerSideProps = async (context: GetServerSidePropsContext) => {
  const parsedQuery = querySchema.safeParse(context.query);
  if (!parsedQuery.success) return { notFound: true } as const;
  const { uid } = parsedQuery.data;

  const session = await getServerSession({ req: context.req });

  const rawPayment = await prisma.payment.findUnique({
    where: {
      uid,
    },
    select: paymentDataSelect,
  });

  if (!rawPayment) return { notFound: true } as const;

  const { data, booking: _booking, ...restPayment } = rawPayment;

  const payment = {
    ...restPayment,
    data: isRecord(data) ? data : {},
  };

  if (!_booking) return { notFound: true } as const;

  const { startTime, endTime, eventType, ...restBooking } = _booking;
  const booking = {
    ...restBooking,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
  };

  if (!eventType) return { notFound: true } as const;

  if (eventType.users.length === 0 && !eventType.team) return { notFound: true } as const;

  if (
    ([BookingStatus.CANCELLED, BookingStatus.REJECTED] as BookingStatus[]).includes(
      booking.status as BookingStatus
    )
  ) {
    return {
      redirect: {
        destination: `/booking/${booking.uid}`,
        permanent: false,
      },
    };
  }

  const [user] = eventType.users.length
    ? eventType.users
    : [{ name: null, theme: null, hideBranding: null, username: null }];

  const profile = {
    name: eventType.team?.name || user?.name || null,
    theme: (!eventType.team?.name && user?.theme) || null,
    hideBranding: await shouldHideBrandingForEvent({
      eventTypeId: eventType.id,
      team: eventType.team,
      owner: eventType.users[0] ?? null,
      organizationId: session?.user?.profile?.organizationId ?? session?.user?.org?.id ?? null,
    }),
  };

  return {
    props: {
      user,
      eventType: {
        ...eventType,
        metadata: EventTypeMetaDataSchema.parse(eventType.metadata),
      },
      booking,
      payment,
      clientSecret: getClientSecretFromPayment(payment),
      profile,
    },
  };
};
