import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BaseScheduledEmail } from "./BaseScheduledEmail";

// The translate mock returns the key it is given, so a default templated subject renders as the
// raw key ("confirmed_event_type_subject") while a custom event name renders as calEvent.title.
const t = ((key: string) => key) as unknown as TFunction;

const createPerson = (name: string, email: string): Person => ({
  name,
  email,
  timeZone: "America/New_York",
  language: { translate: t, locale: "en" },
});

const createCalEvent = (overrides: Partial<CalendarEvent>): CalendarEvent =>
  ({
    type: "30min",
    title: "30 Minute Meeting between Organizer and Alice",
    startTime: "2024-01-01T10:00:00.000Z",
    endTime: "2024-01-01T11:00:00.000Z",
    organizer: createPerson("Organizer", "organizer@example.com"),
    attendees: [createPerson("Alice", "alice@example.com")],
    ...overrides,
  }) as CalendarEvent;

const renderSubject = (props: Partial<React.ComponentProps<typeof BaseScheduledEmail>>) => {
  const attendee = props.attendee ?? createPerson("Alice", "alice@example.com");
  const html = renderToStaticMarkup(
    createElement(BaseScheduledEmail, {
      attendee,
      timeZone: attendee.timeZone,
      locale: attendee.language.locale,
      timeFormat: undefined,
      t,
      // Skip ManageLink to keep the render focused on the subject under test.
      callToAction: null,
      ...props,
    } as React.ComponentProps<typeof BaseScheduledEmail>)
  );
  const match = html.match(/<title>([\s\S]*?)<\/title>/);
  return match?.[1];
};

describe("BaseScheduledEmail subject", () => {
  it("uses the resolved title when a custom event name is set", () => {
    const calEvent = createCalEvent({ title: "Meeting with Acme Corp", hasCustomEventName: true });
    expect(renderSubject({ calEvent })).toBe("Meeting with Acme Corp");
  });

  it("keeps the default templated subject when no custom event name is set", () => {
    const calEvent = createCalEvent({ hasCustomEventName: false });
    expect(renderSubject({ calEvent })).toBe("confirmed_event_type_subject");
  });

  it("falls back to the default templated subject when the flag is absent", () => {
    const calEvent = createCalEvent({});
    expect(renderSubject({ calEvent })).toBe("confirmed_event_type_subject");
  });

  it("lets an explicit subject prop win over the custom event name", () => {
    const calEvent = createCalEvent({ title: "Meeting with Acme Corp", hasCustomEventName: true });
    expect(renderSubject({ calEvent, subject: "rescheduled_event_type_subject" })).toBe(
      "rescheduled_event_type_subject"
    );
  });
});
