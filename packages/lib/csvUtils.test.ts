import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadAsCsv, objectsToCsv, sanitizeValue } from "./csvUtils";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sanitizeValue", () => {
  it("returns simple values unchanged", () => {
    expect(sanitizeValue("hello")).toBe("hello");
  });

  it("wraps values with commas in quotes", () => {
    expect(sanitizeValue("hello,world")).toBe('"hello,world"');
  });

  it("wraps values with newlines in quotes", () => {
    expect(sanitizeValue("hello\nworld")).toBe('"hello\nworld"');
  });

  it("wraps values with carriage returns in quotes", () => {
    expect(sanitizeValue("hello\rworld")).toBe('"hello\rworld"');
  });

  it("wraps values with CRLF in quotes", () => {
    expect(sanitizeValue("hello\r\nworld")).toBe('"hello\r\nworld"');
  });

  it("doubles quotes and wraps values containing double quotes", () => {
    expect(sanitizeValue('he said "hello"')).toBe('"he said ""hello"""');
  });

  it("handles values with quotes and commas", () => {
    expect(sanitizeValue('he said "hello", world')).toBe('"he said ""hello"", world"');
  });

  it("prefixes formula-trigger characters with single quote to prevent injection", () => {
    expect(sanitizeValue("=HYPERLINK(http://evil.com)")).toBe("'=HYPERLINK(http://evil.com)");
    expect(sanitizeValue("+SUM(A1:A10)")).toBe("'+SUM(A1:A10)");
    expect(sanitizeValue("-SUM(A1:A10)")).toBe("'-SUM(A1:A10)");
    expect(sanitizeValue("@SUM(A1:A10)")).toBe("'@SUM(A1:A10)");
  });

  it("keeps the formula prefix on values that also need quoting", () => {
    // A formula containing a comma must still get the ' prefix: quoting alone
    // does not stop Excel/Sheets from evaluating it.
    expect(sanitizeValue("=SUM(1,1)")).toBe('"\'=SUM(1,1)"');
    expect(sanitizeValue('=HYPERLINK("http://evil.com","click")')).toBe(
      '"\'=HYPERLINK(""http://evil.com"",""click"")"'
    );
    expect(sanitizeValue("=1\n+2")).toBe('"\'=1\n+2"');
  });

  it("does not prefix non-formula values", () => {
    expect(sanitizeValue("hello")).toBe("hello");
    expect(sanitizeValue("123")).toBe("123");
    expect(sanitizeValue("john@example.com")).toBe("john@example.com");
  });
});

describe("objectsToCsv", () => {
  it("handles values with carriage returns without breaking rows", () => {
    const data = [
      { name: "Alice", note: "hello\rworld" },
      { name: "Bob", note: "normal" },
    ];
    const csv = objectsToCsv(data);
    const lines = csv.split("\n");
    // Should have exactly 3 lines: header + 2 data rows
    // Without the fix, "hello\rworld" would be unquoted and \r would
    // split the first data row into two lines
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("name,note");
    expect(lines[1]).toBe('Alice,"hello\rworld"');
    expect(lines[2]).toBe("Bob,normal");
  });

  it("handles values with newlines correctly", () => {
    const data = [
      { name: "Alice", note: "hello\nworld" },
      { name: "Bob", note: "normal" },
    ];
    const csv = objectsToCsv(data);
    // \n inside a quoted field is part of the field, so splitting by \n
    // gives more lines, but the quoted field contains the newline
    const lines = csv.split("\n");
    // header + "Alice,"hello\n + world"" + "Bob,normal" = 4 lines when split by \n
    // But the \n inside the quote is a field newline, not a record separator
    // This test verifies the value IS quoted (the key fix for \r)
    expect(lines[0]).toBe("name,note");
    expect(lines[1]).toBe('Alice,"hello');
    expect(lines[2]).toBe('world"');
    expect(lines[3]).toBe("Bob,normal");
  });
});

describe("downloadAsCsv", () => {
  it("creates a Blob with the correct CSV MIME type", () => {
    const createObjectURLSpy = vi.fn().mockReturnValue("blob:test");
    const revokeObjectURLSpy = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: createObjectURLSpy,
      revokeObjectURL: revokeObjectURLSpy,
    });

    const clickSpy = vi.fn();
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue({ click: clickSpy }),
    });

    downloadAsCsv([{ name: "Alice" }], "test.csv");

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/csv;charset=utf-8");
  });
});
