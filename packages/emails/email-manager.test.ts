import type { EventTypeMetadata } from "@calcom/prisma/zod-utils";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { shouldSkipAttendeeEmailWithSettings } from "./email-manager";
import AttendeeScheduledEmail from "./templates/attendee-scheduled-email";

vi.mock("@calcom/prisma", () => ({
  prisma: {},
}));

// Mock dependencies for AttendeeScheduledEmail tests
vi.mock("./lib/generateIcsFile", () => ({
  default: vi.fn(() => "mock-ical-content"),
  GenerateIcsRole: {
    ATTENDEE: "ATTENDEE",
  },
}));

vi.mock("./src/renderEmail", () => ({
  default: vi.fn(() => Promise.resolve("<html>mock-email</html>")),
}));

vi.mock("@calcom/lib/getReplyToHeader", () => ({
  getReplyToHeader: vi.fn(() => ({})),
}));

vi.mock("@calcom/lib/CalEventParser", () => ({
  getRichDescription: vi.fn(() => "mock-description"),
}));

vi.mock("./templates/_base-email", () => {
  return {
    default: class MockBaseEmail {
      getMailerOptions() {
        return { from: "test@cal.com" };
      }
    },
  };
});

describe("shouldSkipAttendeeEmailWithSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Metadata check", () => {
    it("should skip email when metadata has disableStandardEmails.all.attendee enabled", () => {
      const metadata: EventTypeMetadata = {
        disableStandardEmails: {
          all: {
            attendee: true,
          },
        },
      };

      const result = shouldSkipAttendeeEmailWithSettings(metadata, null, "confirmation");
      expect(result).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("should send email when organizationSettings is null", () => {
      const result = shouldSkipAttendeeEmailWithSettings(undefined, null, "confirmation");
      expect(result).toBe(false);
    });

    it("should send email when metadata is undefined", () => {
      const result = shouldSkipAttendeeEmailWithSettings(undefined, null, "confirmation");
      expect(result).toBe(false);
    });

    it("should skip email when metadata disables attendee emails", () => {
      const metadata: EventTypeMetadata = {
        disableStandardEmails: {
          all: {
            attendee: true,
          },
        },
      };

      const result = shouldSkipAttendeeEmailWithSettings(metadata, null, "confirmation");
      expect(result).toBe(true);
    });

    it("should send email when metadata attendee flag is false", () => {
      const metadata: EventTypeMetadata = {
        disableStandardEmails: {
          all: {
            attendee: false,
          },
        },
      };

      const result = shouldSkipAttendeeEmailWithSettings(metadata, null, "confirmation");
      expect(result).toBe(false);
    });
  });
});

describe("AttendeeScheduledEmail - Privacy fix for seated events", () => {
  const createMockPerson = (name: string, email: string): Person => ({
    name,
    email,
    timeZone: "America/New_York",
    language: {
      translate: vi.fn((key: string) => key),
      locale: "en",
    },
  });

  const createMockCalendarEvent = (
    options: {
      seatsPerTimeSlot?: number | null;
      seatsShowAttendees?: boolean | null;
      attendees?: Person[];
      [key: string]: unknown;
    } = {}
  ): CalendarEvent => {
    const attendees = options.attendees || [
      createMockPerson("Alice", "alice@example.com"),
      createMockPerson("Bob", "bob@example.com"),
      createMockPerson("Charlie", "charlie@example.com"),
    ];

    return {
      title: "Test Event",
      type: "Test Event Type",
      startTime: "2024-01-01T10:00:00Z",
      endTime: "2024-01-01T11:00:00Z",
      organizer: createMockPerson("Organizer", "organizer@example.com"),
      attendees,
      seatsPerTimeSlot: options.seatsPerTimeSlot ?? null,
      seatsShowAttendees: options.seatsShowAttendees ?? null,
      ...options,
    } as CalendarEvent;
  };

  describe("Privacy: seatsShowAttendees setting", () => {
    it("should filter attendees to only recipient when seatsShowAttendees is false for seated events", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 5,
        seatsShowAttendees: false,
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient);

      // Should only contain the recipient
      expect(email.calEvent.attendees).toHaveLength(1);
      expect(email.calEvent.attendees[0].email).toBe(recipient.email);
      expect(email.calEvent.attendees[0].name).toBe(recipient.name);
    });

    it("should include all attendees when seatsShowAttendees is true for seated events", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 5,
        seatsShowAttendees: true,
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient);

      // Should contain all attendees
      expect(email.calEvent.attendees).toHaveLength(3);
      expect(email.calEvent.attendees.map((a) => a.email)).toEqual([
        "alice@example.com",
        "bob@example.com",
        "charlie@example.com",
      ]);
    });

    it("should filter attendees when seatsShowAttendees is null for seated events (defaults to false)", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 5,
        seatsShowAttendees: null,
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient);

      // Should only contain the recipient (null defaults to false)
      expect(email.calEvent.attendees).toHaveLength(1);
      expect(email.calEvent.attendees[0].email).toBe(recipient.email);
    });

    it("should include all attendees for non-seated events regardless of seatsShowAttendees", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: null,
        seatsShowAttendees: false, // This shouldn't matter for non-seated events
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient);

      // Should contain all attendees (non-seated events always show all)
      expect(email.calEvent.attendees).toHaveLength(3);
    });
  });

  describe("Explicit showAttendees parameter", () => {
    it("should use explicit showAttendees=true parameter even when seatsShowAttendees is false", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 5,
        seatsShowAttendees: false,
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient, true);

      // Should contain all attendees because explicit parameter overrides
      expect(email.calEvent.attendees).toHaveLength(3);
    });

    it("should use explicit showAttendees=false parameter even when seatsShowAttendees is true", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 5,
        seatsShowAttendees: true,
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient, false);

      // Should only contain recipient because explicit parameter overrides
      expect(email.calEvent.attendees).toHaveLength(1);
      expect(email.calEvent.attendees[0].email).toBe(recipient.email);
    });
  });

  describe("Edge cases", () => {
    it("should handle single attendee correctly when filtering", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 5,
        seatsShowAttendees: false,
        attendees: [createMockPerson("Solo", "solo@example.com")],
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient);

      expect(email.calEvent.attendees).toHaveLength(1);
      expect(email.calEvent.attendees[0].email).toBe("solo@example.com");
    });

    it("should not mutate original calEvent when filtering attendees", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 5,
        seatsShowAttendees: false,
      });
      const originalAttendeesCount = calEvent.attendees.length;
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient);

      // Original calEvent should remain unchanged
      expect(calEvent.attendees).toHaveLength(originalAttendeesCount);
      // Email's calEvent should be filtered
      expect(email.calEvent.attendees).toHaveLength(1);
      // They should be different objects (cloned)
      expect(email.calEvent).not.toBe(calEvent);
    });

    it("should use same calEvent reference when not filtering (performance optimization)", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 5,
        seatsShowAttendees: true,
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient);

      // Should use same reference when not filtering
      expect(email.calEvent).toBe(calEvent);
    });
  });

  describe("Real-world scenarios", () => {
    it("should protect privacy for paid seated events with sharing disabled", () => {
      // This is the reported bug scenario
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 10,
        seatsShowAttendees: false, // Privacy setting disabled
        attendees: [
          createMockPerson("Customer 1", "customer1@example.com"),
          createMockPerson("Customer 2", "customer2@example.com"),
          createMockPerson("Customer 3", "customer3@example.com"),
        ],
      });
      const recipient = calEvent.attendees[1]; // Customer 2

      const email = new AttendeeScheduledEmail(calEvent, recipient);

      // Customer 2 should only see their own information
      expect(email.calEvent.attendees).toHaveLength(1);
      expect(email.calEvent.attendees[0].email).toBe("customer2@example.com");
      expect(email.calEvent.attendees[0].name).toBe("Customer 2");
      // Should not contain other customers' information
      expect(email.calEvent.attendees.some((a) => a.email === "customer1@example.com")).toBe(false);
      expect(email.calEvent.attendees.some((a) => a.email === "customer3@example.com")).toBe(false);
    });

    it("should allow sharing when explicitly enabled for seated events", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 10,
        seatsShowAttendees: true, // Sharing enabled
        attendees: [
          createMockPerson("Attendee 1", "attendee1@example.com"),
          createMockPerson("Attendee 2", "attendee2@example.com"),
        ],
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient);

      // Should see all attendees when sharing is enabled
      expect(email.calEvent.attendees).toHaveLength(2);
      expect(email.calEvent.attendees.map((a) => a.email)).toEqual([
        "attendee1@example.com",
        "attendee2@example.com",
      ]);
    });

    it("should substitute custom booking field placeholders in subject (Issue #29658)", async () => {
      const calEvent = createMockCalendarEvent({
        title: "Meeting with {company} and {customField}",
        responses: {
          company: { label: "Company", value: "Acme Corp" },
          customField: "Test Value",
        },
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient);
      const payload = await email["getNodeMailerPayload"]();
      expect(payload.subject).toBe("Meeting with Acme Corp and Test Value");
    });
  });
});
