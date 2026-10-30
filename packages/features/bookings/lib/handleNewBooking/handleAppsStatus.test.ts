import { describe, expect, it } from "vitest";

import type { AdditionalInformation, AppsStatus } from "@calcom/types/Calendar";
import type { EventResult } from "@calcom/types/EventManager";

import { handleAppsStatus } from "./handleAppsStatus";

function makeResult(
  type: string,
  appName: string,
  success: boolean,
  calError?: string
): EventResult<AdditionalInformation> {
  return { type, appName, success, calError, uid: "uid" } as unknown as EventResult<AdditionalInformation>;
}

function makeReqStatus(type: string, appName: string, success: number, failures: number): AppsStatus {
  return { type, appName, success, failures, errors: [] } as AppsStatus;
}

describe("handleAppsStatus", () => {
  it("sums failures when the same app type is aggregated across bookings", () => {
    const result = handleAppsStatus(
      [makeResult("google_calendar", "google-calendar", false, "current failure")],
      null,
      [makeReqStatus("google_calendar", "google-calendar", 0, 1)]
    );

    const gcal = result.find((s) => s.type === "google_calendar");
    expect(gcal?.failures).toBe(2);
    expect(gcal?.success).toBe(0);
  });

  it("does not hide a failure when a prior booking of the same type succeeded", () => {
    const result = handleAppsStatus(
      [makeResult("google_calendar", "google-calendar", false, "current failure")],
      null,
      [makeReqStatus("google_calendar", "google-calendar", 1, 0)]
    );

    const gcal = result.find((s) => s.type === "google_calendar");
    expect(gcal?.success).toBe(1);
    expect(gcal?.failures).toBe(1);
  });

  it("keeps success and failures symmetric and separates distinct app types", () => {
    const result = handleAppsStatus(
      [
        makeResult("google_calendar", "google-calendar", true),
        makeResult("zoom_video", "zoom", false, "zoom failure"),
      ],
      null,
      [
        makeReqStatus("google_calendar", "google-calendar", 1, 0),
        makeReqStatus("zoom_video", "zoom", 0, 1),
      ]
    );

    const gcal = result.find((s) => s.type === "google_calendar");
    const zoom = result.find((s) => s.type === "zoom_video");
    expect(gcal).toMatchObject({ success: 2, failures: 0 });
    expect(zoom).toMatchObject({ success: 0, failures: 2 });
  });

  it("returns the mapped result status when there is no prior status to aggregate", () => {
    const result = handleAppsStatus(
      [makeResult("google_calendar", "google-calendar", false, "boom")],
      null,
      undefined
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: "google_calendar", success: 0, failures: 1 });
  });
});
