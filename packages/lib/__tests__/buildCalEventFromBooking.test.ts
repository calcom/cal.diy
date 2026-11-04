import dayjs from "@calcom/dayjs";
import { getTranslation } from "@calcom/i18n/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCalEventFromBooking } from "../buildCalEventFromBooking";
import { parseRecurringEvent } from "../isRecurringEvent";

// Mock dependencies
vi.mock("../isRecurringEvent", () => ({
  parseRecurringEvent: vi.fn(),
}));

vi.mock("@calcom/i18n/server", () => ({
  getTranslation: vi.fn(),
}));

// Helper functions
const createOrganizer = (overrides = {}) => ({
  email: "organizer@example.com",
  name: "Organizer",
  timeZone: "UTC",
  locale: "en",
  ...overrides,
});

const createAttendee = (overrides = {}) => ({
  name: "Attendee 1",
  email: "attendee1@example.com",
  timeZone: "UTC",
  locale: "en",
  ...overrides,
});

const createBooking = (overrides = {}) => ({
  title: "Test Booking",
  description: "Test Description",
  startTime: new Date("2023-04-01T10:00:00Z"),
  endTime: new Date("2023-04-01T11:00:00Z"),
  userPrimaryEmail: "user@example.com",
  uid: "test-uid",
  attendees: [createAttendee()],
  eventType: {
    title: "Test Event Type",
    seatsPerTimeSlot: 5,
    seatsShowAttendees: true,
    recurringEvent: {
      frequency: "daily",
      interval: 1,
      endDate: new Date("2023-04-01T11:00:00Z"),
    },
  },
  destinationCalendar: null,
  user: null,
  iCalSequence: 0,
  iCalUID: "icaluid",
  ...overrides,
});

describe("buildCalEventFromBooking", () => {
  beforeEach(() => {
    // vi.resetAllMocks();
    // @ts-expect-error
    getTranslation.mockImplementation((locale: string, namespace: string) => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const translate = () => {};
      translate.locale = locale;
      translate.namespace = namespace;
      return translate;
    });

    parseRecurringEvent.mockImplementation((recurringEvent) => {
      if (!recurringEvent) {
        return { parsed: true };
      }
      return { ...recurringEvent, parsed: true };
    });
  });

  it("should build a calendar event from a booking", async () => {
    const booking = createBooking({
      title: "Booking Title",
    });
    const organizer = createOrganizer();
    const location = "Test Location";
    const conferenceCredentialId = 123;

    const result = await buildCalEventFromBooking({
      booking,
      organizer,
      location,
      conferenceCredentialId,
      organizationId: null,
    });

    expect(result).toEqual({
      title: booking.title,
      type: booking.eventType.title,
      description: booking.description,
      startTime: dayjs(booking.startTime).format(),
      endTime: dayjs(booking.endTime).format(),
      organizer: {
        email: booking.userPrimaryEmail,
        name: organizer.name,
        timeZone: organizer.timeZone,
        language: { translate: expect.any(Function), locale: "en" },
      },
      attendees: [
        {
          name: booking.attendees[0].name,
          email: booking.attendees[0].email,
          timeZone: booking.attendees[0].timeZone,
          language: { translate: expect.any(Function), locale: "en" },
        },
      ],
      uid: booking.uid,
      recurringEvent: {
        ...booking.eventType?.recurringEvent,
        parsed: true,
      },
      location,
      conferenceCredentialId: conferenceCredentialId,
      destinationCalendar: [],
      seatsPerTimeSlot: booking.eventType?.seatsPerTimeSlot,
      seatsShowAttendees: true,
      customReplyToEmail: undefined,
      hideOrganizerEmail: undefined,
      iCalSequence: 0,
      iCalUID: booking.iCalUID,
      organizationId: null,
    });

    expect(parseRecurringEvent).toHaveBeenCalledWith(booking.eventType?.recurringEvent);
  });

  it("should handle missing optional fields", async () => {
    const booking = createBooking({
      title: "",
      description: null,
      startTime: null,
      endTime: null,
      userPrimaryEmail: null,
      attendees: [],
      eventType: null,
      iCalUID: "icaluid",
      iCalSequence: 0,
    });

    const organizer = createOrganizer({ name: null, locale: null });
    const location = "";
    const conferenceCredentialId = null;

    const result = await buildCalEventFromBooking({
      booking,
      organizer,
      location,
      conferenceCredentialId,
      organizationId: null,
    });

    expect(result).toEqual({
      title: booking.title,
      type: "",
      description: "",
      startTime: "",
      endTime: "",
      organizer: {
        email: organizer.email,
        name: "Nameless",
        timeZone: organizer.timeZone,
        language: { translate: expect.any(Function), locale: "en" },
      },
      attendees: [],
      uid: "test-uid",
      recurringEvent: {
        parsed: true,
      },
      location: "",
      conferenceCredentialId: undefined,
      destinationCalendar: [],
      seatsPerTimeSlot: undefined,
      seatsShowAttendees: undefined,
      customReplyToEmail: undefined,
      hideOrganizerEmail: undefined,
      iCalSequence: 0,
      iCalUID: "icaluid",
      organizationId: null,
    });

    // @ts-expect-error - locale is set in mock
    expect(result.organizer.language.translate.locale).toBe("en");
    // @ts-expect-error - namespace is set in mock
    expect(result.organizer.language.translate.namespace).toBe("common");
  });

  it("should use user destination calendar when booking destination calendar is null", async () => {
    const booking = createBooking({
      destinationCalendar: null,
      user: {
        destinationCalendar: {
          id: 1,
          integration: "test-integration",
          externalId: "external-id",
          primaryEmail: "user@example.com",
          userId: 1,
          eventTypeId: 1,
          credentialId: 1,
        },
      },
      iCalUID: "icaluid",
      iCalSequence: 0,
    });

    const organizer = createOrganizer();

    const result = await buildCalEventFromBooking({
      booking,
      organizer,
      location: "",
      conferenceCredentialId: null,
    });

    expect(result.destinationCalendar).toEqual([booking.user.destinationCalendar]);
  });
});
