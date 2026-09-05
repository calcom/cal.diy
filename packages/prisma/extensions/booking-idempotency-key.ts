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
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();

  return uuidv5(
    `${startMs}.${endMs}.${userId ?? ""}${reassignedById ? `.${reassignedById}` : ""}`,
    uuidv5.URL
  );
}

export function bookingIdempotencyKeyExtension() {
  return Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        booking: {
          async create({ args, query }) {
            if (args.data.status === BookingStatus.ACCEPTED) {
              const data = args.data as Record<string, any>;
              args.data.idempotencyKey = generateIdempotencyKey({
                startTime: data.startTime,
                endTime: data.endTime,
                userId: data.userId ?? data.user?.connect?.id,
                reassignedById: data.reassignedById ?? data.reassignById,
              });
            }
            return query(args);
          },
          async update({ args, query }) {
            if (
              args.data.status === BookingStatus.CANCELLED ||
              args.data.status === BookingStatus.REJECTED
            ) {
              args.data.idempotencyKey = null;
            } else if (
              args.data.status === BookingStatus.ACCEPTED &&
              !args.data.idempotencyKey
            ) {
              const data = args.data as Record<string, any>;

              let startTime = data.startTime;
              let endTime = data.endTime;
              let userId = typeof data.userId === "number" ? data.userId : data.user?.connect?.id;
              let reassignedById =
                data.reassignedById !== undefined ? data.reassignedById : data.reassignById;

              // Fetch stored identity fields when payload is partial to avoid producing mismatched idempotency keys
              if (
                startTime === undefined ||
                endTime === undefined ||
                userId === undefined ||
                reassignedById === undefined
              ) {
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
                  userId = userId ?? existing.userId ?? undefined;
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
            if (
              args.data.status === BookingStatus.CANCELLED ||
              args.data.status === BookingStatus.REJECTED
            ) {
              args.data.idempotencyKey = null;
            }
            return query(args);
          },
        },
      },
    })
  );
}
