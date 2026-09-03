import { describe, expect, it } from "vitest";
import {
  getSeatCalendarReferences,
  OFFICE365_CALENDAR_TYPE,
  withSeatCalendarReferences,
} from "./seatCalendarReferences";

describe("seatCalendarReferences", () => {
  it("stores and reads per-seat calendar references without dropping existing metadata", () => {
    const metadata = withSeatCalendarReferences({
      metadata: {
        source: "booking-form",
      },
      integration: OFFICE365_CALENDAR_TYPE,
      references: [
        {
          type: OFFICE365_CALENDAR_TYPE,
          uid: "outlook-event-id",
          credentialId: 10,
          externalCalendarId: "calendar-id",
        },
      ],
    });

    expect(metadata.source).toBe("booking-form");
    expect(getSeatCalendarReferences(metadata, OFFICE365_CALENDAR_TYPE)).toEqual([
      {
        type: OFFICE365_CALENDAR_TYPE,
        uid: "outlook-event-id",
        meetingId: null,
        thirdPartyRecurringEventId: null,
        meetingPassword: null,
        meetingUrl: null,
        externalCalendarId: "calendar-id",
        credentialId: 10,
        delegationCredentialId: null,
      },
    ]);
  });

  it("returns an empty list when the metadata has no references for that integration", () => {
    expect(getSeatCalendarReferences({ source: "booking-form" }, OFFICE365_CALENDAR_TYPE)).toEqual([]);
  });
});
