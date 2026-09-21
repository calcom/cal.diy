import type { Person } from "@calcom/types/Calendar";
import { describe, expect, it } from "vitest";
import { BookingWebhookFactory } from "../BookingWebhookFactory";

const createTestOrganizer = (overrides?: Partial<Person>): Person => ({
  email: "organizer@example.com",
  name: "Test Organizer",
  timeZone: "UTC",
  language: { locale: "en", translate: (() => "") as any },
  ...overrides,
});

const createTestAttendee = (overrides?: Partial<Person>): Person => ({
  email: "attendee@example.com",
  name: "Test Attendee",
  timeZone: "UTC",
  language: { locale: "en", translate: (() => "") as any },
  ...overrides,
});

const createTestBooking = (overrides?: Record<string, any>) => ({
  id: 12345,
  uid: "test-uid-123",
  title: "Test Event",
  description: "Test Description",
  startTime: new Date("2025-01-24T10:00:00Z"),
  endTime: new Date("2025-01-24T11:00:00Z"),
  location: "https://meet.example.com",
  customInputs: { field1: "value1" },
  responses: { name: { value: "Test User" } },
  userFieldsResponses: { company: { value: "Test Corp" } },
  smsReminderNumber: "+1234567890",
  iCalUID: "ical-uid-123",
  ...overrides,
});

describe("BookingWebhookFactory", () => {
  describe("createCancelledEventPayload", () => {
    it("should create a basic cancelled event payload with required fields", () => {
      const factory = new BookingWebhookFactory();
      const booking = createTestBooking();
      const organizer = createTestOrganizer();
      const attendees = [createTestAttendee()];

      const payload = factory.createCancelledEventPayload({
        bookingId: booking.id,
        uid: booking.uid,
        title: booking.title,
        eventSlug: "test-event",
        description: booking.description,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime.toISOString(),
        location: booking.location,
        customInputs: booking.customInputs,
        responses: booking.responses,
        userFieldsResponses: booking.userFieldsResponses,
        smsReminderNumber: booking.smsReminderNumber,
        iCalUID: booking.iCalUID,
        organizer,
        attendees,
        destinationCalendar: null,
        cancelledBy: "test@example.com",
        cancellationReason: "User requested",
      });

      expect(payload.bookingId).toBe(12345);
      expect(payload.uid).toBe("test-uid-123");
      expect(payload.title).toBe("Test Event");
      expect(payload.description).toBe("Test Description");
      expect(payload.organizer).toEqual(organizer);
      expect(payload.attendees).toEqual(attendees);
      expect(payload.type).toBe("test-event");
      expect(payload.startTime).toBe(booking.startTime.toISOString());
      expect(payload.endTime).toBe(booking.endTime.toISOString());
      expect(payload.location).toBe("https://meet.example.com");
      expect(payload.customInputs).toEqual({ field1: "value1" });
      expect(payload.responses).toEqual({ name: { value: "Test User" } });
      expect(payload.userFieldsResponses).toEqual({ company: { value: "Test Corp" } });
      expect(payload.smsReminderNumber).toBe("+1234567890");
      expect(payload.iCalUID).toBe("ical-uid-123");
      expect(payload.destinationCalendar).toEqual([]);
      expect(payload.cancellationReason).toBe("User requested");
      expect(payload.cancelledBy).toBe("test@example.com");

      // Verify no extra properties exist
      const expectedKeys = [
        "bookingId",
        "type",
        "title",
        "description",
        "customInputs",
        "responses",
        "eventTitle",
        "eventTypeId",
        "length",
        "requestReschedule",
        "iCalSequence",
        "userFieldsResponses",
        "startTime",
        "endTime",
        "organizer",
        "attendees",
        "uid",
        "location",
        "destinationCalendar",
        "iCalUID",
        "smsReminderNumber",
        "cancellationReason",
        "cancelledBy",
        "status",
      ];
      const actualKeys = Object.keys(payload).sort();
      expect(actualKeys).toEqual(expectedKeys.sort());
    });

    it("should handle responses and userFieldsResponses", () => {
      const factory = new BookingWebhookFactory();
      const booking = createTestBooking();
      const responses = { field1: "response1", field2: "response2" };
      const userFieldsResponses = { company: "Test Corp", department: "Engineering" };

      const payload = factory.createCancelledEventPayload({
        bookingId: booking.id,
        uid: booking.uid,
        title: booking.title,
        eventSlug: null,
        description: null,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime.toISOString(),
        location: null,
        customInputs: null,
        responses,
        userFieldsResponses,
        smsReminderNumber: null,
        iCalUID: null,
        organizer: createTestOrganizer(),
        attendees: [createTestAttendee()],
        destinationCalendar: null,
        cancelledBy: "user@example.com",
        cancellationReason: "Test",
      });

      expect(payload.responses).toEqual(responses);
      expect(payload.userFieldsResponses).toEqual(userFieldsResponses);
    });

    it("should handle destination calendar as single object", () => {
      const factory = new BookingWebhookFactory();
      const booking = createTestBooking();
      const destinationCalendar = {
        id: 1,
        integration: "google",
        externalId: "cal123",
        primaryEmail: null,
        userId: null,
        eventTypeId: null,
        credentialId: null,
        createdAt: null,
        updatedAt: null,
        delegationCredentialId: null,
      };

      const payload = factory.createCancelledEventPayload({
        bookingId: booking.id,
        uid: booking.uid,
        title: booking.title,
        eventSlug: null,
        description: null,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime.toISOString(),
        location: null,
        customInputs: null,
        responses: {},
        userFieldsResponses: {},
        smsReminderNumber: null,
        iCalUID: null,
        organizer: createTestOrganizer(),
        attendees: [],
        destinationCalendar,
        cancelledBy: "user@example.com",
        cancellationReason: "Test",
      });

      expect(payload.destinationCalendar).toEqual([destinationCalendar]);
    });

    it("should handle null destination calendar", () => {
      const factory = new BookingWebhookFactory();
      const booking = createTestBooking();

      const payload = factory.createCancelledEventPayload({
        bookingId: booking.id,
        uid: booking.uid,
        title: booking.title,
        eventSlug: null,
        description: null,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime.toISOString(),
        location: null,
        customInputs: null,
        responses: {},
        userFieldsResponses: {},
        smsReminderNumber: null,
        iCalUID: null,
        organizer: createTestOrganizer(),
        attendees: [],
        destinationCalendar: null,
        cancelledBy: "user@example.com",
        cancellationReason: "Test",
      });

      expect(payload.destinationCalendar).toEqual([]);
    });

    it("should handle sms reminder number and iCal UID", () => {
      const factory = new BookingWebhookFactory();
      const booking = createTestBooking();

      const payload = factory.createCancelledEventPayload({
        bookingId: booking.id,
        uid: booking.uid,
        title: booking.title,
        eventSlug: null,
        description: null,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime.toISOString(),
        location: null,
        customInputs: null,
        responses: {},
        userFieldsResponses: {},
        smsReminderNumber: "+1234567890",
        iCalUID: "ical-uid-123",
        organizer: createTestOrganizer(),
        attendees: [],
        destinationCalendar: null,
        cancelledBy: "user@example.com",
        cancellationReason: "Test",
      });

      expect(payload.smsReminderNumber).toBe("+1234567890");
      expect(payload.iCalUID).toBe("ical-uid-123");
    });

    it("should derive type from eventSlug when available, otherwise from title", () => {
      const factory = new BookingWebhookFactory();
      const booking = createTestBooking();

      // Test with eventSlug provided
      const payloadWithSlug = factory.createCancelledEventPayload({
        bookingId: booking.id,
        uid: booking.uid,
        title: "Meeting Title",
        eventSlug: "team-standup",
        description: null,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime.toISOString(),
        location: null,
        customInputs: null,
        responses: {},
        userFieldsResponses: {},
        smsReminderNumber: null,
        iCalUID: null,
        organizer: createTestOrganizer(),
        attendees: [],
        destinationCalendar: null,
        cancelledBy: "user@example.com",
        cancellationReason: "Test",
      });

      expect(payloadWithSlug.type).toBe("team-standup");

      // Test with eventSlug null, should use title
      const payloadWithoutSlug = factory.createCancelledEventPayload({
        bookingId: booking.id,
        uid: booking.uid,
        title: "Meeting Title",
        eventSlug: null,
        description: null,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime.toISOString(),
        location: null,
        customInputs: null,
        responses: {},
        userFieldsResponses: {},
        smsReminderNumber: null,
        iCalUID: null,
        organizer: createTestOrganizer(),
        attendees: [],
        destinationCalendar: null,
        cancelledBy: "user@example.com",
        cancellationReason: "Test",
      });

      expect(payloadWithoutSlug.type).toBe("Meeting Title");

      // Test with both eventSlug and title empty
      const payloadEmpty = factory.createCancelledEventPayload({
        bookingId: booking.id,
        uid: booking.uid,
        title: "",
        eventSlug: "",
        description: null,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime.toISOString(),
        location: null,
        customInputs: null,
        responses: {},
        userFieldsResponses: {},
        smsReminderNumber: null,
        iCalUID: null,
        organizer: createTestOrganizer(),
        attendees: [],
        destinationCalendar: null,
        cancelledBy: "user@example.com",
        cancellationReason: "Test",
      });

      expect(payloadEmpty.type).toBe("");
    });
  });
});
