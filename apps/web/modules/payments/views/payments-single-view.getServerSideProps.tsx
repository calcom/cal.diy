import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { shouldHideBrandingForEvent } from "@calcom/features/profile/lib/hideBranding";
import prisma from "@calcom/prisma";
import type { Payment } from "@calcom/prisma/client";
import { BookingStatus } from "@calcom/prisma/enums";
import { paymentDataSelect } from "@calcom/prisma/selects/payment";
import { EventTypeMetaDataSchema, eventTypeBookingFields } from "@calcom/prisma/zod-utils";
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

  if (!eventType) return { notFound: true } as const;

  if (eventType.users.length === 0 && !eventType.team) return { notFound: true } as const;

  if (
    ([BookingStatus.CANCELLED, BookingStatus.REJECTED] as BookingStatus[]).includes(
      restBooking.status as BookingStatus
    )
  ) {
    return {
      redirect: {
        destination: `/booking/${restBooking.uid}`,
        permanent: false,
      },
    };
  }

  const bookingFields = eventTypeBookingFields.parse(eventType.bookingFields ?? []);
  const userId = session?.user?.id;
  const isLoggedInUserHost =
    !!userId &&
    (restBooking.user?.id === userId ||
      eventType.userId === userId ||
      eventType.users.some((eventUser) => eventUser.id === userId));

  // Fail closed: non-hosts only get answers that map to a currently visible field.
  let responses = restBooking.responses;
  if (!isLoggedInUserHost && isRecord(responses)) {
    const visibleResponses = { ...responses };
    for (const key in visibleResponses) {
      const field = bookingFields.find((bookingField) => bookingField.name === key);
      if (!field || field.hidden) {
        delete visibleResponses[key];
      }
    }
    responses = visibleResponses;
  }

  const booking = {
    ...restBooking,
    responses,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
  };

  const { bookingFields: _bookingFields, ...eventTypeWithoutBookingFields } = eventType;

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
        ...eventTypeWithoutBookingFields,
        metadata: EventTypeMetaDataSchema.parse(eventType.metadata),
      },
      booking,
      payment,
      clientSecret: getClientSecretFromPayment(payment),
      profile,
    },
  };
};
