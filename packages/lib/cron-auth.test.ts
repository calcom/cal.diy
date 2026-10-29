import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isAuthorizedCronApiKey,
  isAuthorizedCronBearer,
  isAuthorizedCronRequest,
} from "./cron-auth";

describe("cron-auth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("isAuthorizedCronBearer", () => {
    it("rejects Bearer undefined when CRON_SECRET is unset", () => {
      vi.stubEnv("CRON_SECRET", undefined);

      expect(isAuthorizedCronBearer("Bearer undefined")).toBe(false);
    });

    it("accepts a matching bearer token", () => {
      vi.stubEnv("CRON_SECRET", "test-secret");

      expect(isAuthorizedCronBearer("Bearer test-secret")).toBe(true);
    });
  });

  describe("isAuthorizedCronApiKey", () => {
    it("rejects when CRON_API_KEY is unset", () => {
      vi.stubEnv("CRON_API_KEY", undefined);

      expect(isAuthorizedCronApiKey("some-key")).toBe(false);
    });

    it("accepts a matching api key", () => {
      vi.stubEnv("CRON_API_KEY", "test-api-key");

      expect(isAuthorizedCronApiKey("test-api-key")).toBe(true);
    });
  });

  describe("isAuthorizedCronRequest", () => {
    it("rejects Bearer undefined when only CRON_SECRET is unset", () => {
      vi.stubEnv("CRON_API_KEY", "test-api-key");
      vi.stubEnv("CRON_SECRET", undefined);

      expect(isAuthorizedCronRequest("Bearer undefined")).toBe(false);
    });

    it("accepts CRON_API_KEY without CRON_SECRET", () => {
      vi.stubEnv("CRON_API_KEY", "test-api-key");
      vi.stubEnv("CRON_SECRET", undefined);

      expect(isAuthorizedCronRequest("test-api-key")).toBe(true);
    });
  });
});
