import { describe, expect, it } from "vitest";
import { parseHostnameList } from "./constants";

describe("parseHostnameList", () => {
  it("should return empty list when unset or blank", () => {
    expect(parseHostnameList(undefined)).toEqual([]);
    expect(parseHostnameList("")).toEqual([]);
    expect(parseHostnameList("   ")).toEqual([]);
  });

  it("should parse the documented quoted form", () => {
    expect(parseHostnameList('"cal.local:3000","localhost:3000"')).toEqual([
      "cal.local:3000",
      "localhost:3000",
    ]);
  });

  it("should parse bare comma-separated hostnames", () => {
    expect(parseHostnameList("subdomain.domain.com,localhost:3000")).toEqual([
      "subdomain.domain.com",
      "localhost:3000",
    ]);
  });

  it("should parse a single bare hostname", () => {
    expect(parseHostnameList("subdomain.domain.com")).toEqual(["subdomain.domain.com"]);
  });

  it("should tolerate mixed quoting and whitespace", () => {
    expect(parseHostnameList(' "subdomain.domain.com" , localhost:3000 ')).toEqual([
      "subdomain.domain.com",
      "localhost:3000",
    ]);
  });

  it("should drop empty entries", () => {
    expect(parseHostnameList("subdomain.domain.com,")).toEqual(["subdomain.domain.com"]);
  });

  it("should strip an outer bracket wrapper when the value is not valid JSON", () => {
    // Trailing commas make JSON.parse fail; the entries must not keep the brackets.
    expect(parseHostnameList('["auth",]')).toEqual(["auth"]);
    expect(parseHostnameList('["auth", "docs",]')).toEqual(["auth", "docs"]);
    expect(parseHostnameList("[auth,docs]")).toEqual(["auth", "docs"]);
  });

  it("should trim whitespace that was inside the quotes", () => {
    expect(parseHostnameList('" auth ",docs')).toEqual(["auth", "docs"]);
  });

  it("should keep the brackets of a bare IPv6 literal", () => {
    expect(parseHostnameList("[::1]")).toEqual(["[::1]"]);
    expect(parseHostnameList("[2001:db8::1]")).toEqual(["[2001:db8::1]"]);
    expect(parseHostnameList("[::1]:3000")).toEqual(["[::1]:3000"]);
  });

  it("should parse comma-separated bracketed IPv6 hosts as separate entries", () => {
    expect(parseHostnameList("[::1],[::2]")).toEqual(["[::1]", "[::2]"]);
    expect(parseHostnameList("[::1],[::2]:3000,localhost:3000")).toEqual([
      "[::1]",
      "[::2]:3000",
      "localhost:3000",
    ]);
  });
});
