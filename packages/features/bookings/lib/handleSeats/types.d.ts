import type z from "zod";

import type { TraceContext } from "@calcom/lib/tracing";
import type { Prisma } from "@calcom/prisma/client";
import type { BuiltCalendarEvent } from "@calcom/features/CalendarEventBuilder";
import type { AppsStatus, CalendarEvent } from "@calcom/types/Calendar";

import type { Booking } from "../handleNewBooking/createBooking";
import type { NewBookingEventType } from "../handleNewBooking/getEventTypesFromDB";
import type { OriginalRescheduledBooking } from "../handleNewBooking/originalRescheduledBookingUtils";

export type BookingSeat = Prisma.BookingSeatGetPayload<{ include: { booking: true; attendee: true } }> | null;
export type Invitee = {
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  timeZone: string;
  phoneNumber?: string;
  language: {
    translate: TFunction;
    locale: string;
  };
}[];

export type NewSeatedBookingObject = {
  rescheduleUid: string | undefined;
  reqBookingUid: string | undefined;
  eventType: NewBookingEventType;
  evt: BuiltCalendarEvent;
  invitee: Invitee;
  allCredentials: Awaited<ReturnType<typeof getAllCredentialsIncludeServiceAccountKey>>;
  organizerUser: OrganizerUser;
  originalRescheduledBooking: OriginalRescheduledBooking;
  bookerEmail: string;
  bookerPhoneNumber?: string | null;
  tAttendees: TFunction;
  bookingSeat: BookingSeat;
  reqUserId: number | undefined;
  reqUserUuid?: string | null;
  rescheduleReason: RescheduleReason;
  reqBodyUser: string | string[] | undefined;
  noEmail: NoEmail;
  isConfirmedByDefault: boolean;
  additionalNotes: AdditionalNotes;
  reqAppsStatus: ReqAppsStatus;
  attendeeLanguage: string | null;
  paymentAppData: PaymentAppData;
  fullName: ReturnType<typeof getFullName>;
  smsReminderNumber: SmsReminderNumber;
  eventTypeInfo: EventTypeInfo;
  uid: short.SUUID;
  eventTypeId: EventTypeId;
  reqBodyMetadata: ReqBodyMetadata;
  subscriberOptions: GetSubscriberOptions;
  eventTrigger: WebhookTriggerEvents;
  responses: z.infer<ReturnType<typeof getBookingDataSchema>>["responses"] | null;
  rescheduledBy?: string;
  isDryRun?: boolean;
  traceContext: TraceContext;
};

export type RescheduleSeatedBookingObject = NewSeatedBookingObject & { rescheduleUid: string };

export type SeatedBooking = Prisma.BookingGetPayload<{
  select: {
    uid: true;
    rootBookingUid: true;
    id: true;
    attendees: { include: { bookingSeat: true } };
    userId: true;
    references: true;
    startTime: true;
    user: true;
    status: true;
    smsReminderNumber: true;
    endTime: true;
  };
}>;

export type HandleSeatsResultBooking =
  | (Partial<Booking> & {
    appsStatus?: AppsStatus[];
    seatReferenceUid?: string;
    paymentUid?: string;
    message?: string;
    paymentId?: number;
  })
  | null;

export type NewTimeSlotBooking = Prisma.BookingGetPayload<{
  select: {
    id: true;
    uid: true;
    iCalUID: true;
    userId: true;
    references: true;
    attendees: {
      include: {
        bookingSeat: true;
      };
    };
  };
}>;

export type SeatAttendee = Partial<Person>;
