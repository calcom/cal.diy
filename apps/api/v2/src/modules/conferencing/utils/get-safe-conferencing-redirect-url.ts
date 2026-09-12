import { isOriginAllowed } from "@/lib/is-origin-allowed/is-origin-allowed";

export function getSafeConferencingRedirectUrl(
  url: string | undefined,
  fallbackUrl: string,
  baseUrl: string
): string {
  if (!url) {
    return fallbackUrl;
  }

  try {
    const baseOrigin = new URL(baseUrl).origin;

    if (url.startsWith("/")) {
      const parsedUrl = new URL(url, baseUrl);
      if (isOriginAllowed(parsedUrl.origin, [baseOrigin])) {
        return parsedUrl.toString();
      }
      return fallbackUrl;
    }

    if (url.startsWith("http://") || url.startsWith("https://")) {
      const parsedUrl = new URL(url);
      if (isOriginAllowed(parsedUrl.origin, [baseOrigin])) {
        return parsedUrl.toString();
      }
    }
  } catch {
    return fallbackUrl;
  }

  return fallbackUrl;
}
