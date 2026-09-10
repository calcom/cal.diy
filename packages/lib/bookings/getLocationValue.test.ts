import { describe, expect, it, vi, beforeEach } from "vitest";

import { getLocationValue } from "./getLocationValue";

const warnMock = vi.fn();
vi.mock("@calcom/lib/logger", () => ({
  default: { warn: (...args: unknown[]) => warnMock(...args) },
}));

describe("getLocationValue", () => {
  beforeEach(() => {
    warnMock.mockClear();
  });

  it("returns top-level location when provided", () => {
    expect(getLocationValue("integrations:google:meet", undefined)).toBe("integrations:google:meet");
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("returns top-level location over responseLocation", () => {
    expect(getLocationValue("phone:123", "integrations:zoom:video")).toBe("phone:123");
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("returns responseLocation when it is a string", () => {
    expect(getLocationValue(undefined, "integrations:zoom:video")).toBe("integrations:zoom:video");
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("returns responseLocation.value when it is a string", () => {
    expect(getLocationValue(undefined, { value: "integrations:daily:video" })).toBe(
      "integrations:daily:video"
    );
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("returns undefined and does not warn when both args are undefined", () => {
    expect(getLocationValue(undefined, undefined)).toBeUndefined();
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("returns undefined and warns when responseLocation is an object with non-string value", () => {
    expect(getLocationValue(undefined, { value: 123 })).toBeUndefined();
    expect(warnMock).toHaveBeenCalledOnce();
  });

  it("returns undefined and warns when responseLocation is an object with null value", () => {
    expect(getLocationValue(undefined, { value: null })).toBeUndefined();
    expect(warnMock).toHaveBeenCalledOnce();
  });

  it("returns undefined and warns when responseLocation is an object without value key", () => {
    expect(getLocationValue(undefined, { notValue: "something" } as { value: unknown })).toBeUndefined();
    expect(warnMock).toHaveBeenCalledOnce();
  });
});
