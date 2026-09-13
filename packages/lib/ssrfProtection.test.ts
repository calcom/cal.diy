import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.hoisted(() => vi.fn());

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: lookupMock,
  },
}));

// Default mock for Cal.diy SaaS (IS_SELF_HOSTED = false)
vi.mock("@calcom/lib/constants", () => ({
  IS_SELF_HOSTED: false,
  IS_PRODUCTION: false,
}));

import {
  fetchWithSSRFProtection,
  isBlockedHostname,
  isPrivateIP,
  isTrustedInternalUrl,
  validateUrlForSSRFSync,
} from "./ssrfProtection";

describe("fetchWithSSRFProtection", () => {
  beforeEach(() => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each([
    "https://127.0.0.1/calendar.ics",
    "https://[::1]/calendar.ics",
    "https://10.0.0.1/calendar.ics",
    "https://169.254.169.254/latest/meta-data/",
    "http://example.com/calendar.ics",
    "not-a-url",
  ])("blocks an unsafe destination before fetching: %s", async (url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWithSSRFProtection(url)).rejects.toThrow("URL blocked by SSRF protection");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks a hostname resolving to a private address before fetching", async () => {
    lookupMock.mockResolvedValue([{ address: "192.168.1.10", family: 4 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWithSSRFProtection("https://calendar.example/feed.ics")).rejects.toThrow(
      "URL blocked by SSRF protection"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches valid public HTTPS destinations", async () => {
    const response = new Response("ok");
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWithSSRFProtection("https://calendar.example/feed.ics")).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith("https://calendar.example/feed.ics", { redirect: "manual" });
  });

  it("blocks a redirect to a prohibited destination before the second request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://169.254.169.254/latest/meta-data/" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWithSSRFProtection("https://calendar.example/feed.ics")).rejects.toThrow(
      "URL blocked by SSRF protection"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves relative redirects and rejects excessive redirects", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "/next" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWithSSRFProtection("https://calendar.example/start", 1)).rejects.toThrow(
      "Too many redirects"
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://calendar.example/next", { redirect: "manual" });
  });

  it("rejects redirects without a location header", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 302 })));

    await expect(fetchWithSSRFProtection("https://calendar.example/start")).rejects.toThrow(
      "missing a location header"
    );
  });

  it("rejects redirects with an invalid location header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://[" } }))
    );

    await expect(fetchWithSSRFProtection("https://calendar.example/start")).rejects.toThrow(
      "invalid location header"
    );
  });
});

describe("isPrivateIP", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "169.254.169.254", // AWS metadata
    "0.0.0.0",
    "100.64.0.1", // RFC 6598 CGNAT start
    "100.127.255.254", // RFC 6598 CGNAT end
  ])("blocks private IPv4 %s", (ip) => {
    expect(isPrivateIP(ip)).toBe(true);
  });

  it.each([
    "172.15.255.255", // just outside 172.16.0.0/12
    "172.32.0.0", // just outside 172.16.0.0/12
    "8.8.8.8", // Google DNS
    "1.1.1.1", // Cloudflare DNS
    "100.63.255.255", // just below RFC 6598
    "100.128.0.0", // just above RFC 6598
  ])("allows public IPv4 %s", (ip) => {
    expect(isPrivateIP(ip)).toBe(false);
  });

  it.each(["::1", "::", "fc00::1", "fd00::1", "fe80::1"])("blocks private IPv6 %s", (ip) => {
    expect(isPrivateIP(ip)).toBe(true);
  });

  it("allows public IPv6 addresses", () => {
    expect(isPrivateIP("2001:4860:4860::8888")).toBe(false); // Google DNS
  });

  it("blocks IPv4-mapped IPv6 addresses", () => {
    expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIP("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIP("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateIP("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("isBlockedHostname", () => {
  it.each([
    "localhost",
    "127.0.0.1",
    "::1",
    "[::1]",
    "0.0.0.0",
    "169.254.169.254",
    "metadata.google.internal",
    "169.254.169.254.",
    "METADATA.GOOGLE.INTERNAL",
  ])("blocks %s", (hostname) => {
    expect(isBlockedHostname(hostname)).toBe(true);
  });

  it("allows regular hostnames", () => {
    expect(isBlockedHostname("example.com")).toBe(false);
  });
});

describe("validateUrlForSSRFSync", () => {
  it("allows HTTPS URLs", () => {
    expect(validateUrlForSSRFSync("https://example.com/logo.png").isValid).toBe(true);
  });

  it("allows image data URLs", () => {
    expect(validateUrlForSSRFSync("data:image/png;base64,iVBORw0KGgo=").isValid).toBe(true);
  });

  it("allows /api/avatar/{uuid}.png only", () => {
    expect(validateUrlForSSRFSync("/api/avatar/ba0fa3a6-2aac-4032-8230-3789f5752e5a.png").isValid).toBe(true);
    expect(validateUrlForSSRFSync("/api/avatar/any-value.png").isValid).toBe(true);
  });

  it("rejects /api/avatar/ path without .png extension", () => {
    expect(validateUrlForSSRFSync("/api/avatar/ba0fa3a6-2aac-4032-8230-3789f5752e5a").isValid).toBe(false);
    expect(validateUrlForSSRFSync("/api/avatar/foo.jpg").isValid).toBe(false);
  });

  it("rejects other path-only URLs", () => {
    expect(validateUrlForSSRFSync("/api/logo.png").isValid).toBe(false);
    expect(validateUrlForSSRFSync("/other/path").isValid).toBe(false);
  });

  it("rejects protocol-relative URLs (SSRF: could target metadata or internal hosts)", () => {
    expect(validateUrlForSSRFSync("//169.254.169.254/latest/meta-data/").isValid).toBe(false);
    expect(validateUrlForSSRFSync("//metadata.google.internal/").isValid).toBe(false);
  });

  it.each([
    ["http://example.com/logo.png", "Only HTTPS URLs are allowed"],
    ["ftp://example.com/file", "Only HTTPS URLs are allowed"],
    ["data:text/html,<script>alert(1)</script>", "Non-image data URL"],
    ["https://127.0.0.1/logo.png", "Blocked hostname"],
    ["https://0.0.0.0/logo.png", "Blocked hostname"],
    ["https://169.254.169.254/latest/meta-data/", "Blocked hostname"],
    ["https://localhost/logo.png", "Blocked hostname"],
    ["not-a-url", "Invalid URL format"],
  ])("blocks %s", (url, expectedError) => {
    const result = validateUrlForSSRFSync(url);
    expect(result).toEqual({ isValid: false, error: expectedError });
  });

  it.each([
    ["https://[::1]/", "Blocked hostname"],
    ["https://[fe80::1]/path", "Private IP address"],
    ["https://[fc00::1]:8080/", "Private IP address"],
    ["https://[::ffff:127.0.0.1]/", "Private IP address"],
  ])("blocks IPv6 private addresses with brackets %s", (url, expectedError) => {
    const result = validateUrlForSSRFSync(url);
    expect(result).toEqual({ isValid: false, error: expectedError });
  });

  it("allows public IPv6 addresses", () => {
    expect(validateUrlForSSRFSync("https://[2001:4860:4860::8888]/").isValid).toBe(true);
  });
});

describe("isTrustedInternalUrl", () => {
  const webappUrl = "https://app.cal.com";

  it("returns true for same origin", () => {
    expect(isTrustedInternalUrl("https://app.cal.com/logo.png", webappUrl)).toBe(true);
  });

  it("returns false for different origins and invalid URLs", () => {
    expect(isTrustedInternalUrl("https://evil.com/logo.png", webappUrl)).toBe(false);
    expect(isTrustedInternalUrl("https://app.cal.com.evil.com/x", webappUrl)).toBe(false);
    expect(isTrustedInternalUrl("not-a-url", webappUrl)).toBe(false);
  });
});

describe("HTTP webhook exceptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows localhost HTTP when NEXT_PUBLIC_IS_E2E=1", () => {
    vi.stubEnv("NEXT_PUBLIC_IS_E2E", "1");
    expect(validateUrlForSSRFSync("http://localhost:3000/webhook").isValid).toBe(true);
    expect(validateUrlForSSRFSync("http://127.0.0.1:4000/webhook").isValid).toBe(true);
  });

  it("still blocks non-localhost URLs in E2E environment", () => {
    vi.stubEnv("NEXT_PUBLIC_IS_E2E", "1");
    expect(validateUrlForSSRFSync("http://evil.com/webhook").isValid).toBe(false);
    expect(validateUrlForSSRFSync("http://192.168.1.1/webhook").isValid).toBe(false);
  });
});

// Test self-hosted behavior with separate describe block using vi.doMock
describe("Self-hosted environment behavior", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("@calcom/lib/constants", () => ({
      IS_SELF_HOSTED: true,
      IS_PRODUCTION: false,
    }));
  });

  afterEach(() => {
    vi.doUnmock("@calcom/lib/constants");
  });

  it("allows private IPs for self-hosted (internal webhooks)", async () => {
    const { validateUrlForSSRFSync: validateSelfHosted } = await import("./ssrfProtection");
    expect(validateSelfHosted("http://192.168.1.1/webhook").isValid).toBe(true);
    expect(validateSelfHosted("http://10.0.0.1/webhook").isValid).toBe(true);
    expect(validateSelfHosted("http://172.16.0.1/webhook").isValid).toBe(true);
  });

  it("allows HTTP URLs for self-hosted", async () => {
    const { validateUrlForSSRFSync: validateSelfHosted } = await import("./ssrfProtection");
    expect(validateSelfHosted("http://internal-service.local/webhook").isValid).toBe(true);
    expect(validateSelfHosted("http://localhost:3000/webhook").isValid).toBe(true);
  });

  it("still blocks cloud metadata endpoints even on self-hosted", async () => {
    const { validateUrlForSSRFSync: validateSelfHosted } = await import("./ssrfProtection");
    // AWS/Azure/DigitalOcean/Oracle metadata
    expect(validateSelfHosted("http://169.254.169.254/latest/meta-data/").isValid).toBe(false);
    // GCP metadata
    expect(validateSelfHosted("http://metadata.google.internal/computeMetadata/v1/").isValid).toBe(false);
    expect(validateSelfHosted("http://metadata.google.com/computeMetadata/v1/").isValid).toBe(false);
    // Azure alternate
    expect(validateSelfHosted("http://169.254.169.253/metadata/instance").isValid).toBe(false);
  });

  it("allows HTTPS URLs for self-hosted", async () => {
    const { validateUrlForSSRFSync: validateSelfHosted } = await import("./ssrfProtection");
    expect(validateSelfHosted("https://example.com/webhook").isValid).toBe(true);
  });

  it("blocks non-HTTP protocols for self-hosted", async () => {
    const { validateUrlForSSRFSync: validateSelfHosted } = await import("./ssrfProtection");
    expect(validateSelfHosted("file:///etc/passwd").isValid).toBe(false);
    expect(validateSelfHosted("ftp://internal-server/file").isValid).toBe(false);
    expect(validateSelfHosted("javascript:alert(1)").isValid).toBe(false);
  });
});
