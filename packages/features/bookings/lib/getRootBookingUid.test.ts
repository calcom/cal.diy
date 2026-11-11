import { describe, expect, it } from "vitest";

import { getRootBookingUid } from "./getRootBookingUid";

describe("getRootBookingUid", () => {
  it("returns the persisted root when present", () => {
    expect(
      getRootBookingUid({
        uid: "new-uid",
        rootBookingUid: "original-uid",
      })
    ).toBe("original-uid");
  });

  it("falls back to uid when root is missing", () => {
    expect(getRootBookingUid({ uid: "original-uid", rootBookingUid: null })).toBe("original-uid");
  });
});
