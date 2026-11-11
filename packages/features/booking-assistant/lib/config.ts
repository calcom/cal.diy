import process from "node:process";

const PROVIDER_DEFAULT_API_URLS = {
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
} as const;
const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"];

export type BookingAssistantProvider = keyof typeof PROVIDER_DEFAULT_API_URLS;

export type BookingAssistantConfig = {
  provider: BookingAssistantProvider;
  apiKey: string;
  model: string;
  apiUrl: string;
};

const SUPPORTED_PROVIDERS = Object.keys(PROVIDER_DEFAULT_API_URLS) as BookingAssistantProvider[];

const isTruthyFlag = (value: string | undefined) => value === "1" || value === "true";

const toSupportedProvider = (value: string | undefined) => {
  const normalized = value?.trim().toLowerCase();
  return SUPPORTED_PROVIDERS.find((provider) => provider === normalized) ?? null;
};

// The API key is sent to this URL, so plain http is only allowed for a local proxy.
const isAllowedApiUrl = (value: string) => {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && LOCAL_HOSTNAMES.includes(url.hostname);
  } catch {
    return false;
  }
};

/**
 * Server-only. Returns null whenever the assistant must stay off, so a half-configured
 * self-hosted instance degrades to the normal Booker instead of erroring.
 * The model has no default because model names are provider-specific.
 */
export function getBookingAssistantConfig(): BookingAssistantConfig | null {
  if (!isTruthyFlag(process.env.BOOKING_ASSISTANT_ENABLED)) return null;

  const provider = toSupportedProvider(process.env.BOOKING_ASSISTANT_PROVIDER);
  if (!provider) return null;

  const apiKey = process.env.BOOKING_ASSISTANT_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.BOOKING_ASSISTANT_MODEL?.trim();
  if (!model) return null;

  const apiUrl = process.env.BOOKING_ASSISTANT_API_URL?.trim() || PROVIDER_DEFAULT_API_URLS[provider];
  if (!isAllowedApiUrl(apiUrl)) return null;

  return { provider, apiKey, model, apiUrl };
}

export function isBookingAssistantEnabled(): boolean {
  return getBookingAssistantConfig() !== null;
}
