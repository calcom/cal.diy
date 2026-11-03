import { describe, expect, it } from "vitest";
import { guessEventLocationType } from "./locations";

describe("guessEventLocationType", () => {
  it("recognizes standard meet.google.com links as Google Meet", () => {
    const result = guessEventLocationType("https://meet.google.com/abc-defg-hij");
    expect(result).toBeDefined();
    expect(result?.label).toBe("Google Meet");
    expect(result?.type).toBe("integrations:google:meet");
  });

  it("recognizes meet.google.com links with query parameters", () => {
    const result = guessEventLocationType("https://meet.google.com/abc-defg-hij?authuser=1&hs=179");
    expect(result).toBeDefined();
    expect(result?.label).toBe("Google Meet");
  });

  it("recognizes www.meet.google.com links", () => {
    const result = guessEventLocationType("https://www.meet.google.com/abc-defg-hij");
    expect(result).toBeDefined();
    expect(result?.label).toBe("Google Meet");
  });

  it("still recognizes other provider URLs correctly", () => {
    const facetime = guessEventLocationType("https://facetime.apple.com/join/v12345");
    expect(facetime).toBeDefined();
    expect(facetime?.label).toBe("Facetime");

    const skype = guessEventLocationType("https://join.skype.com/abcdef123");
    expect(skype).toBeDefined();
    expect(skype?.label).toBe("Skype");
  });

  it("returns undefined/null for non-matching URLs", () => {
    const unknown = guessEventLocationType("https://example.com/meeting/123");
    expect(unknown).toBeUndefined();
  });
});
