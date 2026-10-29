import type { Prisma } from "@calcom/prisma/client";

export const getNoShowTaskReferenceUid = (bookingUid: string, webhookId: string): string =>
  JSON.stringify([bookingUid, webhookId]);

export function getNoShowTaskReferenceFilter(bookingUid: string, webhookId?: string): Prisma.TaskWhereInput {
  // Legacy tasks use only the booking UID; serialized tuples isolate new tasks by booking and subscriber.
  return {
    OR: [
      {
        referenceUid: bookingUid,
        ...(webhookId !== undefined ? { payload: { contains: `"id":${JSON.stringify(webhookId)}` } } : {}),
      },
      {
        referenceUid:
          webhookId !== undefined
            ? getNoShowTaskReferenceUid(bookingUid, webhookId)
            : { startsWith: `[${JSON.stringify(bookingUid)},` },
      },
    ],
  };
}
