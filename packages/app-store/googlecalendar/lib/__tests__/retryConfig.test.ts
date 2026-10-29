// @vitest-environment node
// Node environment: under jsdom, gaxios uses window.fetch, which setupVitest mocks.

import http from "node:http";
import type { AddressInfo } from "node:net";
import { calendar_v3 } from "@googleapis/calendar";
import { describe, expect, test } from "vitest";
import type { RetryableError } from "../retryConfig";
import {
  getGoogleCalendarRetryConfig,
  isGoogleRateLimitError,
  shouldRetryGoogleCalendarRequest,
} from "../retryConfig";

const rateLimitBody = {
  error: {
    code: 403,
    message: "Rate Limit Exceeded",
    errors: [{ domain: "usageLimits", reason: "rateLimitExceeded", message: "Rate Limit Exceeded" }],
  },
};
const forbiddenBody = {
  error: { code: 403, errors: [{ domain: "global", reason: "forbiddenForNonOrganizer" }] },
};

function makeError({
  method = "PATCH",
  status,
  data,
  attempt = 0,
}: {
  method?: string;
  status?: number;
  data?: unknown;
  attempt?: number;
}): RetryableError {
  return {
    name: "GaxiosError",
    config: { method, retryConfig: { currentRetryAttempt: attempt, retry: 3, noResponseRetries: 2 } },
    response: status === undefined ? undefined : { status, data },
  };
}

describe("isGoogleRateLimitError", () => {
  test("detects rateLimitExceeded and userRateLimitExceeded 403s", () => {
    expect(isGoogleRateLimitError(makeError({ status: 403, data: rateLimitBody }))).toBe(true);
    const userRateLimit = { error: { errors: [{ reason: "userRateLimitExceeded" }] } };
    expect(isGoogleRateLimitError(makeError({ status: 403, data: userRateLimit }))).toBe(true);
  });

  test("parses a JSON string body", () => {
    const err = makeError({ status: 403, data: JSON.stringify(rateLimitBody) });
    expect(isGoogleRateLimitError(err)).toBe(true);
  });

  test("ignores other 403 reasons, non-403 statuses and unparsable bodies", () => {
    expect(isGoogleRateLimitError(makeError({ status: 403, data: forbiddenBody }))).toBe(false);
    expect(isGoogleRateLimitError(makeError({ status: 400, data: rateLimitBody }))).toBe(false);
    expect(isGoogleRateLimitError(makeError({ status: 403, data: "<html>" }))).toBe(false);
    expect(isGoogleRateLimitError(makeError({ status: 403, data: null }))).toBe(false);
  });
});

describe("shouldRetryGoogleCalendarRequest", () => {
  test("retries the post-insert PATCH on 403 rateLimitExceeded (#28834)", () => {
    expect(shouldRetryGoogleCalendarRequest(makeError({ status: 403, data: rateLimitBody }))).toBe(true);
  });

  test("does not retry a 403 that is not a rate limit", () => {
    expect(shouldRetryGoogleCalendarRequest(makeError({ status: 403, data: forbiddenBody }))).toBe(false);
  });

  test("never retries POST, so an insert cannot be duplicated", () => {
    const post = (status: number, data?: unknown) =>
      shouldRetryGoogleCalendarRequest(makeError({ method: "POST", status, data }));
    expect(post(403, rateLimitBody)).toBe(false);
    expect(post(429)).toBe(false);
    expect(post(503)).toBe(false);
  });

  test("keeps gaxios defaults for statuses", () => {
    expect(shouldRetryGoogleCalendarRequest(makeError({ method: "GET", status: 429 }))).toBe(true);
    expect(shouldRetryGoogleCalendarRequest(makeError({ method: "PATCH", status: 408 }))).toBe(true);
    expect(shouldRetryGoogleCalendarRequest(makeError({ method: "PATCH", status: 503 }))).toBe(true);
    expect(shouldRetryGoogleCalendarRequest(makeError({ method: "GET", status: 404 }))).toBe(false);
    expect(shouldRetryGoogleCalendarRequest(makeError({ method: "PATCH", status: 409 }))).toBe(false);
  });

  test("stops after the configured number of retries", () => {
    expect(
      shouldRetryGoogleCalendarRequest(makeError({ status: 403, data: rateLimitBody, attempt: 2 }))
    ).toBe(true);
    expect(
      shouldRetryGoogleCalendarRequest(makeError({ status: 403, data: rateLimitBody, attempt: 3 }))
    ).toBe(false);
  });

  test("retries network errors with no response within noResponseRetries", () => {
    expect(shouldRetryGoogleCalendarRequest(makeError({ attempt: 1 }))).toBe(true);
    expect(shouldRetryGoogleCalendarRequest(makeError({ attempt: 2 }))).toBe(false);
  });

  test("does not retry aborted requests or errors without retry config", () => {
    expect(shouldRetryGoogleCalendarRequest({ ...makeError({ status: 503 }), name: "AbortError" })).toBe(
      false
    );
    expect(
      shouldRetryGoogleCalendarRequest({ ...makeError({ status: 503 }), error: { name: "AbortError" } })
    ).toBe(false);
    expect(shouldRetryGoogleCalendarRequest({ name: "Error", config: { method: "PATCH" } })).toBe(false);
  });
});

test("getGoogleCalendarRetryConfig keeps gaxios's retry count and plugs in the predicate", () => {
  expect(getGoogleCalendarRetryConfig()).toEqual({ retry: 3, shouldRetry: shouldRetryGoogleCalendarRequest });
});

describe("with the real Google Calendar client", () => {
  // Answers `failures` times with `status` + `body`, then 200.
  async function withServer(failures: number, status: number, body: unknown) {
    let calls = 0;
    const server = http.createServer((_req, res) => {
      calls += 1;
      res.setHeader("content-type", "application/json");
      if (calls <= failures) {
        res.statusCode = status;
        res.end(JSON.stringify(body));
      } else {
        res.end(JSON.stringify({ id: "event-id" }));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const client = new calendar_v3.Calendar({
      rootUrl: `http://127.0.0.1:${port}/`,
      retryConfig: getGoogleCalendarRetryConfig(),
    });
    return { client, calls: () => calls, close: () => server.close() };
  }

  test("events.patch succeeds after transient 403 rateLimitExceeded", async () => {
    const s = await withServer(2, 403, rateLimitBody);
    try {
      const res = await s.client.events.patch({
        calendarId: "primary",
        eventId: "event-id",
        requestBody: {},
      });
      expect(res.data.id).toBe("event-id");
      expect(s.calls()).toBe(3);
    } finally {
      s.close();
    }
  });

  test("events.patch fails at once on a 403 that is not a rate limit", async () => {
    const s = await withServer(1, 403, forbiddenBody);
    try {
      await expect(
        s.client.events.patch({ calendarId: "primary", eventId: "event-id", requestBody: {} })
      ).rejects.toMatchObject({ status: 403 });
      expect(s.calls()).toBe(1);
    } finally {
      s.close();
    }
  });

  test("events.insert is not retried on 403 rateLimitExceeded", async () => {
    const s = await withServer(1, 403, rateLimitBody);
    try {
      await expect(s.client.events.insert({ calendarId: "primary", requestBody: {} })).rejects.toMatchObject({
        status: 403,
      });
      expect(s.calls()).toBe(1);
    } finally {
      s.close();
    }
  });
});
