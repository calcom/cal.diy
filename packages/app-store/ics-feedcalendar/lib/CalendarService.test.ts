import { symmetricEncrypt } from "@calcom/lib/crypto";
import type { CredentialPayload } from "@calcom/types/Credential";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BuildCalendarService from "./CalendarService";

const TEST_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";

vi.hoisted(() => {
  globalThis.process.env.CALENDSO_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
});

const VALID_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Test//Test//EN",
  "X-WR-CALNAME:Test ICS Feed",
  "BEGIN:VEVENT",
  "UID:event-1",
  "DTSTART:20260101T100000Z",
  "DTEND:20260101T110000Z",
  "SUMMARY:Busy Slot",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("ICSFeedCalendarService", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("bounds hanging ICS feeds with AbortSignal.timeout and still returns healthy feeds", async () => {
    vi.useFakeTimers();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(
        () => controller.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
        ms
      );
      return controller.signal;
    });

    try {
      mockFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url === "https://example.com/slow.ics") {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(
                init.signal?.reason ??
                  new DOMException("The operation was aborted due to timeout", "TimeoutError")
              );
            });
          });
        }
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(VALID_ICS),
        });
      });

      const credential = {
        id: 1,
        type: "ics-feed_calendar",
        key: symmetricEncrypt(
          JSON.stringify({ urls: ["https://example.com/slow.ics", "https://example.com/good.ics"] }),
          TEST_ENCRYPTION_KEY
        ),
        userId: 1,
        teamId: null,
        appId: "ics-feed",
        invalid: false,
        delegationCredentialId: null,
        user: { email: "user@example.com" },
        encryptedKey: null,
      } as unknown as CredentialPayload;

      const service = BuildCalendarService(credential);
      const pendingCalendars = service.listCalendars();

      expect(timeoutSpy).toHaveBeenCalledWith(10_000);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      for (const [, options] of mockFetch.mock.calls) {
        expect(options?.signal).toBeInstanceOf(AbortSignal);
      }

      await vi.advanceTimersByTimeAsync(10_000);
      const calendars = await pendingCalendars;

      expect(calendars).toEqual([
        {
          name: "Test ICS Feed",
          readOnly: true,
          externalId: "https://example.com/good.ics",
          integration: "ics-feed_calendar",
        },
      ]);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it("skips a feed whose response body read aborts without failing healthy feeds", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === "https://example.com/stalled-body.ics") {
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
        });
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(VALID_ICS),
      });
    });

    const credential = {
      id: 1,
      type: "ics-feed_calendar",
      key: symmetricEncrypt(
        JSON.stringify({ urls: ["https://example.com/stalled-body.ics", "https://example.com/good.ics"] }),
        TEST_ENCRYPTION_KEY
      ),
      userId: 1,
      teamId: null,
      appId: "ics-feed",
      invalid: false,
      delegationCredentialId: null,
      user: { email: "user@example.com" },
      encryptedKey: null,
    } as unknown as CredentialPayload;

    const service = BuildCalendarService(credential);
    const calendars = await service.listCalendars();

    expect(calendars).toHaveLength(1);
    expect(calendars[0].externalId).toBe("https://example.com/good.ics");
  });
});
