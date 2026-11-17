import dayjs from "@calcom/dayjs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { stringToDayjs } from "./index";

beforeAll(() => {
  vi.setSystemTime(dayjs.utc("2021-06-20T11:59:59Z").toDate());
});

describe("Tests the parsing logic", () => {
  it("when supplied with no timezone data", async () => {
    const date = stringToDayjs("2024-02-27T17:00:00");
    expect(date.toISOString()).toBe("2024-02-27T17:00:00.000Z");
  });

  it("when supplied with UTC", async () => {
    const date = stringToDayjs("2024-02-27T17:00:00Z");
    expect(date.year()).toBe(2024);
    expect(date.month()).toBe(1);
    expect(date.date()).toBe(27);
    expect(date.hour()).toBe(17);
    expect(date.minute()).toBe(0);
    expect(date.second()).toBe(0);
    expect(date.utcOffset()).toBe(0);
  });

  it("when supplied with UTC- timezone", async () => {
    const date = stringToDayjs("2024-02-27T17:00:00-05:00");
    expect(date.year()).toBe(2024);
    expect(date.month()).toBe(1);
    expect(date.date()).toBe(27);
    expect(date.hour()).toBe(17);
    expect(date.minute()).toBe(0);
    expect(date.second()).toBe(0);
    expect(date.utcOffset()).toBe(-300);
    expect(date.toISOString()).toBe("2024-02-27T22:00:00.000Z");
  });

  it("when supplied with UTC+ timezone", async () => {
    const date = stringToDayjs("2024-02-27T17:00:00+05:00");
    expect(date.year()).toBe(2024);
    expect(date.month()).toBe(1);
    expect(date.date()).toBe(27);
    expect(date.hour()).toBe(17);
    expect(date.minute()).toBe(0);
    expect(date.second()).toBe(0);
    expect(date.utcOffset()).toBe(300);
    expect(date.toISOString()).toBe("2024-02-27T12:00:00.000Z");
  });
});
