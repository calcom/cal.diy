import type { Prisma } from "../client";

export const paymentDataSelect = {
  id: true,
  data: true,
  success: true,
  uid: true,
  refunded: true,
  bookingId: true,
  appId: true,
  amount: true,
  currency: true,
  paymentOption: true,
  booking: {
    select: {
      id: true,
      uid: true,
      description: true,
      title: true,
      startTime: true,
      endTime: true,
      responses: true,
      user: {
        select: {
          name: true,
          timeZone: true,
        },
      },
      attendees: {
        select: {
          email: true,
          name: true,
          timeZone: true,
        },
      },
      eventTypeId: true,
      location: true,
      status: true,
      paid: true,
      rejectionReason: true,
      cancellationReason: true,
      eventType: {
        select: {
          id: true,
          title: true,
          description: true,
          length: true,
          eventName: true,
          requiresConfirmation: true,
          userId: true,
          metadata: true,
          users: {
            select: {
              id: true,
              name: true,
              username: true,
              hideBranding: true,
              theme: true,
            },
          },
          team: {
            select: {
              name: true,
              hideBranding: true,
              parent: {
                select: {
                  hideBranding: true,
                },
              },
            },
          },
          price: true,
          currency: true,
          successRedirectUrl: true,
          forwardParamsSuccessRedirect: true,
        },
      },
    },
  },
} satisfies Prisma.PaymentSelect;
