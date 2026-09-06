import { v5 as uuidv5 } from "uuid";

import { Prisma } from "../client";
import { BookingStatus } from "../enums";

function generateIdempotencyKey({
  startTime,
  endTime,
  userId,
  reassignedById,
}: {
  startTime: Date | string;
  endTime: Date | string;
  userId?: number;
  reassignedById?: number | null;
}) {
  return uuidv5(
    `${startTime.valueOf()}.${endTime.valueOf()}.${userId}${reassignedById ? `.${reassignedById}` : ""}`,
    uuidv5.URL
  );
}

export function bookingIdempotencyKeyExtension() {
  return Prisma.defineExtension({
    query: {
      booking: {
        async create({ args, query }) {
          if (args.data.status === BookingStatus.ACCEPTED) {
            const idempotencyKey = generateIdempotencyKey({
              startTime: args.data.startTime,
              endTime: args.data.endTime,
              userId: args.data.user?.connect?.id,
              reassignedById: args.data.reassignedById,
            });
            args.data.idempotencyKey = idempotencyKey;
          }
          return query(args);
        },
        async update({ args, query }) {
          if (args.data.status === BookingStatus.CANCELLED || args.data.status === BookingStatus.REJECTED) {
            args.data.idempotencyKey = null;
          } else if (args.data.status === BookingStatus.ACCEPTED) {
            if (args.data.startTime && args.data.endTime) {
              args.data.idempotencyKey = generateIdempotencyKey({
                startTime: args.data.startTime,
                endTime: args.data.endTime,
                userId: args.data.userId ?? args.data.user?.connect?.id,
                reassignedById: args.data.reassignedById,
              });
            }
          }
          return query(args);
        },
        async updateMany({ args, query }) {
          if (args.data.status === BookingStatus.CANCELLED || args.data.status === BookingStatus.REJECTED) {
            args.data.idempotencyKey = null;
          }
          return query(args);
        },
      },
    },
  });
}
