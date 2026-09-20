import dayjs from "@calcom/dayjs";
import { describe, expect, it, vi } from "vitest";
import { getBookingPrefetchWindow } from "./util";

vi.mock("@calcom/features/eventtypes/lib/getDefinedBufferTimes", () => ({
  getDefinedBufferTimes: vi.fn().mockReturnValue([5, 15, 45, 30]),
}));

describe("getBookingPrefetchWindow", () => {
  it("widens the booking prefetch window by the max defined buffer on both sides", () => {
    const startTime = dayjs("2026-06-11T09:20:00.000Z").toDate();
    const endTime = dayjs("2026-06-11T10:00:00.000Z").toDate();

    const { startDate, endDate } = getBookingPrefetchWindow(startTime, endTime);

    expect(startDate.getTime()).toBe(startTime.getTime() - 45 * 60 * 1000);
    expect(endDate.getTime()).toBe(endTime.getTime() + 45 * 60 * 1000);
  });
});
