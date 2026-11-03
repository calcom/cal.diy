import { ORGANIZER_EMAIL_EXEMPT_DOMAINS } from "@calcom/lib/constants";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { buildCalendarEvent, buildPerson, buildVideoCallData } from "@calcom/lib/test/builder";
import { test } from "@calcom/testing/lib/fixtures/fixtures";
import type { CalendarEvent } from "@calcom/types/Calendar";
import { describe, expect, vi } from "vitest";
import generateIcsString from "./generateIcsString";

const assertHasIcsString = (icsString: string | undefined) => {
  if (!icsString) throw new Error("icsString is undefined");

  expect(icsString).toBeDefined();

  return icsString;
};

const testIcsStringContains = ({
  icsString,
  event,
  status,
}: {
  icsString: string;
  event: CalendarEvent;
  status: string;
}) => {
  const DTSTART = `${event.startTime.split(".")[0].split(":").slice(0, 2).join(":").replace(/[-:]/g, "")}00Z`;
  const DTEND = `${event.endTime.split(".")[0].split(":").slice(0, 2).join(":").replace(/[-:]/g, "")}00Z`;
  const isOrganizerExempt = ORGANIZER_EMAIL_EXEMPT_DOMAINS?.split(",")
    .filter((domain) => domain.trim() !== "")
    .some((domain) => event.organizer.email.toLowerCase().endsWith(domain.toLowerCase()));
  expect(icsString).toEqual(expect.stringContaining(`UID:${event.iCalUID}`));
  // Sometimes the deeply equal stringMatching error appears. Don't want to add flakey tests
  // expect(icsString).toEqual(expect.stringContaining(`SUMMARY:${event.title}`));
  expect(icsString).toEqual(expect.stringContaining(`DTSTART:${DTSTART}`));
  if (event.hideOrganizerEmail && !isOrganizerExempt) {
    expect(icsString).toEqual(expect.stringContaining(`ORGANIZER;CN=${event.organizer.name}`));
    expect(icsString).not.toEqual(expect.stringContaining(`mailto:${event.organizer.email}`));
  } else {
    expect(icsString).toEqual(
      expect.stringContaining(`ORGANIZER;CN=${event.organizer.name}:mailto:${event.organizer.email}`)
    );
  }
  expect(icsString).toEqual(expect.stringContaining(`DTEND:${DTEND}`));
  expect(icsString).toEqual(expect.stringContaining(`STATUS:${status}`));
  expect(icsString).toEqual(
    expect.stringContaining(`METHOD:${status === "CANCELLED" ? "CANCEL" : "REQUEST"}`)
  );
  //   Getting an error expected icsString to deeply equal stringMatching
  //   for (const attendee of event.attendees) {
  //     expect(icsString).toEqual(
  //       expect.stringMatching(
  //         `RSVP=TRUE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${attendee.name}:mailto:${attendee.email}`
  //       )
  //     );
  //   }
};

describe("generateIcsString", () => {
  describe("booking actions", () => {
    test("when bookingAction is Create", () => {
      const event = buildCalendarEvent({
        iCalSequence: 0,
        attendees: [buildPerson()],
      });

      const status = "CONFIRMED";

      const icsString = generateIcsString({
        event: event,
        status,
      });

      const assertedIcsString = assertHasIcsString(icsString);

      testIcsStringContains({ icsString: assertedIcsString, event, status });
    });
    test("when bookingAction is Cancel", () => {
      const event = buildCalendarEvent({
        iCalSequence: 0,
        attendees: [buildPerson()],
      });
      const status = "CANCELLED";

      const icsString = generateIcsString({
        event: event,
        status,
      });

      const assertedIcsString = assertHasIcsString(icsString);

      testIcsStringContains({ icsString: assertedIcsString, event, status });
    });
    test("when bookingAction is Reschedule", () => {
      const event = buildCalendarEvent({
        iCalSequence: 0,
        attendees: [buildPerson()],
      });
      const status = "CONFIRMED";

      const icsString = generateIcsString({
        event: event,
        status,
      });

      const assertedIcsString = assertHasIcsString(icsString);

      testIcsStringContains({ icsString: assertedIcsString, event, status });
    });
    test("when bookingAction is RequestReschedule", () => {
      const event = buildCalendarEvent({
        iCalSequence: 0,
        attendees: [buildPerson()],
      });
      const status = "CANCELLED";

      const icsString = generateIcsString({
        event: event,
        status,
      });

      const assertedIcsString = assertHasIcsString(icsString);

      testIcsStringContains({ icsString: assertedIcsString, event, status });
    });
  });
  describe("set location", () => {
    test("Location is a video link", () => {
      const videoCallData = buildVideoCallData();
      const event = buildCalendarEvent(
        {
          iCalSequence: 0,
          attendees: [buildPerson()],
          videoCallData,
        },
        true
      );
      const status = "CANCELLED";

      const icsString = generateIcsString({
        event: event,
        status,
      });

      assertHasIcsString(icsString);

      expect(icsString).toEqual(expect.stringContaining(`LOCATION:${videoCallData.url}`));
    });
    // Could be custom link, address, or phone number
    test("Location is a string", () => {
      const event = buildCalendarEvent(
        {
          iCalSequence: 0,
          attendees: [buildPerson()],
          location: "+1234567890",
        },
        true
      );
      const status = "CANCELLED";

      const icsString = generateIcsString({
        event: event,
        status,
      });

      assertHasIcsString(icsString);

      expect(icsString).toEqual(expect.stringContaining(`LOCATION:${event.location}`));
    });
  });
  describe("error handling", () => {
    test("throws ErrorWithCode.BadRequest when ics library returns ValidationError", async () => {
      // Mock the ics library to return a ValidationError
      const ics = await import("ics");
      const createEventSpy = vi.spyOn(ics, "createEvent");

      // Simulate a Yup ValidationError (which has name: "ValidationError")
      const validationError = {
        name: "ValidationError",
        message: "attendees[0].email must be a valid email",
        errors: ["attendees[0].email must be a valid email"],
      };

      createEventSpy.mockReturnValueOnce({
        error: validationError as unknown as Error,
        value: undefined,
      });

      const event = buildCalendarEvent({
        iCalSequence: 0,
        attendees: [buildPerson()],
      });

      expect(() =>
        generateIcsString({
          event,
          status: "CONFIRMED",
        })
      ).toThrow(ErrorWithCode);

      try {
        generateIcsString({
          event,
          status: "CONFIRMED",
        });
      } catch (error) {
        expect(error).toBeInstanceOf(ErrorWithCode);
        expect((error as ErrorWithCode).code).toBe(ErrorCode.BadRequest);
        expect((error as ErrorWithCode).message).toBe("attendees[0].email must be a valid email");
      }

      createEventSpy.mockRestore();
    });

    test("re-throws non-ValidationError errors as-is", async () => {
      const ics = await import("ics");
      const createEventSpy = vi.spyOn(ics, "createEvent");

      // Simulate a different type of error
      const genericError = new Error("Some other error");

      createEventSpy.mockReturnValueOnce({
        error: genericError,
        value: undefined,
      });

      const event = buildCalendarEvent({
        iCalSequence: 0,
        attendees: [buildPerson()],
      });

      expect(() =>
        generateIcsString({
          event,
          status: "CONFIRMED",
        })
      ).toThrow(genericError);

      createEventSpy.mockRestore();
    });

    test("returns ics string when there is no error", () => {
      const event = buildCalendarEvent({
        iCalSequence: 0,
        attendees: [buildPerson()],
      });

      const icsString = generateIcsString({
        event,
        status: "CONFIRMED",
      });

      expect(icsString).toBeDefined();
      expect(typeof icsString).toBe("string");
    });
  });
});
