import { symmetricDecrypt } from "@calcom/lib/crypto";
import { fetchWithSSRFProtection } from "@calcom/lib/ssrfProtection";
import type { CredentialPayload } from "@calcom/types/Credential";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BuildCalendarService from "./CalendarService";

vi.mock("@calcom/lib/crypto", () => ({
  symmetricDecrypt: vi.fn(),
}));

vi.mock("@calcom/lib/ssrfProtection", () => ({
  fetchWithSSRFProtection: vi.fn(),
}));

describe("ICS feed SSRF protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(symmetricDecrypt).mockReturnValue(
      JSON.stringify({ urls: ["https://unsafe.example/feed.ics", "https://safe.example/feed.ics"] })
    );
  });

  it("continues processing safe feeds when another feed is rejected", async () => {
    vi.mocked(fetchWithSSRFProtection).mockImplementation(async (url) => {
      if (url.includes("unsafe")) throw new Error("URL blocked by SSRF protection");
      return new Response("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:Safe\r\nEND:VCALENDAR");
    });

    const service = BuildCalendarService({ key: "encrypted" } as CredentialPayload);

    await expect(service.listCalendars()).resolves.toEqual([
      {
        name: "Safe",
        readOnly: true,
        externalId: "https://safe.example/feed.ics",
        integration: "ics-feed_calendar",
      },
    ]);
    expect(fetchWithSSRFProtection).toHaveBeenCalledTimes(2);
  });
});
