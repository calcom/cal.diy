import { describe, expect, it } from "vitest";
import { getValidRhfFieldName } from "./getValidRhfFieldName";

describe("getValidRhfFieldName", () => {
  it("should not convert to lowercase", () => {
    expect(getValidRhfFieldName("Hello")).toEqual("Hello");
    expect(getValidRhfFieldName("HELLO")).toEqual("HELLO");
  });

  it("should convert spaces and any other special character to -", () => {
    expect(getValidRhfFieldName("hello there")).toEqual("hello-there");
    expect(getValidRhfFieldName("hello$there")).toEqual("hello-there");
    expect(getValidRhfFieldName("$hello$there")).toEqual("-hello-there");
    expect(getValidRhfFieldName("$hello.there")).toEqual("-hello-there");
  });

  // So that user can freely add spaces and any other character iteratively and it gets converted to - and he can add more characters.
  // Trailing dashes are removed to ensure valid field names
  it("should remove trailing dashes but keep leading dashes.", () => {
    expect(getValidRhfFieldName("hello-there-")).toEqual("hello-there");
    expect(getValidRhfFieldName("-hello-there")).toEqual("-hello-there");
    expect(getValidRhfFieldName("$hello-there-")).toEqual("-hello-there");
  });

  it("should not remove underscore from start and end.", () => {
    expect(getValidRhfFieldName("hello-there_")).toEqual("hello-there_");
    expect(getValidRhfFieldName("_hello-there_")).toEqual("_hello-there_");
    expect(getValidRhfFieldName("$hello-there_")).toEqual("-hello-there_");
  });

  it("should remove unicode and emoji characters", () => {
    expect(getValidRhfFieldName("Hello 📚🕯️®️ There")).toEqual("Hello---------There");
    // When all characters are emojis/special chars, they become dashes which are then removed
    expect(getValidRhfFieldName("📚🕯️®️")).toEqual("");
  });

  it("should keep numbers as is", () => {
    expect(getValidRhfFieldName("hellothere123")).toEqual("hellothere123");
    expect(getValidRhfFieldName("321hello there123")).toEqual("321hello-there123");
    expect(getValidRhfFieldName("hello$there")).toEqual("hello-there");
  });

  it("should not modify system field names", () => {
    // System fields should remain unchanged as they don't contain invalid characters or trailing dashes
    expect(getValidRhfFieldName("name")).toEqual("name");
    expect(getValidRhfFieldName("email")).toEqual("email");
    expect(getValidRhfFieldName("location")).toEqual("location");
    expect(getValidRhfFieldName("title")).toEqual("title");
    expect(getValidRhfFieldName("notes")).toEqual("notes");
    expect(getValidRhfFieldName("guests")).toEqual("guests");
    expect(getValidRhfFieldName("rescheduleReason")).toEqual("rescheduleReason");
    expect(getValidRhfFieldName("smsReminderNumber")).toEqual("smsReminderNumber");
    expect(getValidRhfFieldName("attendeePhoneNumber")).toEqual("attendeePhoneNumber");
    expect(getValidRhfFieldName("aiAgentCallPhoneNumber")).toEqual("aiAgentCallPhoneNumber");
  });
});
