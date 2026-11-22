import { v5 as uuidv5 } from "uuid";

import { Prisma } from "../client";
import { BookingStatus } from "../enums";

export function generateIdempotencyKey({
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
  return Prisma.defineExtension((client) => {
    return client.$extends({
      query: {
        booking: {
          async create({ args, query }) {
            if (args.data.status === BookingStatus.ACCEPTED) {
              const idempotencyKey = generateIdempotencyKey({
                startTime: args.data.startTime,
                endTime: args.data.endTime,
                userId: args.data.user?.connect?.id,
                reassignedById: args.data.reassignById,
              });
              args.data.idempotencyKey = idempotencyKey;
            }
            return query(args);
          },
          async update({ args, query }) {
            if (args.data.status === BookingStatus.CANCELLED || args.data.status === BookingStatus.REJECTED) {
              args.data.idempotencyKey = null;
            } else if (args.data.status === BookingStatus.ACCEPTED) {
              let startTime = args.data.startTime as Date | string | undefined;
              let endTime = args.data.endTime as Date | string | undefined;
              let userId = (args.data.userId ?? args.data.user?.connect?.id) as number | undefined;
              let reassignedById = args.data.reassignById as number | null | undefined;

              if (!startTime || !endTime || userId === undefined) {
                const existing = await client.booking.findUnique({
                  where: args.where,
                  select: {
                    startTime: true,
                    endTime: true,
                    userId: true,
                    reassignById: true,
                  },
                });

                if (existing) {
                  startTime = startTime ?? existing.startTime;
                  endTime = endTime ?? existing.endTime;
                  userId = userId ?? (existing.userId ?? undefined);
                  reassignedById = reassignedById ?? existing.reassignById;
                }
              }

              if (startTime && endTime) {
                args.data.idempotencyKey = generateIdempotencyKey({
                  startTime,
                  endTime,
                  userId,
                  reassignedById,
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
  });
}
