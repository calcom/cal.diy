import { v5 as uuidv5 } from "uuid";

import { Prisma } from "../client";
import { BookingStatus } from "../enums";

function extractValue<T>(val: T | { set: T } | undefined): T | undefined {
  if (val && typeof val === "object" && "set" in val) {
    return (val as { set: T }).set;
  }
  return val as T | undefined;
}

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
  const startVal = startTime instanceof Date ? startTime.valueOf() : new Date(startTime).valueOf();
  const endVal = endTime instanceof Date ? endTime.valueOf() : new Date(endTime).valueOf();
  return uuidv5(
    `${startVal}.${endVal}.${userId}${reassignedById ? `.${reassignedById}` : ""}`,
    uuidv5.URL
  );
}

export function bookingIdempotencyKeyExtension() {
  return Prisma.defineExtension((client) => {
    return client.$extends({
      query: {
        booking: {
          async create({ args, query }) {
            const status = extractValue(args.data.status);
            if (status === BookingStatus.ACCEPTED) {
              const startTime = extractValue(args.data.startTime);
              const endTime = extractValue(args.data.endTime);
              const userId = extractValue(args.data.userId) ?? args.data.user?.connect?.id;
              const reassignedById = extractValue(args.data.reassignById);
              if (startTime && endTime) {
                const idempotencyKey = generateIdempotencyKey({
                  startTime,
                  endTime,
                  userId,
                  reassignedById,
                });
                args.data.idempotencyKey = idempotencyKey;
              }
            }
            return query(args);
          },
          async update({ args, query }) {
            const status = extractValue(args.data.status);
            if (status === BookingStatus.CANCELLED || status === BookingStatus.REJECTED) {
              args.data.idempotencyKey = null;
            } else if (status === BookingStatus.ACCEPTED) {
              let startTime = extractValue(args.data.startTime as Date | string | { set: Date | string } | undefined);
              let endTime = extractValue(args.data.endTime as Date | string | { set: Date | string } | undefined);
              let userId = extractValue(args.data.userId as number | { set: number } | undefined) ?? args.data.user?.connect?.id;
              let reassignedById = extractValue(args.data.reassignById as number | null | { set: number | null } | undefined);

              if (!startTime || !endTime || userId === undefined || reassignedById === undefined) {
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
                  if (reassignedById === undefined) {
                    reassignedById = existing.reassignById;
                  }
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
            const status = extractValue(args.data.status);
            if (status === BookingStatus.CANCELLED || status === BookingStatus.REJECTED) {
              args.data.idempotencyKey = null;
            }
            return query(args);
          },
        },
      },
    });
  });
}

