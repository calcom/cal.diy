import { describe, expect, it } from "vitest";

import { objectsToCsv, sanitizeValue } from "./csvUtils";

describe("csvUtils", () => {
  describe("sanitizeValue", () => {
    it("escapes quotes by doubling them and wrapping in quotes", () => {
      expect(sanitizeValue('hello "world"')).toBe('"hello ""world"""');
    });

    it("quotes values containing commas", () => {
      expect(sanitizeValue("hello,world")).toBe('"hello,world"');
    });

    it("quotes values containing newlines", () => {
      expect(sanitizeValue("hello\nworld")).toBe('"hello\nworld"');
    });

    it("quotes values containing bare carriage returns per RFC 4180", () => {
      expect(sanitizeValue("hello\rworld")).toBe('"hello\rworld"');
    });

    it("quotes values containing CRLF sequences", () => {
      expect(sanitizeValue("hello\r\nworld")).toBe('"hello\r\nworld"');
    });

    it("does not quote values without special characters", () => {
      expect(sanitizeValue("hello world")).toBe("hello world");
    });

    it("neutralizes formula injection with = prefix", () => {
      expect(sanitizeValue("=1+1")).toBe("'=1+1");
    });

    it("neutralizes formula injection with + prefix", () => {
      expect(sanitizeValue("+1-1")).toBe("'+1-1");
    });

    it("neutralizes formula injection with - prefix on string values", () => {
      expect(sanitizeValue("-SUM(A1:A10)")).toBe("'-SUM(A1:A10)");
    });

    it("neutralizes formula injection with @ prefix", () => {
      expect(sanitizeValue("@SUM(A1:A10)")).toBe("'@SUM(A1:A10)");
    });

    it("neutralizes formula injection with tab prefix", () => {
      expect(sanitizeValue("\tmalicious")).toBe("'\tmalicious");
    });

    it("neutralizes formula injection with carriage return prefix and quotes due to CR", () => {
      expect(sanitizeValue("\rmalicious")).toBe('"\'\rmalicious"');
    });

    it("handles formula injection containing commas by prefixing and quoting", () => {
      expect(sanitizeValue("=1,2")).toBe("\"'=1,2\"");
    });

    it("handles empty strings", () => {
      expect(sanitizeValue("")).toBe("");
    });
  });

  describe("objectsToCsv", () => {
    it("converts array of objects to CSV string with sanitized headers and rows", () => {
      const data = [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", email: "bob@example.com" },
      ];
      const csv = objectsToCsv(data);
      expect(csv).toBe("name,email\nAlice,alice@example.com\nBob,bob@example.com");
    });

    it("neutralizes formula injection in table cell data", () => {
      const data = [{ name: "=1+1", email: "test@example.com" }];
      const csv = objectsToCsv(data);
      expect(csv).toContain("'=1+1");
    });

    it("quotes values with carriage returns in table cell data", () => {
      const data = [{ name: "hello\rworld", email: "test@example.com" }];
      const csv = objectsToCsv(data);
      expect(csv).toContain('"hello\rworld"');
    });

    it("preserves finite numeric values (positive, negative, float) without adding formula prefixes", () => {
      const data = [{ id: 1, balance: -5, delta: 10.5, zero: 0 }];
      const csv = objectsToCsv(data);
      expect(csv).toBe("id,balance,delta,zero\n1,-5,10.5,0");
    });

    it("distinguishes numbers from numeric-looking strings starting with minus sign", () => {
      const data = [
        {
          numVal: -42,
          strVal: "-42",
          formulaStr: "-cmd|' /C calc'!A0",
        },
      ];
      const csv = objectsToCsv(data);
      expect(csv).toBe("numVal,strVal,formulaStr\n-42,'-42,'-cmd|' /C calc'!A0");
    });

    it("preserves CSV record boundaries and quotes with embedded special characters across multiple rows", () => {
      const data = [
        { title: "Standard Event", notes: "No special chars" },
        { title: "Event with, comma", notes: "First line\nSecond line" },
        { title: 'Event with "quotes"', notes: "CR\rinside" },
      ];
      const csv = objectsToCsv(data);
      const lines = csv.split("\n");

      expect(lines[0]).toBe("title,notes");
      expect(lines[1]).toBe("Standard Event,No special chars");
      // Multi-line and quoted values
      expect(csv).toContain('"Event with, comma"');
      expect(csv).toContain('"First line\nSecond line"');
      expect(csv).toContain('"Event with ""quotes"""');
      expect(csv).toContain('"CR\rinside"');
    });

    it("returns empty string when data array is empty", () => {
      expect(objectsToCsv([])).toBe("");
    });
  });
});
