import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isSafeUrlToLoadResourceFrom } from "./getSafeRedirectUrl";

vi.mock("./constants", () => ({
  WEBAPP_URL: "https://app.cal.com",
  EMBED_LIB_URL: "https://embed.com",
}));

describe("isSafeUrlToLoadResourceFrom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should return true for URLs with same TLD+1 as WEBAPP_URL", () => {
    expect(isSafeUrlToLoadResourceFrom("https://acme.cal.com/path")).toBe(true);
    expect(isSafeUrlToLoadResourceFrom("http://dunder.cal.com?query=1")).toBe(true);
    expect(isSafeUrlToLoadResourceFrom("https://cal.com/path")).toBe(true);
  });

  it("should return true for URLs with same TLD+1 as EMBED_LIB_URL", () => {
    expect(isSafeUrlToLoadResourceFrom("https://test.embed.com/path")).toBe(true);
    expect(isSafeUrlToLoadResourceFrom("http://embed.com/script.js")).toBe(true);
  });

  it("should return true for localhost URLs", () => {
    expect(isSafeUrlToLoadResourceFrom("http://localhost:3000")).toBe(true);
    expect(isSafeUrlToLoadResourceFrom("http://127.0.0.1:3000")).toBe(true);
  });

  it("should return false for different TLD+1", () => {
    expect(isSafeUrlToLoadResourceFrom("https://malicious1.com")).toBe(false);
    expect(isSafeUrlToLoadResourceFrom("https://malicious2.com")).toBe(false);
  });

  it("should return false for non-http/https protocols", () => {
    expect(isSafeUrlToLoadResourceFrom("ftp://example.com")).toBe(false);
    expect(isSafeUrlToLoadResourceFrom("javascript:alert(1)")).toBe(false);
    expect(isSafeUrlToLoadResourceFrom("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("should return false for invalid URLs", () => {
    expect(isSafeUrlToLoadResourceFrom("not-a-url")).toBe(false);
    expect(isSafeUrlToLoadResourceFrom("http://")).toBe(false);
  });
});
