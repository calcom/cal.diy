import { describe, it, expect } from "vitest";
import z from "zod";

import { excludeOrRequireEmailSchema, signupSchema } from "./zod-utils";

describe("signupSchema password validation (isPasswordValid duplicate)", () => {
  const parsePassword = (password: string) =>
    signupSchema.safeParse({ email: "test@example.com", password });

  describe("ASCII passwords", () => {
    it("accepts a valid ASCII password", () => {
      expect(parsePassword("Abcdefg1").success).toBe(true);
    });

    it("rejects a password missing uppercase", () => {
      expect(parsePassword("abcdefg1").success).toBe(false);
    });

    it("rejects a password missing lowercase", () => {
      expect(parsePassword("ABCDEFG1").success).toBe(false);
    });

    it("rejects a password missing a digit", () => {
      expect(parsePassword("Abcdefgh").success).toBe(false);
    });

    it("rejects a password that is too short", () => {
      expect(parsePassword("Abcde1").success).toBe(false);
    });
  });

  describe("Unicode uppercase and lowercase recognition", () => {
    it("accepts Cyrillic uppercase and lowercase letters", () => {
      expect(parsePassword("Абвгдеж1").success).toBe(true);
    });

    it("accepts Greek uppercase and lowercase letters", () => {
      expect(parsePassword("Ωαβγδεζ1").success).toBe(true);
    });

    it("accepts accented Latin uppercase and lowercase", () => {
      expect(parsePassword("Éñabcde1").success).toBe(true);
    });

    it("rejects password with only Unicode lowercase and digits", () => {
      expect(parsePassword("абвгдеж1").success).toBe(false);
    });

    it("rejects password with only Unicode uppercase and digits", () => {
      expect(parsePassword("ΑΒΓΔΕΖΗ1").success).toBe(false);
    });
  });
});

describe("excludeOrRequireEmailSchema", () => {
  const parse = (input: string) => z.object({ v: excludeOrRequireEmailSchema }).safeParse({ v: input });

  describe("valid inputs", () => {
    it("accepts single TLD domains", () => {
      expect(parse("gmail.com").success).toBe(true);
    });

    it("accepts uppercase domains", () => {
      expect(parse("GMAIL.COM").success).toBe(true);
    });

    it("accepts multi-level TLD domains (co.uk)", () => {
      expect(parse("hotmail.co.uk").success).toBe(true);
    });

    it("accepts multi-level TLD domains (k12.us)", () => {
      expect(parse("mail.school.k12.us").success).toBe(true);
    });

    it("accepts full email addresses", () => {
      expect(parse("user@example.co.uk").success).toBe(true);
    });

    it("accepts @domain format", () => {
      expect(parse("@example.co.uk").success).toBe(true);
    });

    it("accepts multiple comma-separated entries", () => {
      expect(parse("gmail.com, @example.com, user@example.co.uk").success).toBe(true);
    });

    it("accepts domains with trailing comma (ignores empty entry)", () => {
      expect(parse("gmail.com, hotmail.co.uk,").success).toBe(true);
    });

    it("accepts domains with extra spaces", () => {
      expect(parse("  gmail.com  ,  hotmail.co.uk  ").success).toBe(true);
    });

    it("accepts domains with numbers and hyphens", () => {
      expect(parse("example123.com").success).toBe(true);
      expect(parse("my-domain.com").success).toBe(true);
    });

    it("accepts very short domains (min 2-char TLD)", () => {
      expect(parse("a.co").success).toBe(true);
    });

    it("accepts long multi-level domains", () => {
      expect(parse("example.co.uk.test.com").success).toBe(true);
    });

    it("accepts single-label domains and missing dots", () => {
      expect(parse("example").success).toBe(true);
      expect(parse("@example").success).toBe(true);
    });
  });

  describe("invalid inputs", () => {
    it("rejects invalid TLD lengths", () => {
      expect(parse("example.c").success).toBe(false);
    });

    it("rejects leading/trailing hyphens in labels", () => {
      expect(parse("-bad.com").success).toBe(false);
      expect(parse("bad-.com").success).toBe(false);
    });

    it("rejects leading/trailing dots and consecutive dots", () => {
      expect(parse(".bad.com").success).toBe(false);
      expect(parse("bad.com.").success).toBe(false);
      expect(parse("ex..ample.com").success).toBe(false);
    });

    it("allows empty input but rejects commas-only", () => {
      expect(parse("").success).toBe(true);
      expect(parse("   ").success).toBe(true);
      expect(parse(",,,").success).toBe(false);
    });

    it("rejects Unicode domains (ASCII-only)", () => {
      expect(parse("münchen.de").success).toBe(false);
    });
  });
});
