import type { BookingStatus } from "@calcom/prisma/enums";

export interface CalendarEvent {
  id: number;
  title: string;
  description?: string;
  start: Date | string; // You can pass in a string from DB since we use dayjs for the dates.
  end: Date;
  source?: string;
  originalEvent?: CalendarEvent;
  options?: {
    status?: BookingStatus;
    hideTime?: boolean;
    allDay?: boolean;
    color?: string;
    className?: string;
    bookingUid?: string;
    "data-test-id"?: string;
    borderOnly?: boolean;
  };
}
