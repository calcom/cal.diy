import { describe, expect, it } from "vitest";
import { isRerouting, shouldIgnoreContactOwner } from "./utils";

describe("isRerouting", () => {
  it("should return true when both rescheduleUid and routedTeamMemberIds are present", () => {
    const result = isRerouting({
      rescheduleUid: "123",
      routedTeamMemberIds: [1, 2],
    });
    expect(result).toBe(true);
  });

  it("should return false when rescheduleUid is null", () => {
    const result = isRerouting({
      rescheduleUid: null,
      routedTeamMemberIds: [1, 2],
    });
    expect(result).toBe(false);
  });

  it("should return false when routedTeamMemberIds is null", () => {
    const result = isRerouting({
      rescheduleUid: "123",
      routedTeamMemberIds: null,
    });
    expect(result).toBe(false);
  });
});

describe("shouldIgnoreContactOwner", () => {
  it("should return true when skipContactOwner is true", () => {
    const result = shouldIgnoreContactOwner({
      skipContactOwner: true,
      rescheduleUid: null,
      routedTeamMemberIds: null,
    });
    expect(result).toBe(true);
  });

  it("should return true when rerouting", () => {
    const result = shouldIgnoreContactOwner({
      skipContactOwner: false,
      rescheduleUid: "123",
      routedTeamMemberIds: [1, 2],
    });
    expect(result).toBe(true);
  });

  it("should return false when skipContactOwner is false and not rerouting", () => {
    const result = shouldIgnoreContactOwner({
      skipContactOwner: false,
      rescheduleUid: null,
      routedTeamMemberIds: null,
    });
    expect(result).toBe(false);
  });
});
