import { afterEach, describe, expect, it, vi } from "vitest";
import { getBookingAssistantConfig, isBookingAssistantEnabled } from "./config";

const validEnv = {
  BOOKING_ASSISTANT_ENABLED: "1",
  BOOKING_ASSISTANT_PROVIDER: "openrouter",
  BOOKING_ASSISTANT_API_KEY: "sk-or-test",
  BOOKING_ASSISTANT_MODEL: "example-org/example-model",
  BOOKING_ASSISTANT_API_URL: "",
};

const stubEnv = (overrides: Partial<Record<keyof typeof validEnv, string>> = {}) => {
  for (const [key, value] of Object.entries({ ...validEnv, ...overrides })) {
    vi.stubEnv(key, value);
  }
};

describe("getBookingAssistantConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the provider's default API URL", () => {
    stubEnv();

    expect(getBookingAssistantConfig()).toEqual({
      provider: "openrouter",
      apiKey: "sk-or-test",
      model: "example-org/example-model",
      apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    });
    expect(isBookingAssistantEnabled()).toBe(true);
  });

  it("trims values and accepts the provider in any case", () => {
    stubEnv({
      BOOKING_ASSISTANT_ENABLED: "true",
      BOOKING_ASSISTANT_PROVIDER: " OpenRouter ",
      BOOKING_ASSISTANT_API_KEY: " sk-or-test ",
      BOOKING_ASSISTANT_MODEL: " example-org/example-model ",
    });

    expect(getBookingAssistantConfig()).toMatchObject({
      provider: "openrouter",
      apiKey: "sk-or-test",
      model: "example-org/example-model",
    });
  });

  it.each(["", "0", "false", "yes"])("returns null when the flag is %j", (flag) => {
    stubEnv({ BOOKING_ASSISTANT_ENABLED: flag });

    expect(getBookingAssistantConfig()).toBeNull();
    expect(isBookingAssistantEnabled()).toBe(false);
  });

  it.each([
    "",
    "anthropic",
    "openai",
    "toString",
    "__proto__",
  ])("returns null for the unsupported provider %j", (provider) => {
    stubEnv({ BOOKING_ASSISTANT_PROVIDER: provider });

    expect(getBookingAssistantConfig()).toBeNull();
  });

  it.each(["", "   "])("returns null when the API key is %j", (apiKey) => {
    stubEnv({ BOOKING_ASSISTANT_API_KEY: apiKey });

    expect(getBookingAssistantConfig()).toBeNull();
  });

  it.each(["", "   "])("returns null when the model is %j, since there is no default", (model) => {
    stubEnv({ BOOKING_ASSISTANT_MODEL: model });

    expect(getBookingAssistantConfig()).toBeNull();
  });

  it("uses a custom https API URL when provided", () => {
    stubEnv({ BOOKING_ASSISTANT_API_URL: "https://llm-proxy.example.com/v1/chat/completions" });

    expect(getBookingAssistantConfig()?.apiUrl).toBe("https://llm-proxy.example.com/v1/chat/completions");
  });

  it("allows plain http only for a local proxy", () => {
    stubEnv({ BOOKING_ASSISTANT_API_URL: "http://localhost:8080/v1/chat/completions" });

    expect(getBookingAssistantConfig()?.apiUrl).toBe("http://localhost:8080/v1/chat/completions");
  });

  it.each([
    "http://llm-proxy.example.com/v1/chat/completions",
    "not a url",
    "ftp://localhost/v1/chat/completions",
  ])("returns null for the disallowed API URL %s", (apiUrl) => {
    stubEnv({ BOOKING_ASSISTANT_API_URL: apiUrl });

    expect(getBookingAssistantConfig()).toBeNull();
  });
});
