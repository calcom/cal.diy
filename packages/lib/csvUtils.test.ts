import { describe, expect, it } from "vitest";
import { sanitizeValue, objectsToCsv } from "./csvUtils";

describe("csvUtils", () => {
  describe("sanitizeValue", () => {
    it("should escape quotes by doubling them and wrap in quotes", () => {
      // "hello "world"" has 2 embedded quotes -> each becomes 2 = 4, plus 2 wrapping = 6 total
      expect(sanitizeValue('hello "world"')).toBe('"hello ""world"""');
    });

    it("should quote values containing commas", () => {
      expect(sanitizeValue("hello,world")).toBe('"hello,world"');
    });

    it("should quote values containing newlines", () => {
      expect(sanitizeValue("hello\nworld")).toBe('"hello\nworld"');
    });

    it("should quote values containing carriage returns (RFC 4180)", () => {
      expect(sanitizeValue("hello\rworld")).toBe('"hello\rworld"');
    });

    it("should quote values containing CRLF", () => {
      expect(sanitizeValue("hello\r\nworld")).toBe('"hello\r\nworld"');
    });

    it("should not quote simple values without special characters", () => {
      expect(sanitizeValue("hello world")).toBe("hello world");
    });

    it("should neutralize formula injection with = prefix", () => {
      expect(sanitizeValue("=1+1")).toBe("'=1+1");
    });

    it("should neutralize formula injection with + prefix", () => {
      expect(sanitizeValue("+1-1")).toBe("'+1-1");
    });

    it("should neutralize formula injection with - prefix", () => {
      expect(sanitizeValue("-SUM(A1:A10)")).toBe("'-SUM(A1:A10)");
    });

    it("should neutralize formula injection with @ prefix", () => {
      expect(sanitizeValue("@SUM(A1:A10)")).toBe("'@SUM(A1:A10)");
    });

    it("should neutralize formula injection with tab prefix", () => {
      expect(sanitizeValue("\tmalicious")).toBe("'\tmalicious");
    });

    it("should neutralize formula injection with carriage return prefix AND quote due to CR", () => {
      // \rmalicious -> '\rmalicious (prefix) -> "'\rmalicious" (quote due to CR)
      expect(sanitizeValue("\rmalicious")).toBe('"\'\rmalicious"');
    });

    it("should handle formula injection that also needs quoting (prefix + quote)", () => {
      // =1,2 -> '=1,2 (prefix) -> "'=1,2" (quote due to comma)
      expect(sanitizeValue("=1,2")).toBe('"\'=1,2"');
    });

    it("should handle empty string", () => {
      expect(sanitizeValue("")).toBe("");
    });

    it("should handle values with only safe characters", () => {
      expect(sanitizeValue("Safe Value 123")).toBe("Safe Value 123");
    });
  });

  describe("objectsToCsv", () => {
    it("should sanitize all values including headers", () => {
      const data = [
        { name: "John", email: "john@example.com" },
        { name: "Jane", email: "jane@example.com" },
      ];
      const csv = objectsToCsv(data);
      expect(csv).toContain("name,email");
      expect(csv).toContain("John,john@example.com");
    });

    it("should sanitize formula injection in data cells", () => {
      const data = [
        { name: "=1+1", email: "test@example.com" },
      ];
      const csv = objectsToCsv(data);
      // Formula should be neutralized
      expect(csv).toContain("'=1+1");
    });

    it("should sanitize carriage returns in data", () => {
      const data = [
        { name: "hello\rworld", email: "test@example.com" },
      ];
      const csv = objectsToCsv(data);
      // CR should be quoted
      expect(csv).toContain('"hello\rworld"');
    });

    it("should sanitize CRLF in data", () => {
      const data = [
        { name: "hello\r\nworld", email: "test@example.com" },
      ];
      const csv = objectsToCsv(data);
      // CRLF should be quoted
      expect(csv).toContain('"hello\r\nworld"');
    });
  });
});