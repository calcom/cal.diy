import type { EventPayloadType, EventTypeInfo } from "@calcom/features/webhooks/lib/sendPayload";
import type { CalendarEvent } from "@calcom/types/Calendar";

export const getWebhookPayloadForBooking = ({
  booking,
  evt,
}: {
  booking: {
    eventType: {
      title: string;
      description: string | null;
      requiresConfirmation: boolean;
      price: number;
      currency: string;
      length: number;
      id: number;
    } | null;
    id: number;
    eventTypeId: number | null;
    userId: number | null;
  };
  evt: CalendarEvent;
}) => {
  const eventTypeInfo: EventTypeInfo = {
    eventTitle: booking.eventType?.title,
    eventDescription: booking.eventType?.description,
    requiresConfirmation: booking.eventType?.requiresConfirmation || null,
    price: booking.eventType?.price,
    currency: booking.eventType?.currency,
    length: booking.eventType?.length,
  };

  const { assignmentReason: _emailAssignmentReason, ...evtWithoutAssignmentReason } = evt;

const payload: EventPayloadType = {
  ...evtWithoutAssignmentReason,
  ...eventTypeInfo,
  bookingId: booking.id,
  ...(evt.attendeeSeatId ? { attendeeSeatId: evt.attendeeSeatId } : {}),
};

  return payload;
};
