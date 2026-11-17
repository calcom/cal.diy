import { renderHook } from "@testing-library/react-hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUserAgentData } from "./useUserAgentData";

describe("useUserAgentData hook", () => {
  const originalNavigator = global.navigator;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      writable: true,
    });
  });

  function mockUserAgent(userAgent: string) {
    Object.defineProperty(global, "navigator", {
      value: { userAgent },
      writable: true,
    });
  }

  describe("OS detection", () => {
    it("should detect iOS on iPhone", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
      );
      const { result } = renderHook(() => useUserAgentData());
      expect(result.current.os).toBe("ios");
      expect(result.current.isMobile).toBe(true);
    });

    it("should detect iOS on iPad", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
      );
      const { result } = renderHook(() => useUserAgentData());
      expect(result.current.os).toBe("ios");
      expect(result.current.isMobile).toBe(true);
    });

    it("should detect Android", () => {
      mockUserAgent(
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36"
      );
      const { result } = renderHook(() => useUserAgentData());
      expect(result.current.os).toBe("android");
      expect(result.current.isMobile).toBe(true);
    });

    it("should detect macOS", () => {
      mockUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
      );
      const { result } = renderHook(() => useUserAgentData());
      expect(result.current.os).toBe("macos");
      expect(result.current.isMobile).toBe(false);
    });

    it("should detect Windows", () => {
      mockUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
      );
      const { result } = renderHook(() => useUserAgentData());
      expect(result.current.os).toBe("windows");
      expect(result.current.isMobile).toBe(false);
    });

    it("should detect Linux", () => {
      mockUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
      );
      const { result } = renderHook(() => useUserAgentData());
      expect(result.current.os).toBe("linux");
      expect(result.current.isMobile).toBe(false);
    });

    it("should return unknown for unrecognized OS", () => {
      mockUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
      const { result } = renderHook(() => useUserAgentData());
      expect(result.current.os).toBe("unknown");
      expect(result.current.isMobile).toBe(false);
    });
  });

  describe("Browser detection", () => {
    it("should detect Chrome on desktop", () => {
      mockUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"
      );
      const { result } = renderHook(() => useUserAgentData());
      expect(result.current.browser).toBe("chrome");
    });

    it("should detect Chrome on iOS (CriOS)", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/116.0.5845.103 Mobile/15E148 Safari/604.1"
      );
      const { result } = renderHook(() => useUserAgentData());
      expect(result.current.browser).toBe("chrome");
    });

    it("should detect Safari on macOS", () => {
      mockUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15"
      );
      const { result } = renderHook(() => useUserAgentData());
      expect(result.current.browser).toBe("safari");
    });

    it("should detect Safari on iOS", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
      );
      const { result } = renderHook(() => useUserAgentData());
      expect(result.current.browser).toBe("safari");
    });

    it("should detect Firefox on desktop", () => {
      mockUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/116.0");
      const { result } = renderHook(() => useUserAgentData());
      expect(result.current.browser).toBe("firefox");
    });

    it("should detect Firefox on iOS (FxiOS)", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/116.0 Mobile/15E148 Safari/605.1.15"
      );
      const { result } = renderHook(() => useUserAgentData());
      expect(result.current.browser).toBe("firefox");
    });

    it("should detect Edge", () => {
      mockUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36 Edg/116.0.1938.69"
      );
      const { result } = renderHook(() => useUserAgentData());
      expect(result.current.browser).toBe("edge");
    });

    it("should not detect Chrome when Edge is present", () => {
      mockUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36 Edg/116.0.1938.69"
      );
      const { result } = renderHook(() => useUserAgentData());
      expect(result.current.browser).toBe("edge");
      expect(result.current.browser).not.toBe("chrome");
    });

    it("should return unknown for unrecognized browser", () => {
      mockUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
      const { result } = renderHook(() => useUserAgentData());
      expect(result.current.browser).toBe("unknown");
    });
  });

  describe("SSR handling", () => {
    it("should return defaults when navigator is undefined", () => {
      Object.defineProperty(global, "navigator", {
        value: undefined,
        writable: true,
      });
      const { result } = renderHook(() => useUserAgentData());
      expect(result.current.os).toBe("unknown");
      expect(result.current.browser).toBe("unknown");
      expect(result.current.isMobile).toBe(false);
    });
  });
});
