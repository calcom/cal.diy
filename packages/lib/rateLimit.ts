import process from "node:process";
import { type LimitOptions, Ratelimit, type RatelimitResponse } from "@unkey/ratelimit";
import { isIpInBanListString } from "./getIP";
import logger from "./logger";

const log = logger.getSubLogger({ prefix: ["RateLimit"] });

export type { RatelimitResponse };

export type RateLimitHelper = {
  rateLimitingType?:
    | "core"
    | "forcedSlowMode"
    | "common"
    | "api"
    | "ai"
    | "sms"
    | "smsMonth"
    | "instantMeeting";
  identifier: string;
  opts?: LimitOptions;
  /**
   * Using a callback instead of a regular return to provide headers even
   * when the rate limit is reached and an error is thrown.
   **/
  onRateLimiterResponse?: (response: RatelimitResponse) => void;
};

export const API_KEY_RATE_LIMIT = 30;

let warned = false;

export function rateLimiter() {
  const { UNKEY_ROOT_KEY } = process.env;

  if (!UNKEY_ROOT_KEY) {
    if (!warned) {
      log.warn("Disabled because the UNKEY_ROOT_KEY environment variable was not found.");
      warned = true;
    }
    return () => ({ success: true, limit: 10, remaining: 999, reset: 0 }) as RatelimitResponse;
  }
  const timeout = {
    fallback: { success: true, limit: 10, remaining: 999, reset: 0 },
    ms: 5000,
  };

  const onError = (err: Error, identifier: string) => {
    log.error("Unkey rate limiter encountered unknown error", {
      error: err.message,
      stack: err.stack,
      identifier,
      timestamp: new Date().toISOString(),
    });
    return { success: true, limit: 10, remaining: 999, reset: 0 };
  };

  const limiter = {
    core: new Ratelimit({
      rootKey: UNKEY_ROOT_KEY,
      namespace: "core",
      limit: 10,
      duration: "60s",
      timeout,
      onError,
    }),
    instantMeeting: new Ratelimit({
      rootKey: UNKEY_ROOT_KEY,
      namespace: "instantMeeting",
      limit: 1,
      duration: "10m",
      timeout,
      onError,
    }),
    common: new Ratelimit({
      rootKey: UNKEY_ROOT_KEY,
      namespace: "common",
      limit: 200,
      duration: "60s",
      timeout,
      onError,
    }),
    forcedSlowMode: new Ratelimit({
      rootKey: UNKEY_ROOT_KEY,
      namespace: "forcedSlowMode",
      limit: 1,
      duration: "30s",
      timeout,
      onError,
    }),
    api: new Ratelimit({
      rootKey: UNKEY_ROOT_KEY,
      namespace: "api",
      limit: API_KEY_RATE_LIMIT,
      duration: "60s",
      timeout,
      onError,
    }),
    ai: new Ratelimit({
      rootKey: UNKEY_ROOT_KEY,
      namespace: "ai",
      limit: 20,
      duration: "1d",
      timeout,
      onError,
    }),
    sms: new Ratelimit({
      rootKey: UNKEY_ROOT_KEY,
      namespace: "sms",
      limit: 50,
      duration: "5m",
      timeout,
      onError,
    }),
    smsMonth: new Ratelimit({
      rootKey: UNKEY_ROOT_KEY,
      namespace: "smsMonth",
      limit: 250,
      duration: "30d",
      timeout,
      onError,
    }),
  };

  async function rateLimit({ rateLimitingType = "core", identifier, opts }: RateLimitHelper) {
    if (isIpInBanListString(identifier)) {
      return await limiter.forcedSlowMode.limit(identifier, opts);
    }

    return await limiter[rateLimitingType].limit(identifier, opts);
  }

  return rateLimit;
}
