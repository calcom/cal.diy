import type { NextApiRequest } from "next";
import { afterEach, describe, expect, it } from "vitest";
import getIP, { isIpInBanlist, parseIpFromHeaders } from "./getIP";

function buildRequest(headers: Record<string, string>): Request {
  return new Request("https://example.com", { headers });
}

function buildNextApiRequest(headers: Record<string, string | string[]>): NextApiRequest {
  return { headers } as unknown as NextApiRequest;
}

describe("parseIpFromHeaders", () => {
  it("returns the first IP from a comma-separated string", () => {
    expect(parseIpFromHeaders("1.2.3.4, 5.6.7.8")).toBe("1.2.3.4");
  });

  it("returns the single IP when there is no comma", () => {
    expect(parseIpFromHeaders("1.2.3.4")).toBe("1.2.3.4");
  });

  it("returns the first element when given an array", () => {
    expect(parseIpFromHeaders(["1.2.3.4", "5.6.7.8"])).toBe("1.2.3.4");
  });

  it("trims leading/trailing whitespace from a padded string value", () => {
    expect(parseIpFromHeaders("  1.2.3.4  , 5.6.7.8")).toBe("1.2.3.4");
  });

  it("trims whitespace after splitting on comma", () => {
    expect(parseIpFromHeaders("1.2.3.4 , 5.6.7.8")).toBe("1.2.3.4");
  });

  it("trims leading/trailing whitespace from a padded array element", () => {
    expect(parseIpFromHeaders(["  1.2.3.4  ", "5.6.7.8"])).toBe("1.2.3.4");
  });
  it("returns an empty string for an empty array instead of throwing", () => {
    expect(parseIpFromHeaders([])).toBe("");
  });
  it("trims tabs and other whitespace, not just spaces", () => {
    expect(parseIpFromHeaders("\t1.2.3.4\t, 5.6.7.8")).toBe("1.2.3.4");
  });
});

describe("getIP", () => {
  describe("with Web Request", () => {
    it("returns cf-connecting-ip when present", () => {
      const req = buildRequest({ "cf-connecting-ip": "1.1.1.1" });
      expect(getIP(req)).toBe("1.1.1.1");
    });

    it("prefers cf-connecting-ip over other headers", () => {
      const req = buildRequest({
        "cf-connecting-ip": "1.1.1.1",
        "true-client-ip": "2.2.2.2",
        "x-forwarded-for": "3.3.3.3",
        "x-real-ip": "4.4.4.4",
      });
      expect(getIP(req)).toBe("1.1.1.1");
    });

    it("falls back to true-client-ip when cf-connecting-ip is absent", () => {
      const req = buildRequest({
        "true-client-ip": "2.2.2.2",
        "x-forwarded-for": "3.3.3.3",
        "x-real-ip": "4.4.4.4",
      });
      expect(getIP(req)).toBe("2.2.2.2");
    });

    it("falls back to x-forwarded-for when cf and true-client headers are absent", () => {
      const req = buildRequest({
        "x-forwarded-for": "3.3.3.3, 10.0.0.1",
        "x-real-ip": "4.4.4.4",
      });
      expect(getIP(req)).toBe("3.3.3.3");
    });

    it("falls back to x-real-ip as last resort", () => {
      const req = buildRequest({ "x-real-ip": "4.4.4.4" });
      expect(getIP(req)).toBe("4.4.4.4");
    });

    it("returns 127.0.0.1 when no IP headers are present", () => {
      const req = buildRequest({});
      expect(getIP(req)).toBe("127.0.0.1");
    });

    it("extracts first IP from comma-separated x-forwarded-for", () => {
      const req = buildRequest({ "x-forwarded-for": "9.9.9.9, 10.0.0.1, 172.16.0.1" });
      expect(getIP(req)).toBe("9.9.9.9");
    });
  });

  describe("banlist bypass regression (#29851)", () => {
    const originalBanlist = process.env.IP_BANLIST;

    afterEach(() => {
      if (originalBanlist === undefined) {
        delete process.env.IP_BANLIST;
      } else {
        process.env.IP_BANLIST = originalBanlist;
      }
    });

    it("still detects a banned IP when x-forwarded-for is padded with whitespace", () => {
      process.env.IP_BANLIST = JSON.stringify(["1.2.3.4"]);
      const req = buildRequest({ "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" });
      expect(isIpInBanlist(req)).toBe(true);
    });
  });

  describe("with NextApiRequest", () => {
    it("returns cf-connecting-ip when present", () => {
      const req = buildNextApiRequest({ "cf-connecting-ip": "1.1.1.1" });
      expect(getIP(req)).toBe("1.1.1.1");
    });

    it("prefers cf-connecting-ip over other headers", () => {
      const req = buildNextApiRequest({
        "cf-connecting-ip": "1.1.1.1",
        "true-client-ip": "2.2.2.2",
        "x-forwarded-for": "3.3.3.3",
        "x-real-ip": "4.4.4.4",
      });
      expect(getIP(req)).toBe("1.1.1.1");
    });

    it("falls back to true-client-ip when cf-connecting-ip is absent", () => {
      const req = buildNextApiRequest({
        "true-client-ip": "2.2.2.2",
        "x-real-ip": "4.4.4.4",
      });
      expect(getIP(req)).toBe("2.2.2.2");
    });

    it("falls back to x-forwarded-for when cf and true-client headers are absent", () => {
      const req = buildNextApiRequest({
        "x-forwarded-for": "3.3.3.3, 10.0.0.1",
        "x-real-ip": "4.4.4.4",
      });
      expect(getIP(req)).toBe("3.3.3.3");
    });

    it("falls back to x-real-ip as last resort", () => {
      const req = buildNextApiRequest({ "x-real-ip": "4.4.4.4" });
      expect(getIP(req)).toBe("4.4.4.4");
    });

    it("returns 127.0.0.1 when no IP headers are present", () => {
      const req = buildNextApiRequest({});
      expect(getIP(req)).toBe("127.0.0.1");
    });

    it("handles array header values (NextApiRequest)", () => {
      const req = buildNextApiRequest({ "x-forwarded-for": ["5.5.5.5", "6.6.6.6"] });
      expect(getIP(req)).toBe("5.5.5.5");
    });
  });
});