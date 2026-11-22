import type { CredentialPayload } from "@calcom/types/Credential";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockUser = vi.hoisted(() => ({ timeZone: "UTC" as string | null }));

vi.mock("@calcom/lib/crypto", () => ({
  symmetricDecrypt: () => JSON.stringify({ urls: ["https://example.com/feed.ics"] }),
}));
vi.mock("@calcom/prisma", () => ({
  default: { user: { findUnique: async () => ({ timeZone: mockUser.timeZone }) } },
}));

import createCalendarService from "./CalendarService";

type EventOptions = { tzid?: string; utc?: boolean; start: string; end: string; rrule?: string };

const vevent = (uid: string, { tzid, utc, start, end, rrule }: EventOptions) => {
  const suffix = utc ? "Z" : "";
  const params = tzid ? `;TZID=${tzid}` : "";
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "DTSTAMP:20250101T000000Z",
    `DTSTART${params}:${start}${suffix}`,
    `DTEND${params}:${end}${suffix}`,
    ...(rrule ? [`RRULE:${rrule}`] : []),
    `SUMMARY:${uid}`,
    "END:VEVENT",
  ].join("\r\n");
};

// A VTIMEZONE with real DST rules, as exported by Outlook or Google.
const londonVtimezone = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/London",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0000",
  "TZOFFSETTO:+0100",
  "TZNAME:BST",
  "DTSTART:19700329T010000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0000",
  "TZNAME:GMT",
  "DTSTART:19701025T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

const feed = (...parts: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", ...parts, "END:VCALENDAR"].join("\r\n");

const getBusy = async (
  ics: string,
  {
    dateFrom = "2025-01-01T00:00:00.000Z",
    dateTo = "2026-01-01T00:00:00.000Z",
    userTimeZone = "UTC",
  }: { dateFrom?: string; dateTo?: string; userTimeZone?: string | null } = {}
) => {
  mockUser.timeZone = userTimeZone;
  vi.stubGlobal("fetch", async () => ({ text: async () => ics }));
  try {
    const service = createCalendarService({ key: "key" } as unknown as CredentialPayload);
    return await service.getAvailability({
      dateFrom,
      dateTo,
      selectedCalendars: [{ userId: 1 }],
    } as never);
  } finally {
    vi.unstubAllGlobals();
  }
};

const startsOf = (busy: Awaited<ReturnType<typeof getBusy>>) =>
  Object.fromEntries(busy.map((event) => [event.title, event.start]));

describe("ICSFeedCalendarService.getAvailability timezones", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("feed names a TZID without defining a VTIMEZONE", () => {
    it("converts a single event from its own zone", async () => {
      const busy = await getBusy(
        feed(vevent("london", { tzid: "Europe/London", start: "20250528T120000", end: "20250528T140000" }))
      );

      expect(busy).toEqual([
        { title: "london", start: "2025-05-28T11:00:00.000Z", end: "2025-05-28T13:00:00.000Z" },
      ]);
    });

    it("keeps events from different zones apart", async () => {
      const events = [
        vevent("london", { tzid: "Europe/London", start: "20250528T120000", end: "20250528T140000" }),
        vevent("denver", { tzid: "America/Denver", start: "20250529T120000", end: "20250529T140000" }),
      ];
      const expected = { london: "2025-05-28T11:00:00.000Z", denver: "2025-05-29T18:00:00.000Z" };

      expect(startsOf(await getBusy(feed(...events)))).toEqual(expected);
      expect(startsOf(await getBusy(feed(...[...events].reverse())))).toEqual(expected);
    });

    it("does not stack the same wall-clock time in two zones on top of each other", async () => {
      const busy = await getBusy(
        feed(
          vevent("helsinki", { tzid: "Europe/Helsinki", start: "20250530T100000", end: "20250530T110000" }),
          vevent("london", { tzid: "Europe/London", start: "20250530T100000", end: "20250530T110000" })
        )
      );

      expect(startsOf(busy)).toEqual({
        helsinki: "2025-05-30T07:00:00.000Z",
        london: "2025-05-30T09:00:00.000Z",
      });
    });

    it("applies the offset in force on each event's own date", async () => {
      const busy = await getBusy(
        feed(
          vevent("summer", { tzid: "Europe/London", start: "20250528T120000", end: "20250528T140000" }),
          vevent("winter", { tzid: "Europe/London", start: "20251210T120000", end: "20251210T140000" }),
          vevent("sydney-summer", {
            tzid: "Australia/Sydney",
            start: "20251210T120000",
            end: "20251210T140000",
          }),
          vevent("sydney-winter", {
            tzid: "Australia/Sydney",
            start: "20250610T120000",
            end: "20250610T140000",
          })
        )
      );

      expect(startsOf(busy)).toEqual({
        summer: "2025-05-28T11:00:00.000Z",
        winter: "2025-12-10T12:00:00.000Z",
        "sydney-summer": "2025-12-10T01:00:00.000Z",
        "sydney-winter": "2025-06-10T02:00:00.000Z",
      });
    });

    it("handles zones with a half-hour offset", async () => {
      const busy = await getBusy(
        feed(
          vevent("kolkata", { tzid: "Asia/Kolkata", start: "20250528T120000", end: "20250528T130000" }),
          vevent("st-johns", { tzid: "America/St_Johns", start: "20250528T120000", end: "20250528T130000" })
        )
      );

      expect(startsOf(busy)).toEqual({
        kolkata: "2025-05-28T06:30:00.000Z",
        "st-johns": "2025-05-28T14:30:00.000Z",
      });
    });

    it("applies the offset of each occurrence of a recurring event across a DST change", async () => {
      const busy = await getBusy(
        feed(
          vevent("weekly", {
            tzid: "Europe/London",
            start: "20250312T120000",
            end: "20250312T130000",
            rrule: "FREQ=WEEKLY;COUNT=4",
          })
        ),
        { dateFrom: "2025-03-12T00:00:00.000Z", dateTo: "2025-04-30T00:00:00.000Z" }
      );

      // Clocks go forward on 30 March, so the 2 April occurrence is an hour earlier in UTC.
      expect(busy.map((event) => event.start)).toEqual([
        "2025-03-12T12:00:00.000Z",
        "2025-03-19T12:00:00.000Z",
        "2025-03-26T12:00:00.000Z",
        "2025-04-02T11:00:00.000Z",
      ]);
    });

    it("keeps UTC events as they are next to events in other zones", async () => {
      const busy = await getBusy(
        feed(
          vevent("denver", { tzid: "America/Denver", start: "20250529T120000", end: "20250529T130000" }),
          vevent("utc", { utc: true, start: "20250529T120000", end: "20250529T130000" })
        )
      );

      expect(startsOf(busy)).toEqual({
        denver: "2025-05-29T18:00:00.000Z",
        utc: "2025-05-29T12:00:00.000Z",
      });
    });

    it("places events without any zone in the user's time zone", async () => {
      const busy = await getBusy(
        feed(vevent("floating", { start: "20250528T120000", end: "20250528T130000" })),
        {
          userTimeZone: "America/New_York",
        }
      );

      expect(startsOf(busy)).toEqual({ floating: "2025-05-28T16:00:00.000Z" });
    });

    it("does not throw on a zone name that is not an IANA zone", async () => {
      const busy = await getBusy(
        feed(
          vevent("windows-name", {
            tzid: "W. Europe Standard Time",
            start: "20250528T120000",
            end: "20250528T130000",
          }),
          vevent("denver", { tzid: "America/Denver", start: "20250529T120000", end: "20250529T130000" })
        )
      );

      expect(busy).toHaveLength(2);
      expect(startsOf(busy).denver).toBe("2025-05-29T18:00:00.000Z");
    });
  });

  describe("feed defines a VTIMEZONE", () => {
    it("uses its rules for events on both sides of a DST change", async () => {
      const busy = await getBusy(
        feed(
          londonVtimezone,
          vevent("summer", { tzid: "Europe/London", start: "20250528T120000", end: "20250528T140000" }),
          vevent("winter", { tzid: "Europe/London", start: "20251210T120000", end: "20251210T140000" })
        )
      );

      expect(startsOf(busy)).toEqual({
        summer: "2025-05-28T11:00:00.000Z",
        winter: "2025-12-10T12:00:00.000Z",
      });
    });

    it("does not apply it to an event in a zone the feed does not define", async () => {
      const busy = await getBusy(
        feed(
          londonVtimezone,
          vevent("london", { tzid: "Europe/London", start: "20250528T120000", end: "20250528T140000" }),
          vevent("denver", { tzid: "America/Denver", start: "20250529T120000", end: "20250529T140000" })
        )
      );

      expect(startsOf(busy)).toEqual({
        london: "2025-05-28T11:00:00.000Z",
        denver: "2025-05-29T18:00:00.000Z",
      });
    });
  });

  describe("logging", () => {
    it("logs a zone name that is not an IANA zone once per event, not once per occurrence", async () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

      await getBusy(
        feed(
          vevent("weekly", {
            tzid: "W. Europe Standard Time",
            start: "20250312T120000",
            end: "20250312T130000",
            rrule: "FREQ=WEEKLY;COUNT=6",
          })
        ),
        { dateFrom: "2025-03-12T00:00:00.000Z", dateTo: "2025-05-01T00:00:00.000Z" }
      );

      const timezoneErrors = log.mock.calls.filter(([message]) => message === "error in adding vtimezone");
      expect(timezoneErrors).toHaveLength(1);
    });

    it("reports when no time zone can be found for an event", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

      await getBusy(feed(vevent("floating", { start: "20250528T120000", end: "20250528T130000" })), {
        userTimeZone: null,
      });

      expect(error).toHaveBeenCalledWith("No timezone found");
    });
  });
});
