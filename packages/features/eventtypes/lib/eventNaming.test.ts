import type { TFunction } from "i18next";
import { describe, expect, it, vi } from "vitest";
import * as event from "./eventNaming";
import { updateHostInEventName } from "./eventNaming";

describe("event tests", () => {
  describe("fn: getEventName", () => {
    it("should return event_between_users message if no name", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        eventDuration: 15,
        t: tFunc as TFunction,
      });

      expect(result).toBe("foo");

      const lastCall = tFunc.mock.lastCall;
      expect(lastCall).toEqual([
        "event_between_users",
        {
          eventName: "example event type",
          host: "example host",
          attendeeName: "example attendee",
          interpolation: {
            escapeValue: false,
          },
        },
      ]);
    });

    it("should return event_between_users message if no name with team set", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        teamName: "example team name",
        eventDuration: 15,
        t: tFunc as TFunction,
      });

      expect(result).toBe("foo");

      const lastCall = tFunc.mock.lastCall;
      expect(lastCall).toEqual([
        "event_between_users",
        {
          eventName: "example event type",
          host: "example team name",
          attendeeName: "example attendee",
          interpolation: {
            escapeValue: false,
          },
        },
      ]);
    });

    it("should return event name if no vars used", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        eventName: "example event name",
        eventDuration: 15,
        t: tFunc as TFunction,
      });

      expect(result).toBe("example event name");
    });

    it("should support templating of event type", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        eventName: "event type: {Event type title}",
        eventDuration: 15,
        t: tFunc as TFunction,
      });

      expect(result).toBe("event type: example event type");
    });

    it("should support templating of scheduler", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        eventName: "scheduler: {Scheduler}",
        eventDuration: 15,
        t: tFunc as TFunction,
      });

      expect(result).toBe("scheduler: example attendee");
    });

    it("should support templating of organiser", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        eventName: "organiser: {Organiser}",
        eventDuration: 15,
        t: tFunc as TFunction,
      });

      expect(result).toBe("organiser: example host");
    });

    it("should support templating of user", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        eventName: "user: {USER}",
        eventDuration: 15,
        t: tFunc as TFunction,
      });

      expect(result).toBe("user: example attendee");
    });

    it("should support templating of attendee", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        eventName: "attendee: {ATTENDEE}",
        eventDuration: 15,
        t: tFunc as TFunction,
      });

      expect(result).toBe("attendee: example attendee");
    });

    it("should support templating of host", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        eventName: "host: {HOST}",
        eventDuration: 15,
        t: tFunc as TFunction,
      });

      expect(result).toBe("host: example host");
    });

    it("should support templating of attendee with host/attendee", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        eventName: "host or attendee: {HOST/ATTENDEE}",
        eventDuration: 15,
        t: tFunc as TFunction,
      });

      expect(result).toBe("host or attendee: example attendee");
    });

    it("should support templating of host with host/attendee", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName(
        {
          attendeeName: "example attendee",
          eventType: "example event type",
          host: "example host",
          eventName: "host or attendee: {HOST/ATTENDEE}",
          eventDuration: 15,
          t: tFunc as TFunction,
        },
        true
      );

      expect(result).toBe("host or attendee: example host");
    });

    it("should support templating of custom booking fields", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        eventName: "custom field: {customField}",
        bookingFields: {
          customField: "example custom field",
        },
        t: tFunc as TFunction,
      });

      expect(result).toBe("custom field: example custom field");
    });

    it("should support templating of custom booking fields with values", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        eventName: "custom field: {customField}",
        eventDuration: 15,
        bookingFields: {
          customField: {
            value: "example custom field",
          },
        },
        t: tFunc as TFunction,
      });

      expect(result).toBe("custom field: example custom field");
    });

    it("should support templating of custom booking fields with non-string values", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        eventName: "custom field: {customField}",
        eventDuration: 15,
        bookingFields: {
          customField: {
            value: 808,
          },
        },
        t: tFunc as TFunction,
      });

      expect(result).toBe("custom field: 808");
    });

    it("should support templating of custom booking fields with no value", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        eventName: "custom field: {customField}",
        eventDuration: 15,
        bookingFields: {
          customField: {
            value: undefined,
          },
        },
        t: tFunc as TFunction,
      });

      expect(result).toBe("custom field: ");
    });

    it("should support templating of location via {Location}", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        location: "attendeeInPerson",
        eventName: "location: {Location}",
        eventDuration: 15,
        t: tFunc as TFunction,
      });

      expect(result).toBe("location: in_person_attendee_address");
    });

    it("should support templating of location via {LOCATION}", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        location: "attendeeInPerson",
        eventName: "location: {LOCATION}",
        eventDuration: 15,
        t: tFunc as TFunction,
      });

      expect(result).toBe("location: in_person_attendee_address");
    });

    it("should strip location template if none set", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        eventName: "location: {Location}",
        eventDuration: 15,
        t: tFunc as TFunction,
      });

      expect(result).toBe("location: ");
    });

    it("should strip location template if empty", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        location: "",
        eventName: "location: {Location}",
        eventDuration: 15,
        t: tFunc as TFunction,
      });

      expect(result).toBe("location: ");
    });

    it("should template {Location} as passed location if unknown type", () => {
      const tFunc = vi.fn(() => "foo");

      const result = event.getEventName({
        attendeeName: "example attendee",
        eventType: "example event type",
        host: "example host",
        location: "unknownNonsense",
        eventName: "location: {Location}",
        eventDuration: 15,
        t: tFunc as TFunction,
      });

      expect(result).toBe("location: unknownNonsense");
    });
  });

  it("should support templating of event duration", () => {
    const tFunc = vi.fn(() => "foo");

    const result = event.getEventName({
      attendeeName: "example attendee",
      eventType: "example event type",
      host: "example host",
      eventName: "event duration: {Event duration}",
      eventDuration: 15,
      t: tFunc as TFunction,
    });
    expect(result).toBe("event duration: 15 mins");
  });

  it("should support templating of Scheduler first name", () => {
    const tFunc = vi.fn(() => "foo");

    const result = event.getEventName({
      attendeeName: "example attendee",
      eventType: "example event type",
      host: "example host",
      location: "attendeeInPerson",
      eventName: "Scheduler first name: {Scheduler first name}",
      eventDuration: 15,
      t: tFunc as TFunction,
    });

    expect(result).toBe("Scheduler first name: example");
  });

  describe("fn: validateCustomEventName", () => {
    it("should be valid when no variables used", () => {
      expect(event.validateCustomEventName("foo")).toBe(true);
    });

    [
      "Event type title",
      "Organiser",
      "Scheduler",
      "Location",
      "LOCATION",
      "HOST/ATTENDEE",
      "HOST",
      "ATTENDEE",
      "USER",
      "Event duration",
    ].forEach((value) => {
      it(`should support {${value}} variable`, () => {
        expect(event.validateCustomEventName(`foo {${value}} bar`)).toBe(true);

        expect(event.validateCustomEventName(`{${value}} bar`)).toBe(true);

        expect(event.validateCustomEventName(`foo {${value}}`)).toBe(true);
      });
    });

    it("should support booking field variables", () => {
      expect(
        event.validateCustomEventName("foo{customField}bar", {
          customField: true,
        })
      ).toBe(true);
    });

    it("should return variable when invalid variable used", () => {
      expect(event.validateCustomEventName("foo{nonsenseField}bar")).toBe("{nonsenseField}");
    });
  });

  describe("fn: updateHostInEventName", () => {
    const oldHost = "John Doe";
    const newHost = "Jane Smith";

    it("should replace full host name with spaces", () => {
      const eventName = "Meeting with John Doe";
      const result = updateHostInEventName(eventName, oldHost, newHost);
      expect(result).toBe("Meeting with Jane Smith");
    });

    it("should replace full host name with dots", () => {
      const eventName = "Meeting with John.Doe";
      const result = updateHostInEventName(eventName, oldHost, newHost);
      expect(result).toBe("Meeting with Jane.Smith");
    });

    it("should replace full host name with hyphens", () => {
      const eventName = "Meeting with John-Doe";
      const result = updateHostInEventName(eventName, oldHost, newHost);
      expect(result).toBe("Meeting with Jane-Smith");
    });

    it("should replace full host name with underscores", () => {
      const eventName = "Meeting with John_Doe";
      const result = updateHostInEventName(eventName, oldHost, newHost);
      expect(result).toBe("Meeting with Jane_Smith");
    });

    it("should replace first name only", () => {
      const eventName = "John's presentation";
      const result = updateHostInEventName(eventName, oldHost, newHost);
      expect(result).toBe("Jane's presentation");
    });

    it("should replace first name at the beginning", () => {
      const eventName = "John will present tomorrow";
      const result = updateHostInEventName(eventName, oldHost, newHost);
      expect(result).toBe("Jane will present tomorrow");
    });

    it("should replace first name at the end", () => {
      const eventName = "Presentation by John";
      const result = updateHostInEventName(eventName, oldHost, newHost);
      expect(result).toBe("Presentation by Jane");
    });

    it("should handle different cases", () => {
      const eventName = "meeting with john.doe";
      const result = updateHostInEventName(eventName, oldHost, newHost);
      expect(result).toBe("meeting with Jane.Smith");
    });

    it("should handle mixed cases", () => {
      const eventName = "Meeting with JOHN DOE";
      const result = updateHostInEventName(eventName, oldHost, newHost);
      expect(result).toBe("Meeting with Jane Smith");
    });

    it("should not replace partial matches", () => {
      const eventName = "Meeting with Johnson";
      const result = updateHostInEventName(eventName, oldHost, newHost);
      expect(result).toBe("Meeting with Johnson");
    });

    it("should handle empty event name", () => {
      const result = updateHostInEventName("", oldHost, newHost);
      expect(result).toBe("");
    });

    it("should handle event name without host", () => {
      const eventName = "Team meeting";
      const result = updateHostInEventName(eventName, oldHost, newHost);
      expect(result).toBe("Team meeting");
    });

    it("should handle single word names", () => {
      const eventName = "Meeting with John";
      const result = updateHostInEventName(eventName, "John", "Jane");
      expect(result).toBe("Meeting with Jane");
    });

    it("should handle names with multiple parts", () => {
      const eventName = "Meeting with John van der Berg";
      const result = updateHostInEventName(eventName, "John van der Berg", "Jane Smith");
      expect(result).toBe("Meeting with Jane Smith");
    });

    it("should handle names with apostrophes", () => {
      const eventName = "Meeting with John O'Connor";
      const result = updateHostInEventName(eventName, "John O'Connor", "Jane Smith");
      expect(result).toBe("Meeting with Jane Smith");
    });

    it("should handle names with special characters", () => {
      const eventName = "Meeting with Jean-Pierre Dupont";
      const result = updateHostInEventName(eventName, "Jean-Pierre Dupont", "Jane Smith");
      expect(result).toBe("Meeting with Jane Smith");
    });

    it("should prioritize full name over first name", () => {
      const eventName = "John.Doe and John are coming";
      const result = updateHostInEventName(eventName, "John Doe", "Jane Smith");
      expect(result).toBe("Jane.Smith and John are coming");
    });

    it("should only replace first match", () => {
      const eventName = "John.Doe and John Doe meeting";
      const result = updateHostInEventName(eventName, "John Doe", "Jane Smith");
      expect(result).toBe("Jane.Smith and John Doe meeting");
    });

    it("should handle different new name structure", () => {
      const eventName = "Meeting with John.Doe";
      const result = updateHostInEventName(eventName, "John Doe", "Jane");
      expect(result).toBe("Meeting with Jane");
    });

    it("should handle multiple occurrences with priority", () => {
      const eventName = "John and John.Doe and John_Doe";
      const result = updateHostInEventName(eventName, oldHost, newHost);
      expect(result).toBe("John and Jane.Smith and John_Doe");
    });
  });

  describe("fn: replaceCustomInputVariables", () => {
    it("should substitute custom booking field placeholders in subject/body", () => {
      const text = "Booking confirmed for {company} with {customField}";
      const bookingFields = {
        company: { label: "Company", value: "Acme Corp" },
        customField: "Test Value",
      };
      const result = event.replaceCustomInputVariables(text, bookingFields);
      expect(result).toBe("Booking confirmed for Acme Corp with Test Value");
    });

    it("should return unchanged text if bookingFields is missing", () => {
      const text = "Booking confirmed for {company}";
      const result = event.replaceCustomInputVariables(text, null);
      expect(result).toBe(text);
    });
  });
});
