import { describe, expect, test, vi } from "vitest";

import VideoApiAdapter from "./VideoApiAdapter";

vi.mock("../../_utils/getAppKeysFromSlug", () => ({
  default: vi.fn().mockResolvedValue({
    jitsiPathPattern: "{Scheduler}-{Title}-with-{Organizer}",
    jitsiHost: "https://meet.example.com",
  }),
}));

const eventWith = ({ title, attendees, organizer }: { title: string; attendees: string[]; organizer: string }) => ({
  title,
  type: "intro",
  startTime: new Date().toISOString(),
  endTime: new Date().toISOString(),
  organizer: { name: organizer, email: "organizer@example.com", timeZone: "UTC", language: { locale: "en" } },
  attendees: attendees.map((name) => ({ name, email: "attendee@example.com", timeZone: "UTC", language: { locale: "en" } })),
});

describe("createMeeting", () => {
  test("fills the room name pattern", async () => {
    const meeting = await VideoApiAdapter().createMeeting(
      eventWith({ title: "Intro call", attendees: ["Ada Lovelace"], organizer: "Grace" })
    );
    expect(meeting.id).toBe("Ada-Lovelace-Intro-call-with-Grace");
    expect(meeting.url).toBe("https://meet.example.com/Ada-Lovelace-Intro-call-with-Grace");
  });

  test("inserts names and titles containing $ patterns literally", async () => {
    const meeting = await VideoApiAdapter().createMeeting(
      eventWith({ title: "Pricing $' review", attendees: ["Cash$$Flow", "A$&B"], organizer: "Ke$`ha" })
    );
    expect(meeting.id).toBe("Cash$$Flow-A$&B-Pricing-$'-review-with-Ke$`ha");
    expect(meeting.url).toBe(`https://meet.example.com/${encodeURIComponent(meeting.id)}`);
  });
});
