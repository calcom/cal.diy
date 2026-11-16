// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import config from "./config.json";

const [loader] = config.appData.tag.scripts;
const { pushEventScript } = config.appData.tag;

type TestWindow = Record<string, ((...args: never[]) => unknown) | undefined>;
const testWindow = window as unknown as TestWindow;

// The tags are plain strings in config.json, so nothing else checks that they run.
function run(content: string, attrs: Record<string, string>): void {
  const script = document.createElement("script");
  for (const [name, value] of Object.entries(attrs)) script.setAttribute(name, value);
  Object.defineProperty(document, "currentScript", { value: script, configurable: true });
  new Function(content)();
}

const injected = (): HTMLScriptElement | null => document.head.querySelector("script[src]");

afterEach(() => {
  document.head.innerHTML = "";
  for (const name of ["sa_event", "sa_calcom_path", "$pushEvent"]) delete testWindow[name];
});

describe("Simple Analytics loader tag", () => {
  it("loads nothing until a hostname is configured", () => {
    run(loader.content, { "data-hostname": "{HOSTNAME}", "data-collect-dnt": "{COLLECT_DNT}" });
    expect(injected()).toBeNull();
  });

  it("loads the script for the configured hostname", () => {
    run(loader.content, { "data-hostname": " example.com ", "data-collect-dnt": "{COLLECT_DNT}" });
    const script = injected();
    expect(script?.src).toBe("https://scripts.simpleanalyticscdn.com/latest.js");
    expect(script?.getAttribute("data-hostname")).toBe("example.com");
    expect(script?.getAttribute("data-platform")).toBe("calcom");
    expect(script?.hasAttribute("data-collect-dnt")).toBe(false);
  });

  it("collects Do Not Track visits only when enabled", () => {
    run(loader.content, { "data-hostname": "example.com", "data-collect-dnt": "true" });
    expect(injected()?.getAttribute("data-collect-dnt")).toBe("true");
  });

  it("keeps booking uids and private link tokens out of recorded paths", () => {
    run(loader.content, { "data-hostname": "example.com" });
    const name = injected()?.getAttribute("data-path-overwriter") ?? "";
    const mask = (path: string): unknown =>
      (testWindow[name] as (page: { path: string }) => string)({ path });
    expect(mask("/booking/abc123")).toBe("/booking/[uid]");
    expect(mask("/booking/abc123/embed")).toBe("/booking/[uid]/embed");
    expect(mask("/booking-successful/abc123")).toBe("/booking-successful/[uid]");
    expect(mask("/reschedule/abc123")).toBe("/reschedule/[uid]");
    expect(mask("/d/secret-token/30min")).toBe("/d/[link]/30min");
    expect(mask("/pro/30min")).toBe("/pro/30min");
  });
});

describe("Simple Analytics booking events", () => {
  const push = (event: { name: string; data: Record<string, unknown> }): unknown =>
    (testWindow.$pushEvent as (event: { name: string; data: Record<string, unknown> }) => unknown)(event);

  it("sends booking events with their metadata", () => {
    const saEvent = vi.fn();
    testWindow.sa_event = saEvent;
    run(pushEventScript.content, { "data-booking-events": "{BOOKING_EVENTS}" });

    push({
      name: "bookingSuccessfulV2",
      data: { data: { eventTypeId: 3, status: "ACCEPTED", paymentRequired: false, isRecurring: false } },
    });
    push({ name: "rescheduleBookingSuccessfulV2", data: { data: { eventTypeId: 3 } } });
    push({ name: "bookingCancelled", data: { data: { eventType: { id: 3 } } } });
    push({ name: "linkReady", data: { data: {} } });

    expect(saEvent.mock.calls).toEqual([
      [
        "booking_completed",
        { event_type_id: 3, status: "ACCEPTED", payment_required: false, is_recurring: false },
      ],
      ["booking_rescheduled", { event_type_id: 3 }],
      ["booking_cancelled", { event_type_id: 3 }],
    ]);
  });

  it("sends nothing when booking events are turned off", () => {
    const saEvent = vi.fn();
    testWindow.sa_event = saEvent;
    run(pushEventScript.content, { "data-booking-events": "false" });
    push({ name: "bookingSuccessfulV2", data: { data: { eventTypeId: 3 } } });
    expect(saEvent).not.toHaveBeenCalled();
  });
});
