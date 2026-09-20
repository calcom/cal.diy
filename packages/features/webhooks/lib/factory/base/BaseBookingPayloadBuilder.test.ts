import { describe, it, expect, vi } from "vitest";
import { BookingStatus, WebhookTriggerEvents } from "@calcom/prisma/enums";
import type { CalendarEvent } from "@calcom/types/Calendar";

import type { BookingWebhookEventDTO, EventTypeInfo } from "../../dto/types";
import { BookingPayloadBuilder } from "../versioned/v2021-10-20/BookingPayloadBuilder";

vi.mock("@calcom/lib/dayjs", () => ({
  getUTCOffsetByTimezone: vi.fn(() => 0),
}));

describe("BookingPayloadBuilder (v2021-10-20)", () => {
  const mockEventType: EventTypeInfo = {
    eventTitle: "Test Event",
    eventDescription: "Test Description",
    requiresConfirmation: false,
    price: 0,
    currency: "USD",
    length: 30,
  };

  const mockCalendarEvent: CalendarEvent = {
    type: "test-event",
    title: "Test Meeting",
    description: "Meeting description",
    additionalNotes: "Additional notes",
    startTime: "2024-01-15T10:00:00Z",
    endTime: "2024-01-15T10:30:00Z",
    organizer: {
      id: 1,
      email: "organizer@test.com",
      name: "Test Organizer",
      timeZone: "UTC",
      language: { locale: "en" },
    },
    attendees: [
      {
        email: "attendee@test.com",
        name: "Test Attendee",
        timeZone: "UTC",
        language: { locale: "en" },
      },
    ],
    location: "https://cal.com/video/123",
    uid: "booking-uid-123",
    customInputs: {},
    responses: {},
    userFieldsResponses: {},
  };

  const createMockDTO = (
    triggerEvent: WebhookTriggerEvents,
    extra: Partial<BookingWebhookEventDTO> = {}
  ): BookingWebhookEventDTO => ({
    triggerEvent,
    createdAt: "2024-01-15T10:00:00Z",
    booking: {
      id: 1,
      eventTypeId: 1,
      userId: 1,
      smsReminderNumber: null,
    },
    eventType: mockEventType,
    evt: mockCalendarEvent,
    ...extra,
  });

  const builder = new BookingPayloadBuilder();

  describe("BOOKING_CREATED", () => {
    it("should build payload with ACCEPTED status", () => {
      const dto = createMockDTO(WebhookTriggerEvents.BOOKING_CREATED);
      const payload = builder.build(dto);

      expect(payload.triggerEvent).toBe(WebhookTriggerEvents.BOOKING_CREATED);
      expect(payload.payload.status).toBe(BookingStatus.ACCEPTED);
      expect(payload.payload.bookingId).toBe(1);
      expect(payload.payload.title).toBe("Test Meeting");
      expect(payload.payload.organizer.email).toBe("organizer@test.com");
      expect(payload.payload.attendees).toHaveLength(1);
    });

    it("should include eventType fields", () => {
      const dto = createMockDTO(WebhookTriggerEvents.BOOKING_CREATED);
      const payload = builder.build(dto);

      expect(payload.payload.eventTitle).toBe("Test Event");
      expect(payload.payload.eventDescription).toBe("Test Description");
      expect(payload.payload.price).toBe(0);
      expect(payload.payload.currency).toBe("USD");
      expect(payload.payload.length).toBe(30);
    });
  });

  describe("BOOKING_CANCELLED", () => {
    it("should build payload with CANCELLED status and extra fields", () => {
      const dto = createMockDTO(WebhookTriggerEvents.BOOKING_CANCELLED, {
        cancelledBy: "user@test.com",
        cancellationReason: "Schedule conflict",
      });
      const payload = builder.build(dto);

      expect(payload.triggerEvent).toBe(WebhookTriggerEvents.BOOKING_CANCELLED);
      expect(payload.payload.status).toBe(BookingStatus.CANCELLED);
      expect(payload.payload.cancelledBy).toBe("user@test.com");
      expect(payload.payload.cancellationReason).toBe("Schedule conflict");
    });
  });

  describe("BOOKING_REQUESTED", () => {
    it("should build payload with PENDING status", () => {
      const dto = createMockDTO(WebhookTriggerEvents.BOOKING_REQUESTED);
      const payload = builder.build(dto);

      expect(payload.triggerEvent).toBe(WebhookTriggerEvents.BOOKING_REQUESTED);
      expect(payload.payload.status).toBe(BookingStatus.PENDING);
    });
  });

  describe("BOOKING_REJECTED", () => {
    it("should build payload with REJECTED status", () => {
      const dto = createMockDTO(WebhookTriggerEvents.BOOKING_REJECTED);
      const payload = builder.build(dto);

      expect(payload.triggerEvent).toBe(WebhookTriggerEvents.BOOKING_REJECTED);
      expect(payload.payload.status).toBe(BookingStatus.REJECTED);
    });
  });

  describe("BOOKING_RESCHEDULED", () => {
    it("should build payload with reschedule extra fields", () => {
      const dto = createMockDTO(WebhookTriggerEvents.BOOKING_RESCHEDULED, {
        rescheduleId: 2,
        rescheduleUid: "reschedule-uid-456",
        rescheduleStartTime: "2024-01-16T10:00:00Z",
        rescheduleEndTime: "2024-01-16T10:30:00Z",
        rescheduledBy: "user@test.com",
      });
      const payload = builder.build(dto);

      expect(payload.triggerEvent).toBe(WebhookTriggerEvents.BOOKING_RESCHEDULED);
      expect(payload.payload.status).toBe(BookingStatus.ACCEPTED);
      expect(payload.payload.rescheduleId).toBe(2);
      expect(payload.payload.rescheduleUid).toBe("reschedule-uid-456");
      expect(payload.payload.rescheduledBy).toBe("user@test.com");
    });

    it("should include rootBookingUid from the calendar event", () => {
      const dto = createMockDTO(WebhookTriggerEvents.BOOKING_RESCHEDULED, {
        rescheduleUid: "reschedule-uid-456",
        evt: { ...mockCalendarEvent, uid: "new-uid", rootBookingUid: "original-uid" },
      });
      const payload = builder.build(dto);

      expect(payload.payload.rootBookingUid).toBe("original-uid");
      expect(payload.payload.uid).toBe("new-uid");
    });
  });

  describe("BOOKING_PAID", () => {
    it("should build payload with payment extra fields", () => {
      const dto = createMockDTO(WebhookTriggerEvents.BOOKING_PAID, {
        paymentId: 123,
        paymentData: { stripeId: "stripe_123" },
      });
      const payload = builder.build(dto);

      expect(payload.triggerEvent).toBe(WebhookTriggerEvents.BOOKING_PAID);
      expect(payload.payload.paymentId).toBe(123);
      expect(payload.payload.paymentData).toEqual({ stripeId: "stripe_123" });
    });
  });

  describe("BOOKING_PAYMENT_INITIATED", () => {
    it("should build payload with payment extra fields", () => {
      const dto = createMockDTO(WebhookTriggerEvents.BOOKING_PAYMENT_INITIATED, {
        paymentId: 456,
        paymentData: { status: "pending" },
      });
      const payload = builder.build(dto);

      expect(payload.triggerEvent).toBe(WebhookTriggerEvents.BOOKING_PAYMENT_INITIATED);
      expect(payload.payload.paymentId).toBe(456);
    });
  });

  describe("BOOKING_NO_SHOW_UPDATED", () => {
    it("should build no-show specific payload", () => {
      const dto: BookingWebhookEventDTO = {
        triggerEvent: WebhookTriggerEvents.BOOKING_NO_SHOW_UPDATED,
        createdAt: "2024-01-15T10:00:00Z",
        bookingUid: "booking-uid-123",
        bookingId: 1,
        attendees: [{ email: "attendee@test.com", noShow: true }],
        message: "Attendee marked as no-show",
      } as BookingWebhookEventDTO;

      const payload = builder.build(dto);

      expect(payload.triggerEvent).toBe(WebhookTriggerEvents.BOOKING_NO_SHOW_UPDATED);
      expect(payload.payload.bookingUid).toBe("booking-uid-123");
      expect(payload.payload.bookingId).toBe(1);
      expect(payload.payload.message).toBe("Attendee marked as no-show");
    });
  });

  describe("attendee UTC offset", () => {
    it("should add utcOffset to each attendee", () => {
      const dto = createMockDTO(WebhookTriggerEvents.BOOKING_CREATED);
      const payload = builder.build(dto);

      expect(payload.payload.attendees[0]).toHaveProperty("utcOffset");
    });
  });

  describe("organizer UTC offset", () => {
    it("should add utcOffset to organizer", () => {
      const dto = createMockDTO(WebhookTriggerEvents.BOOKING_CREATED);
      const payload = builder.build(dto);

      expect(payload.payload.organizer).toHaveProperty("utcOffset");
    });
  });
});
