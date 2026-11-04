import { describe, expect, it } from "vitest";
import { randomString } from "./random";

describe("Random util tests", () => {
  describe("fn: randomString", () => {
    it("should return a random string of a given length", () => {
      const length = 10;

      const result = randomString(length);

      expect(result).toHaveLength(length);
    });

    it("should return a random string of a default length", () => {
      const length = 12;

      const result = randomString();

      expect(result).toHaveLength(length);
    });

    it("should return a random string of a given length using alphanumeric characters", () => {
      const length = 10;

      const result = randomString(length);

      expect(result).toMatch(/^[a-zA-Z0-9]+$/);
      expect(result).toHaveLength(length);
    });
  });
});
