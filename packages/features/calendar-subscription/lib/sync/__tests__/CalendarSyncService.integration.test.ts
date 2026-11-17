import type { CalendarSubscriptionEventItem } from "@calcom/features/calendar-subscription/lib/CalendarSubscriptionPort.interface";
import type { BookingRepository } from "@calcom/lib/server/repository/booking";
import type { SelectedCalendar } from "@calcom/prisma/client";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  type BookingWithEventType,
  buildMetadataFromCalendarEvent,
  buildRescheduleBookingData,
  CalendarSyncService,
  extractBookingResponses,
  hasStartTimeChanged,
  mergeBookingResponsesWithEventData,
} from "../CalendarSyncService";

const { mockHandleCancelBooking, mockCreateBooking } = vi.hoisted(() => ({
  mockHandleCancelBooking: vi.fn().mockResolvedValue(undefined),
  mockCreateBooking: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@calcom/features/bookings/lib/handleCancelBooking", () => ({
  default: mockHandleCancelBooking,
}));

vi.mock("@calcom/features/bookings/di/RegularBookingService.container", () => ({
  getRegularBookingService: () => ({
    createBooking: mockCreateBooking,
  }),
}));

vi.mock("@calcom/lib/idempotencyKey/idempotencyKeyService", () => ({
  IdempotencyKeyService: {
    generate: vi.fn(() => "test-idempotency-key"),
  },
}));

vi.mock("@sentry/nextjs", () => ({
  metrics: {
    count: vi.fn(),
    distribution: vi.fn(),
  },
}));

const makeBooking = (overrides: Partial<BookingWithEventType> = {}): BookingWithEventType =>
  ({
    id: 1,
    uid: "booking-uid-123",
    userId: 42,
    userPrimaryEmail: "user@example.com",
    startTime: new Date("2024-01-15T10:00:00Z"),
    endTime: new Date("2024-01-15T11:00:00Z"),
    title: "Team Standup",
    description: "Daily standup meeting",
    location: "https://meet.google.com/abc",
    smsReminderNumber: null,
    responses: {
      name: "John Doe",
      email: "john@example.com",
      notes: "Daily standup meeting",
      location: {
        value: "https://meet.google.com/abc",
        label: "Google Meet",
        optionValue: "https://meet.google.com/abc",
      },
    },
    eventTypeId: 10,
    eventType: { id: 10, title: "Standup", length: 60 },
    ...overrides,
  }) as unknown as BookingWithEventType;

const makeEvent = (
  overrides: Partial<CalendarSubscriptionEventItem> = {}
): CalendarSubscriptionEventItem => ({
  id: "gcal-event-1",
  iCalUID: "booking-uid-123@cal.com",
  start: new Date("2024-01-15T14:00:00Z"),
  end: new Date("2024-01-15T15:00:00Z"),
  busy: true,
  summary: "Team Standup",
  description: "Daily standup meeting",
  location: "https://meet.google.com/abc",
  status: "confirmed",
  isAllDay: false,
  timeZone: "America/New_York",
  recurringEventId: null,
  originalStartDate: null,
  createdAt: new Date("2024-01-10T00:00:00Z"),
  updatedAt: new Date("2024-01-15T09:00:00Z"),
  etag: '"etag-123"',
  kind: "calendar#event",
  ...overrides,
});

const mockSelectedCalendar: SelectedCalendar = {
  id: "sc-1",
  userId: 42,
  credentialId: 1,
  integration: "google_calendar",
  externalId: "user@gmail.com",
  eventTypeId: null,
  delegationCredentialId: null,
  googleChannelId: null,
  googleChannelKind: null,
  googleChannelResourceId: null,
  googleChannelResourceUri: null,
  googleChannelExpiration: null,
  error: null,
  lastErrorAt: null,
  watchAttempts: 0,
  maxAttempts: 3,
  unwatchAttempts: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  channelId: "channel-1",
  channelKind: "web_hook",
  channelResourceId: "resource-1",
  channelResourceUri: "https://example.com/webhook",
  channelExpiration: new Date(Date.now() + 86400000),
  syncSubscribedAt: new Date(),
  syncToken: "sync-token-1",
  syncedAt: new Date(),
  syncErrorAt: null,
  syncErrorCount: 0,
};

// ─── Helper function tests (pure, no mocks needed) ───────────────────────────

describe("buildRescheduleBookingData", () => {
  test("preserves original 60-min duration when event is moved", () => {
    const booking = makeBooking();
    const event = makeEvent({
      start: new Date("2024-01-15T14:00:00Z"),
      end: new Date("2024-01-15T15:00:00Z"),
    });

    const result = buildRescheduleBookingData(booking, event);

    expect(result.start).toBe("2024-01-15T14:00:00.000Z");
    expect(result.end).toBe("2024-01-15T15:00:00.000Z");
  });

  test("preserves original 30-min duration when event is stretched to 90min externally", () => {
    const booking = makeBooking({
      startTime: new Date("2024-01-15T10:00:00Z"),
      endTime: new Date("2024-01-15T10:30:00Z"),
    });
    const event = makeEvent({
      start: new Date("2024-01-15T14:00:00Z"),
      end: new Date("2024-01-15T15:30:00Z"), // 90min in external calendar
    });

    const result = buildRescheduleBookingData(booking, event);

    expect(result.start).toBe("2024-01-15T14:00:00.000Z");
    expect(result.end).toBe("2024-01-15T14:30:00.000Z"); // 30min preserved, NOT 15:30
  });

  test("preserves original 2-hour duration when event is shortened externally", () => {
    const booking = makeBooking({
      startTime: new Date("2024-01-15T10:00:00Z"),
      endTime: new Date("2024-01-15T12:00:00Z"),
    });
    const event = makeEvent({
      start: new Date("2024-01-15T14:00:00Z"),
      end: new Date("2024-01-15T14:30:00Z"), // shortened to 30min
    });

    const result = buildRescheduleBookingData(booking, event);

    expect(result.start).toBe("2024-01-15T14:00:00.000Z");
    expect(result.end).toBe("2024-01-15T16:00:00.000Z"); // 2h preserved
  });

  test("falls back to booking start when event start is null", () => {
    const booking = makeBooking();
    const event = makeEvent({ start: null });

    const result = buildRescheduleBookingData(booking, event);

    expect(result.start).toBe("2024-01-15T10:00:00.000Z");
    expect(result.end).toBe("2024-01-15T11:00:00.000Z");
  });

  test("uses event timezone, falls back to UTC", () => {
    const booking = makeBooking();

    const withTz = buildRescheduleBookingData(booking, makeEvent({ timeZone: "Europe/London" }));
    expect(withTz.timeZone).toBe("Europe/London");

    const withoutTz = buildRescheduleBookingData(booking, makeEvent({ timeZone: null }));
    expect(withoutTz.timeZone).toBe("UTC");
  });

  test("sets rescheduleUid to original booking uid", () => {
    const booking = makeBooking({ uid: "original-uid-abc" });
    const event = makeEvent();

    const result = buildRescheduleBookingData(booking, event);

    expect(result.rescheduleUid).toBe("original-uid-abc");
  });

  test("sets eventTypeId from booking", () => {
    const booking = makeBooking({ eventTypeId: 99 });
    const event = makeEvent();

    const result = buildRescheduleBookingData(booking, event);

    expect(result.eventTypeId).toBe(99);
  });

  test("handles cross-day rescheduling correctly", () => {
    const booking = makeBooking({
      startTime: new Date("2024-01-15T23:00:00Z"),
      endTime: new Date("2024-01-16T00:30:00Z"), // 90min crossing midnight
    });
    const event = makeEvent({
      start: new Date("2024-01-20T22:00:00Z"),
      end: new Date("2024-01-20T23:00:00Z"),
    });

    const result = buildRescheduleBookingData(booking, event);

    expect(result.start).toBe("2024-01-20T22:00:00.000Z");
    expect(result.end).toBe("2024-01-20T23:30:00.000Z"); // 90min preserved, crosses midnight
  });
});

describe("extractBookingResponses", () => {
  test("returns existing responses when present as object", () => {
    const booking = makeBooking({
      responses: { name: "Jane", email: "jane@test.com", custom: "value" },
    });

    const result = extractBookingResponses(booking);

    expect(result).toEqual({ name: "Jane", email: "jane@test.com", custom: "value" });
  });

  test("builds fallback responses when responses is null", () => {
    const booking = makeBooking({
      responses: null,
      title: "My Booking",
      userPrimaryEmail: "user@test.com",
      description: "Some notes",
      smsReminderNumber: "+5511999999999",
      location: "Zoom",
    });

    const result = extractBookingResponses(booking);

    expect(result).toEqual({
      name: "My Booking",
      email: "user@test.com",
      guests: [],
      notes: "Some notes",
      smsReminderNumber: "+5511999999999",
      location: {
        label: "Zoom",
        value: "Zoom",
        optionValue: "Zoom",
      },
    });
  });

  test("builds fallback responses when responses is an array (invalid shape)", () => {
    const booking = makeBooking({ responses: ["invalid"] as unknown as null });

    const result = extractBookingResponses(booking);

    expect(result).toHaveProperty("name");
    expect(result).toHaveProperty("email");
    expect(result).toHaveProperty("guests");
  });

  test("omits location from fallback when booking has no location", () => {
    const booking = makeBooking({ responses: null, location: null });

    const result = extractBookingResponses(booking);

    expect(result.location).toBeUndefined();
  });

  test("handles empty string location", () => {
    const booking = makeBooking({ responses: null, location: "" });

    const result = extractBookingResponses(booking);

    expect(result.location).toBeUndefined();
  });

  test("handles null userPrimaryEmail in fallback", () => {
    const booking = makeBooking({ responses: null, userPrimaryEmail: null });

    const result = extractBookingResponses(booking);

    expect(result.email).toBe("");
  });

  test("handles null description in fallback", () => {
    const booking = makeBooking({ responses: null, description: null });

    const result = extractBookingResponses(booking);

    expect(result.notes).toBe("");
  });
});

describe("mergeBookingResponsesWithEventData", () => {
  test("overrides title, notes, and location from event", () => {
    const booking = makeBooking({
      responses: { name: "John", email: "john@test.com", notes: "old notes" },
    });
    const event = makeEvent({
      summary: "New Title",
      description: "New notes",
      location: "New Location",
    });

    const result = mergeBookingResponsesWithEventData(booking, event);

    expect(result.name).toBe("John"); // preserved from booking
    expect(result.email).toBe("john@test.com"); // preserved from booking
    expect(result.title).toBe("New Title"); // from event
    expect(result.notes).toBe("New notes"); // overridden by event
    expect(result.location).toEqual({
      value: "New Location",
      label: "New Location",
      optionValue: "New Location",
    });
  });

  test("does not override when event fields are null/empty", () => {
    const booking = makeBooking({
      responses: { name: "John", notes: "Original notes", location: { value: "Original" } },
    });
    const event = makeEvent({
      summary: null,
      description: null,
      location: null,
    });

    const result = mergeBookingResponsesWithEventData(booking, event);

    expect(result.title).toBeUndefined();
    expect(result.notes).toBe("Original notes");
    expect(result.location).toEqual({ value: "Original" });
  });

  test("partially overrides — only summary changed", () => {
    const booking = makeBooking({
      responses: { name: "John", notes: "Keep this" },
    });
    const event = makeEvent({
      summary: "Changed Title",
      description: null,
      location: null,
    });

    const result = mergeBookingResponsesWithEventData(booking, event);

    expect(result.title).toBe("Changed Title");
    expect(result.notes).toBe("Keep this"); // not overridden
  });
});

describe("buildMetadataFromCalendarEvent", () => {
  test("serializes all event fields into calendarSubscriptionEvent", () => {
    const event = makeEvent();

    const result = buildMetadataFromCalendarEvent(event);

    expect(result).toHaveProperty("calendarSubscriptionEvent");
    const parsed = JSON.parse(result.calendarSubscriptionEvent);
    expect(parsed.summary).toBe("Team Standup");
    expect(parsed.description).toBe("Daily standup meeting");
    expect(parsed.location).toBe("https://meet.google.com/abc");
    expect(parsed.busy).toBe(true);
    expect(parsed.status).toBe("confirmed");
    expect(parsed.isAllDay).toBe(false);
    expect(parsed.timeZone).toBe("America/New_York");
    expect(parsed.etag).toBe('"etag-123"');
    expect(parsed.kind).toBe("calendar#event");
  });

  test("handles all-null optional fields", () => {
    const event = makeEvent({
      summary: null,
      description: null,
      location: null,
      busy: null,
      status: null,
      isAllDay: null,
      timeZone: null,
      recurringEventId: null,
      originalStartDate: null,
      createdAt: null,
      updatedAt: null,
      etag: null,
      kind: null,
    });

    const result = buildMetadataFromCalendarEvent(event);
    const parsed = JSON.parse(result.calendarSubscriptionEvent);

    Object.values(parsed).forEach((value) => {
      expect(value).toBeNull();
    });
  });

  test("serializes dates as ISO strings", () => {
    const event = makeEvent({
      originalStartDate: new Date("2024-01-15T10:00:00Z"),
      createdAt: new Date("2024-01-10T00:00:00Z"),
      updatedAt: new Date("2024-01-15T09:00:00Z"),
    });

    const result = buildMetadataFromCalendarEvent(event);
    const parsed = JSON.parse(result.calendarSubscriptionEvent);

    expect(parsed.originalStartDate).toBe("2024-01-15T10:00:00.000Z");
    expect(parsed.createdAt).toBe("2024-01-10T00:00:00.000Z");
    expect(parsed.updatedAt).toBe("2024-01-15T09:00:00.000Z");
  });
});

// ─── Change detection ─────────────────────────────────────────────────────────

describe("hasStartTimeChanged", () => {
  test("returns true when event start differs from booking start", () => {
    const booking = makeBooking({ startTime: new Date("2024-01-15T10:00:00Z") });
    const event = makeEvent({ start: new Date("2024-01-15T14:00:00Z") });

    expect(hasStartTimeChanged(booking, event)).toBe(true);
  });

  test("returns false when event start equals booking start", () => {
    const booking = makeBooking({ startTime: new Date("2024-01-15T10:00:00Z") });
    const event = makeEvent({ start: new Date("2024-01-15T10:00:00Z") });

    expect(hasStartTimeChanged(booking, event)).toBe(false);
  });

  test("returns false when event start is null", () => {
    const booking = makeBooking({ startTime: new Date("2024-01-15T10:00:00Z") });
    const event = makeEvent({ start: null });

    expect(hasStartTimeChanged(booking, event)).toBe(false);
  });

  test("detects 1-second difference", () => {
    const booking = makeBooking({ startTime: new Date("2024-01-15T10:00:00Z") });
    const event = makeEvent({ start: new Date("2024-01-15T10:00:01Z") });

    expect(hasStartTimeChanged(booking, event)).toBe(true);
  });

  test("same timestamp in different timezone representations is equal", () => {
    const booking = makeBooking({ startTime: new Date("2024-01-15T10:00:00Z") });
    // Same instant, different representation
    const event = makeEvent({ start: new Date("2024-01-15T07:00:00-03:00") });

    expect(hasStartTimeChanged(booking, event)).toBe(false);
  });
});

describe("CalendarSyncService - skip reschedule when no time change", () => {
  let service: CalendarSyncService;
  let mockBookingRepository: BookingRepository;

  beforeEach(() => {
    mockBookingRepository = {
      findBookingByUidWithEventType: vi.fn(),
    } as unknown as BookingRepository;

    service = new CalendarSyncService({
      bookingRepository: mockBookingRepository,
    });

    vi.clearAllMocks();
  });

  test("skips reschedule when start time has not changed (e.g. RSVP update)", async () => {
    const booking = makeBooking({
      startTime: new Date("2024-01-15T10:00:00Z"),
      endTime: new Date("2024-01-15T11:00:00Z"),
    });
    const event = makeEvent({
      start: new Date("2024-01-15T10:00:00Z"),
      end: new Date("2024-01-15T11:00:00Z"),
      status: "confirmed",
    });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);

    await service.rescheduleBooking(event, mockSelectedCalendar.userId);

    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  test("proceeds with reschedule when start time has changed", async () => {
    const booking = makeBooking({
      startTime: new Date("2024-01-15T10:00:00Z"),
      endTime: new Date("2024-01-15T11:00:00Z"),
    });
    const event = makeEvent({
      start: new Date("2024-01-15T14:00:00Z"),
      end: new Date("2024-01-15T15:00:00Z"),
    });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);

    await service.rescheduleBooking(event, mockSelectedCalendar.userId);

    expect(mockCreateBooking).toHaveBeenCalled();
  });

  test("skips reschedule when event start is null", async () => {
    const booking = makeBooking();
    const event = makeEvent({ start: null });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);

    await service.rescheduleBooking(event, mockSelectedCalendar.userId);

    expect(mockCreateBooking).not.toHaveBeenCalled();
  });
});

// ─── iCalUID parsing edge cases ───────────────────────────────────────────────

describe("iCalUID parsing", () => {
  let service: CalendarSyncService;
  let mockBookingRepository: BookingRepository;

  beforeEach(() => {
    mockBookingRepository = {
      findBookingByUidWithEventType: vi.fn(),
    } as unknown as BookingRepository;

    service = new CalendarSyncService({
      bookingRepository: mockBookingRepository,
    });

    vi.clearAllMocks();
  });

  test("iCalUID with multiple @ signs: only first part is used as bookingUid", async () => {
    const event = makeEvent({ iCalUID: "uid-part@extra@cal.com", status: "cancelled" });
    const booking = makeBooking({ uid: "uid-part" });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);

    await service.cancelBooking(event, mockSelectedCalendar.userId);

    // split("@") → ["uid-part", "extra", "cal.com"], first element is "uid-part"
    expect(mockBookingRepository.findBookingByUidWithEventType).toHaveBeenCalledWith({
      bookingUid: "uid-part",
    });
    expect(mockHandleCancelBooking).toHaveBeenCalled();
  });

  test("iCalUID with UUID format works correctly", async () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const event = makeEvent({ iCalUID: `${uuid}@cal.com` });
    const booking = makeBooking({ uid: uuid });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);

    await service.rescheduleBooking(event, mockSelectedCalendar.userId);

    expect(mockBookingRepository.findBookingByUidWithEventType).toHaveBeenCalledWith({
      bookingUid: uuid,
    });
  });

  test("iCalUID with no @ sign: entire string becomes bookingUid", async () => {
    const event = makeEvent({ iCalUID: "no-at-sign" });
    const booking = makeBooking({ uid: "no-at-sign" });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);

    await service.rescheduleBooking(event, mockSelectedCalendar.userId);

    // split("@") → ["no-at-sign"], first element is "no-at-sign"
    expect(mockBookingRepository.findBookingByUidWithEventType).toHaveBeenCalledWith({
      bookingUid: "no-at-sign",
    });
  });

  test("iCalUID that is just '@' results in empty bookingUid and returns early", async () => {
    const event = makeEvent({ iCalUID: "@" });

    await service.cancelBooking(event, mockSelectedCalendar.userId);

    // split("@") → ["", ""], first element is "" which is falsy
    expect(mockBookingRepository.findBookingByUidWithEventType).not.toHaveBeenCalled();
  });

  test("undefined iCalUID returns early", async () => {
    const event = makeEvent({ iCalUID: undefined as unknown as null });

    await service.cancelBooking(event, mockSelectedCalendar.userId);

    expect(mockBookingRepository.findBookingByUidWithEventType).not.toHaveBeenCalled();
  });
});

// ─── Zero/negative duration edge cases ────────────────────────────────────────

describe("buildRescheduleBookingData - duration edge cases", () => {
  test("booking with zero duration: end equals start", () => {
    const booking = makeBooking({
      startTime: new Date("2024-01-15T10:00:00Z"),
      endTime: new Date("2024-01-15T10:00:00Z"), // zero duration
    });
    const event = makeEvent({
      start: new Date("2024-01-20T14:00:00Z"),
    });

    const result = buildRescheduleBookingData(booking, event);

    // 0ms duration preserved: end === start
    expect(result.start).toBe("2024-01-20T14:00:00.000Z");
    expect(result.end).toBe("2024-01-20T14:00:00.000Z");
  });

  test("booking with very short duration (1 minute)", () => {
    const booking = makeBooking({
      startTime: new Date("2024-01-15T10:00:00Z"),
      endTime: new Date("2024-01-15T10:01:00Z"),
    });
    const event = makeEvent({
      start: new Date("2024-01-20T14:00:00Z"),
    });

    const result = buildRescheduleBookingData(booking, event);

    expect(result.start).toBe("2024-01-20T14:00:00.000Z");
    expect(result.end).toBe("2024-01-20T14:01:00.000Z");
  });

  test("booking with very long duration (8 hours)", () => {
    const booking = makeBooking({
      startTime: new Date("2024-01-15T09:00:00Z"),
      endTime: new Date("2024-01-15T17:00:00Z"),
    });
    const event = makeEvent({
      start: new Date("2024-01-20T08:00:00Z"),
    });

    const result = buildRescheduleBookingData(booking, event);

    expect(result.start).toBe("2024-01-20T08:00:00.000Z");
    expect(result.end).toBe("2024-01-20T16:00:00.000Z"); // 8h preserved
  });
});

// ─── End-to-end data flow: event fields → createBooking ───────────────────────

describe("CalendarSyncService - booking data updated from external event", () => {
  let service: CalendarSyncService;
  let mockBookingRepository: BookingRepository;

  beforeEach(() => {
    mockBookingRepository = {
      findBookingByUidWithEventType: vi.fn(),
    } as unknown as BookingRepository;

    service = new CalendarSyncService({
      bookingRepository: mockBookingRepository,
    });

    vi.clearAllMocks();
  });

  test("summary from external event overrides title in responses", async () => {
    const booking = makeBooking({
      responses: { name: "John Doe", email: "john@test.com", notes: "Original" },
    });
    const event = makeEvent({ summary: "New Meeting Title" });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);
    await service.rescheduleBooking(event, mockSelectedCalendar.userId);

    const call = mockCreateBooking.mock.calls[0][0];
    expect(call.bookingData.responses.title).toBe("New Meeting Title");
    expect(call.bookingData.responses.name).toBe("John Doe"); // preserved
  });

  test("description from external event overrides notes in responses", async () => {
    const booking = makeBooking({
      responses: { name: "John Doe", email: "john@test.com", notes: "Original notes" },
    });
    const event = makeEvent({ description: "Updated meeting agenda" });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);
    await service.rescheduleBooking(event, mockSelectedCalendar.userId);

    const call = mockCreateBooking.mock.calls[0][0];
    expect(call.bookingData.responses.notes).toBe("Updated meeting agenda");
  });

  test("location from external event overrides location in responses", async () => {
    const booking = makeBooking({
      responses: {
        name: "John Doe",
        location: { value: "Old Room", label: "Old Room", optionValue: "Old Room" },
      },
    });
    const event = makeEvent({ location: "https://zoom.us/j/123" });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);
    await service.rescheduleBooking(event, mockSelectedCalendar.userId);

    const call = mockCreateBooking.mock.calls[0][0];
    expect(call.bookingData.responses.location).toEqual({
      value: "https://zoom.us/j/123",
      label: "https://zoom.us/j/123",
      optionValue: "https://zoom.us/j/123",
    });
  });

  test("null fields from external event do NOT override booking responses", async () => {
    const booking = makeBooking({
      responses: {
        name: "John Doe",
        email: "john@test.com",
        notes: "Keep these notes",
        location: { value: "Room A", label: "Room A", optionValue: "Room A" },
      },
    });
    const event = makeEvent({ summary: null, description: null, location: null });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);
    await service.rescheduleBooking(event, mockSelectedCalendar.userId);

    const call = mockCreateBooking.mock.calls[0][0];
    expect(call.bookingData.responses.notes).toBe("Keep these notes");
    expect(call.bookingData.responses.location).toEqual({
      value: "Room A",
      label: "Room A",
      optionValue: "Room A",
    });
    expect(call.bookingData.responses.title).toBeUndefined(); // no override
  });

  test("all fields updated simultaneously from external event", async () => {
    const booking = makeBooking({
      responses: {
        name: "John Doe",
        email: "john@test.com",
        notes: "Old notes",
        location: { value: "Old", label: "Old", optionValue: "Old" },
        guests: ["guest@test.com"],
      },
    });
    const event = makeEvent({
      summary: "Renamed Meeting",
      description: "New agenda for Q1",
      location: "Conference Room B",
    });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);
    await service.rescheduleBooking(event, mockSelectedCalendar.userId);

    const call = mockCreateBooking.mock.calls[0][0];
    const responses = call.bookingData.responses;

    // Overridden by event
    expect(responses.title).toBe("Renamed Meeting");
    expect(responses.notes).toBe("New agenda for Q1");
    expect(responses.location).toEqual({
      value: "Conference Room B",
      label: "Conference Room B",
      optionValue: "Conference Room B",
    });

    // Preserved from booking
    expect(responses.name).toBe("John Doe");
    expect(responses.email).toBe("john@test.com");
    expect(responses.guests).toEqual(["guest@test.com"]);
  });

  test("external event data is stored in metadata as calendarSubscriptionEvent", async () => {
    const booking = makeBooking();
    const event = makeEvent({
      summary: "Sync Test",
      description: "From Google",
      location: "Virtual",
      status: "confirmed",
      timeZone: "America/Sao_Paulo",
    });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);
    await service.rescheduleBooking(event, mockSelectedCalendar.userId);

    const call = mockCreateBooking.mock.calls[0][0];
    const raw = call.bookingData.metadata.calendarSubscriptionEvent;
    expect(typeof raw).toBe("string");

    const parsed = JSON.parse(raw);
    expect(parsed.summary).toBe("Sync Test");
    expect(parsed.description).toBe("From Google");
    expect(parsed.location).toBe("Virtual");
    expect(parsed.status).toBe("confirmed");
    expect(parsed.timeZone).toBe("America/Sao_Paulo");
  });

  test("booking without existing responses uses fallback with event overrides", async () => {
    const booking = makeBooking({
      responses: null,
      title: "Original Title",
      userPrimaryEmail: "user@company.com",
      description: "Original description",
      location: "Original Location",
    });
    const event = makeEvent({
      summary: "Calendar Title",
      description: "Calendar description",
      location: "Calendar Location",
    });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);
    await service.rescheduleBooking(event, mockSelectedCalendar.userId);

    const call = mockCreateBooking.mock.calls[0][0];
    const responses = call.bookingData.responses;

    // Fallback fields from booking
    expect(responses.name).toBe("Original Title");
    expect(responses.email).toBe("user@company.com");
    expect(responses.guests).toEqual([]);

    // Overridden by event
    expect(responses.title).toBe("Calendar Title");
    expect(responses.notes).toBe("Calendar description");
    expect(responses.location).toEqual({
      value: "Calendar Location",
      label: "Calendar Location",
      optionValue: "Calendar Location",
    });
  });
});

// ─── Service-level integration tests ──────────────────────────────────────────

describe("CalendarSyncService - error isolation", () => {
  let service: CalendarSyncService;
  let mockBookingRepository: BookingRepository;

  beforeEach(() => {
    mockBookingRepository = {
      findBookingByUidWithEventType: vi.fn(),
    } as unknown as BookingRepository;

    service = new CalendarSyncService({
      bookingRepository: mockBookingRepository,
    });

    vi.clearAllMocks();
  });

  test("handleEvents: failure in one event does not block others", async () => {
    const cancelEvent = makeEvent({ iCalUID: "cancel-uid@cal.com", status: "cancelled" });
    const rescheduleEvent = makeEvent({
      iCalUID: "reschedule-uid@cal.com",
      status: "confirmed",
      start: new Date("2024-01-20T14:00:00Z"),
    });

    const cancelBooking = makeBooking({ uid: "cancel-uid" });
    const rescheduleBooking = makeBooking({ uid: "reschedule-uid" });

    mockBookingRepository.findBookingByUidWithEventType = vi
      .fn()
      .mockImplementation(({ bookingUid }: { bookingUid: string }) => {
        if (bookingUid === "cancel-uid") return Promise.resolve(cancelBooking);
        if (bookingUid === "reschedule-uid") return Promise.resolve(rescheduleBooking);
        return Promise.resolve(null);
      });

    // Cancel fails, but reschedule should still work
    mockHandleCancelBooking.mockRejectedValue(new Error("Cancel service down"));

    await service.handleEvents(mockSelectedCalendar, [cancelEvent, rescheduleEvent]);

    expect(mockHandleCancelBooking).toHaveBeenCalled();
    expect(mockCreateBooking).toHaveBeenCalled();
  });

  test("handleEvents: DB error on one event does not block others", async () => {
    const event1 = makeEvent({ iCalUID: "uid-1@cal.com", status: "confirmed" });
    const event2 = makeEvent({ iCalUID: "uid-2@cal.com", status: "confirmed" });

    let callCount = 0;
    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error("DB timeout"));
      return Promise.resolve(makeBooking({ uid: "uid-2" }));
    });

    await service.handleEvents(mockSelectedCalendar, [event1, event2]);

    expect(mockBookingRepository.findBookingByUidWithEventType).toHaveBeenCalledTimes(2);
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  });

  test("cancelBooking: passes correct data to handleCancelBooking", async () => {
    const booking = makeBooking({
      uid: "my-booking-uid",
      userId: 99,
      userPrimaryEmail: "admin@company.com",
    });
    const event = makeEvent({ iCalUID: "my-booking-uid@cal.com", status: "cancelled" });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);

    await service.cancelBooking(event, 99);

    expect(mockHandleCancelBooking).toHaveBeenCalledWith({
      userId: 99,
      bookingData: {
        uid: "my-booking-uid",
        cancellationReason: "Cancelled on user's calendar",
        cancelledBy: "admin@company.com",
        skipCalendarSyncTaskCancellation: true,
      },
    });
  });

  test("rescheduleBooking: passes correct bookingMeta flags", async () => {
    const booking = makeBooking();
    const event = makeEvent({
      start: new Date("2024-01-20T14:00:00Z"),
      end: new Date("2024-01-20T15:00:00Z"),
    });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);

    await service.rescheduleBooking(event, mockSelectedCalendar.userId);

    expect(mockCreateBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingMeta: {
          skipCalendarSyncTaskCreation: true,
          skipAvailabilityCheck: true,
          skipEventLimitsCheck: true,
        },
      })
    );
  });

  test("rescheduleBooking: skips booking without eventTypeId", async () => {
    const booking = makeBooking({ eventTypeId: null });
    const event = makeEvent();

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);

    await service.rescheduleBooking(event, mockSelectedCalendar.userId);

    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  test("cancelBooking: skips when calendar owner is not the booking host", async () => {
    const booking = makeBooking({ uid: "booking-uid-123", userId: 99 });
    const event = makeEvent({ iCalUID: "booking-uid-123@cal.com", status: "cancelled" });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);

    // calendarUserId (42) !== booking.userId (99) → skip
    await service.cancelBooking(event, mockSelectedCalendar.userId);

    expect(mockHandleCancelBooking).not.toHaveBeenCalled();
  });

  test("rescheduleBooking: skips when calendar owner is not the booking host", async () => {
    const booking = makeBooking({ uid: "booking-uid-123", userId: 99 });
    const event = makeEvent({
      iCalUID: "booking-uid-123@cal.com",
      start: new Date("2024-01-20T14:00:00Z"),
    });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);

    // calendarUserId (42) !== booking.userId (99) → skip
    await service.rescheduleBooking(event, mockSelectedCalendar.userId);

    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  test("cancelBooking: skips booking without userId", async () => {
    const booking = makeBooking({ userId: null });
    const event = makeEvent({ iCalUID: "booking-uid-123@cal.com", status: "cancelled" });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);

    await service.cancelBooking(event, mockSelectedCalendar.userId);

    expect(mockHandleCancelBooking).not.toHaveBeenCalled();
  });

  test("cancelBooking: skips booking without userPrimaryEmail", async () => {
    const booking = makeBooking({ userPrimaryEmail: null });
    const event = makeEvent({ iCalUID: "booking-uid-123@cal.com", status: "cancelled" });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(booking);

    await service.cancelBooking(event, mockSelectedCalendar.userId);

    expect(mockHandleCancelBooking).not.toHaveBeenCalled();
  });

  test("handleEvents: correctly routes cancelled vs non-cancelled events", async () => {
    const cancelledEvent = makeEvent({ iCalUID: "uid-a@cal.com", status: "cancelled" });
    const confirmedEvent = makeEvent({ iCalUID: "uid-b@cal.com", status: "confirmed" });

    const bookingA = makeBooking({ uid: "uid-a" });
    const bookingB = makeBooking({ uid: "uid-b" });

    mockBookingRepository.findBookingByUidWithEventType = vi
      .fn()
      .mockImplementation(({ bookingUid }: { bookingUid: string }) => {
        if (bookingUid === "uid-a") return Promise.resolve(bookingA);
        if (bookingUid === "uid-b") return Promise.resolve(bookingB);
        return Promise.resolve(null);
      });

    await service.handleEvents(mockSelectedCalendar, [cancelledEvent, confirmedEvent]);

    // "cancelled" → cancelBooking, "confirmed" → rescheduleBooking
    expect(mockHandleCancelBooking).toHaveBeenCalledTimes(1);
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  });

  test("handleEvents: non-cancelled statuses (tentative, confirmed) all route to reschedule", async () => {
    const tentativeEvent = makeEvent({ iCalUID: "uid-t@cal.com", status: "tentative" });
    const bookingT = makeBooking({ uid: "uid-t" });

    mockBookingRepository.findBookingByUidWithEventType = vi.fn().mockResolvedValue(bookingT);

    await service.handleEvents(mockSelectedCalendar, [tentativeEvent]);

    expect(mockHandleCancelBooking).not.toHaveBeenCalled();
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  });
});
