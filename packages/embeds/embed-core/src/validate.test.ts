import { describe, expect, it } from "vitest";
import { validate } from "./validate";

describe("validate()", () => {
  describe("calLink type validation", () => {
    const calLinkSchema = {
      required: true,
      props: {
        calLink: {
          required: true,
          type: "calLink" as const,
        },
      },
    };

    it("should pass for valid calLinks", () => {
      const validLinks = [
        "john-doe/30min",
        "team/event-type",
        // Regression check: old regex wrongly rejected links with `https://` in query params
        "team/link?redirect=https://example.com",
        // Leading/trailing whitespace around a valid slug should be trimmed and accepted
        "  john-doe/30min  ",
      ];

      validLinks.forEach((calLink) => {
        expect(() => validate({ calLink }, calLinkSchema)).not.toThrow();
      });
    });

    it("should throw for invalid calLinks", () => {
      const invalidLinks = [
        "/john-doe/30min", // absolute path
        "http://cal.com/john", // http scheme
        "https://cal.com/john", // https scheme
        "HTTPS://cal.com/john", // uppercase HTTPS (case-insensitive check)
        "HTTP://cal.com/john", // uppercase HTTP (case-insensitive check)
        "ftp://cal.com/john", // ftp scheme
        "mailto:john@example.com", // mailto scheme
        "javascript:alert(1)", // javascript scheme (XSS vector)
        "", // empty string
        "   ", // whitespace-only
        "   https://cal.com/john", // whitespace before URL
        "   /john-doe/30min", // whitespace before absolute path
        "vscode://extension", // custom URI scheme
        "\\john-doe/30min", // backslash
        "\\\\evil.com", // double backslash
      ];

      invalidLinks.forEach((calLink) => {
        expect(() => validate({ calLink }, calLinkSchema)).toThrow(
          '"calLink" is of wrong type.Expected type "calLink"'
        );
      });
    });
  });

  describe("required field validation", () => {
    it("should throw when a required prop is missing", () => {
      const schema = {
        required: true,
        props: {
          calLink: {
            required: true,
            type: "calLink" as const,
          },
        },
      };
      expect(() => validate({}, schema)).toThrow('"calLink" is required');
    });

    it("should not throw when an optional prop is missing", () => {
      const schema = {
        required: true,
        props: {
          calLink: {
            required: true,
            type: "calLink" as const,
          },
          config: {
            required: false,
            type: Object,
          },
        },
      };
      expect(() => validate({ calLink: "john/30min" }, schema)).not.toThrow();
    });
  });

  describe("string type validation", () => {
    const stringSchema = {
      required: true,
      props: {
        theme: {
          required: false,
          type: "string" as const,
        },
      },
    };

    it("should pass for valid string values", () => {
      const validValues = ["dark", "light", "auto"];

      validValues.forEach((theme) => {
        expect(() => validate({ theme }, stringSchema)).not.toThrow();
      });
    });

    it("should throw for non-string values", () => {
      const invalidValues = [123, true, {}, []];

      invalidValues.forEach((theme) => {
        expect(() => validate({ theme }, stringSchema)).toThrow(
          '"theme" is of wrong type.Expected type "string"'
        );
      });
    });
  });

  describe("union type (array) validation", () => {
    const unionSchema = {
      required: true,
      props: {
        value: {
          required: true,
          type: ["string", "function"] as const,
        },
      },
    };

    it("should pass for values matching any type in the union", () => {
      const validValues = ["test string", () => {}];

      validValues.forEach((value) => {
        expect(() => validate({ value }, unionSchema)).not.toThrow();
      });
    });

    it("should throw for values matching neither type in the union", () => {
      const invalidValues = [123, true, {}, []];

      invalidValues.forEach((value) => {
        expect(() => validate({ value }, unionSchema)).toThrow(
          '"value" is of wrong type.Expected type "string,function"'
        );
      });
    });
  });
});
