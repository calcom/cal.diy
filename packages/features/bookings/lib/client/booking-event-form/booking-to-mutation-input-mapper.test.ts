import { describe, expect, it } from "vitest";

import { mapBookingToMutationInput } from "./booking-to-mutation-input-mapper";

describe("mapBookingToMutationInput", () => {
  const mockEvent = {
    id: 1,
    length: 30,
    slug: "test-event",
    schedulingType: null,
    recurringEvent: null,
  };

  const baseOptions = {
    event: mockEvent,
    date: "2023-01-01T10:00:00Z",
    duration: 30,
    timeZone: "UTC",
    language: "en",
    rescheduleUid: undefined,
    rescheduledBy: undefined,
    username: "testuser",
    routingFormSearchParams: {},
  };

  it("should extract location from responses when it is a string", () => {
    const values = {
      responses: {
        name: "John Doe",
        email: "john@example.com",
        location: "integrations:google:meet",
      },
    };

    const result = mapBookingToMutationInput({
      ...baseOptions,
      values,
    });

    expect(result.location).toBe("integrations:google:meet");
  });

  it("should extract location from responses when it is an object with value", () => {
    const values = {
      responses: {
        name: "John Doe",
        email: "john@example.com",
        location: {
          value: "integrations:zoom:video",
          optionValue: "",
        },
      },
    };

    const result = mapBookingToMutationInput({
      ...baseOptions,
      values,
    });

    expect(result.location).toBe("integrations:zoom:video");
  });

  it("should use top-level location if present", () => {
    const values = {
      location: "phone:1234567890",
      responses: {
        name: "John Doe",
        email: "john@example.com",
        location: "integrations:google:meet",
      },
    };

    const result = mapBookingToMutationInput({
      ...baseOptions,
      values,
    });

    expect(result.location).toBe("phone:1234567890");
  });

  it("should handle missing location", () => {
    const values = {
      responses: {
        name: "John Doe",
        email: "john@example.com",
      },
    };

    const result = mapBookingToMutationInput({
      ...baseOptions,
      values,
    });

    expect(result.location).toBeUndefined();
  });
});
