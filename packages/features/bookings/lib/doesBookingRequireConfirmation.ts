import type { z } from "zod";

import dayjs from "@calcom/dayjs";
import type { EventTypeMetaDataSchema } from "@calcom/prisma/zod-utils";

/**
 * Determines if a booking actually requires confirmation(considering requiresConfirmationThreshold)
 */
export const doesBookingRequireConfirmation = ({
  booking: { startTime, createdAt, eventType },
}: {
  booking: {
    startTime: Date;
    createdAt?: Date;
    eventType: {
      requiresConfirmation?: boolean;
      metadata: z.infer<typeof EventTypeMetaDataSchema>;
    } | null;
  };
}) => {
  let requiresConfirmation = eventType?.requiresConfirmation;
  const rcThreshold = eventType?.metadata?.requiresConfirmationThreshold;
  if (rcThreshold) {
    // The threshold means "booked with less than X notice", so measure the notice from when the booking
    // was made (payment can complete later) and keep the fraction so non-integer thresholds work too.
    // Use UTC instants: a local-time diff in days shifts by an hour across a DST change, which would
    // make the result depend on the server's time zone.
    const bookedAt = createdAt ? dayjs.utc(createdAt) : dayjs.utc();
    const notice = dayjs.utc(startTime).diff(bookedAt, rcThreshold.unit, true);

    if (notice >= rcThreshold.time) {
      requiresConfirmation = false;
    }
  }
  return requiresConfirmation;
};
