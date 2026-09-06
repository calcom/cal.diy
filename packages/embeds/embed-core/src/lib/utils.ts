import type { KnownConfig, PrefillAndIframeAttrsConfig } from "../types";

export const getErrorString = ({
  errorCode,
  errorMessage,
}: {
  errorCode: string | undefined;
  errorMessage: string | undefined;
}) => {
  const defaultErrorMessage = "Something went wrong.";
  if (errorCode === "404") {
    errorMessage = errorMessage ?? "Cal Link seems to be wrong.";
    return `Error Code: 404. ${errorMessage}`;
  } else if (errorCode === "routerError") {
    errorMessage = errorMessage ?? defaultErrorMessage;
    return `Error Code: routerError. ${errorMessage}`;
  } else {
    errorMessage = errorMessage ?? defaultErrorMessage;
    return `Error Code: ${errorCode}. ${errorMessage}`;
  }
};

/**
 * An alternative to Object.fromEntries that allows duplicate keys and converts the values corresponding to them in an array
 *
 * NOTE: This is a duplicate of the function in @calcom/lib/hooks/useRouterQuery.ts. It has to be here because embed is published to npm and shouldn't refer to any private package
 */
export function fromEntriesWithDuplicateKeys(entries: IterableIterator<[string, string]> | null) {
  const result: Record<string, string | string[]> = {};

  if (entries === null) {
    return result;
  }

  // Consider setting atleast ES2015 as target
  // @ts-ignore TS2802: IterableIterator iteration requires downlevelIteration
  for (const [key, value] of entries) {
    if (result.hasOwnProperty(key)) {
      let currentValue = result[key];
      if (!Array.isArray(currentValue)) {
        currentValue = [currentValue];
      }
      currentValue.push(value);
      result[key] = currentValue;
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function isParamValuePresentInUrlSearchParams({
  param,
  value,
  container,
}: {
  param: string;
  value: string | string[];
  container: URLSearchParams;
}) {
  // Because UrlSearchParams could have multiple entries with same key like guest=1&guest=2
  const containerEntries = fromEntriesWithDuplicateKeys(container.entries());
  if (!container.has(param)) {
    return false;
  }
  const containerValue = containerEntries[param];
  const valueArray = Array.isArray(value) ? value : [value];
  if (valueArray.length !== containerValue.length) {
    return false;
  }
  return valueArray.every((valueItem) => containerValue.includes(valueItem));
}

function listKnownConfigProps() {
  const knownConfigProps: (keyof KnownConfig)[] = [
    "flag.coep",
    "layout",
    "ui.color-scheme",
    "theme",
    "cal.embed.pageType",
    "ui.autoscroll",
    "ui.autofocus",
    "ui.scroll",
    "ui.compact",
    "ui.unpadded",
    "disableAutofocus",
    "disableScroll",
    "compact",
    "unpadded",
  ];
  return knownConfigProps;
}

export function getConfigProp<TProp extends keyof KnownConfig>(config: KnownConfig, prop: TProp) {
  const knownConfigProps = listKnownConfigProps();
  if (!knownConfigProps.includes(prop)) {
    console.warn(`Not reading unknown config prop: ${prop}`);
    return null;
  }
  return config[prop] ?? null;
}

export function getQueryParamProvidedByConfig<TProp extends keyof KnownConfig>(
  queryParam: TProp
): NonNullable<KnownConfig[TProp]> | null {
  const knownConfigProps = listKnownConfigProps();
  if (!knownConfigProps.includes(queryParam)) {
    console.warn(`Not reading unknown config prop from query: ${queryParam}`);
    return null;
  }
  const url = new URL(document.URL);
  const value = url.searchParams.get(queryParam);
  if (typeof value === "string") {
    return value as NonNullable<KnownConfig[TProp]>;
  }
  return value;
}

function hyphenate(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1).replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

/**
 * Escapes special characters in HTML attribute values to prevent XSS
 * @param value The string to escape
 * @returns Escaped string safe for use in HTML attributes
 */
function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function generateDataAttributes(props: Record<string, string | null | undefined>): string {
  return Object.entries(props)
    .filter((pair): pair is [string, string] => !!pair[1])
    .map(([key, value]) => `data-${hyphenate(key)}="${escapeHtmlAttribute(value)}"`)
    .join(" ");
}

export function isRouterPath(path: string) {
  // URL doesn't matter
  const urlObject = new URL(path, "http://baseUrl.example");
  return urlObject.pathname === "/router";
}

export async function submitResponseAndGetRoutingResult({
  headlessRouterPageUrl,
}: {
  headlessRouterPageUrl: string;
}) {
  const headlessRouterUrlObject = new URL(headlessRouterPageUrl);
  const searchParams = headlessRouterUrlObject.searchParams;
  const headlessRouterApiUrl = `${headlessRouterUrlObject.origin}${headlessRouterUrlObject.pathname.replace(
    /^\/?router/,
    "/api/router"
  )}`;
  const response = await fetch(headlessRouterApiUrl, {
    method: "POST",
    body: JSON.stringify(fromEntriesWithDuplicateKeys(searchParams.entries())),
    headers: {
      "Content-Type": "application/json",
    },
  });
  const result = await response.json();
  if (result.status === "success") {
    if (!result.data.redirect && !result.data.message) {
      throw new Error("No `redirect` or `message` in response");
    }
    return result.data as { redirect: string } | { message: string };
  } else {
    if (!result.data.message) {
      throw new Error("No `message` in response");
    }
    console.warn("Error submitting response and getting routing result", result);
    return { error: result.data.message } as { error: string };
  }
}

export function isSameBookingLink({
  bookingLinkPath1,
  bookingLinkPath2,
}: {
  bookingLinkPath1: string;
  bookingLinkPath2: string;
}) {
  // Headless router redirects to /team/event-booking-url at the moment. In future it might fix it to /event-booking-url
  // So, stripe /team from both the URLs if present so that they can be compared easily
  return bookingLinkPath1.replace(/^\/team\//, "/") === bookingLinkPath2.replace(/^\/team\//, "/");
}

export function buildSearchParamsFromConfig(config: PrefillAndIframeAttrsConfig) {
  const { iframeAttrs: _1, ...params } = config;
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value instanceof Array) {
      value.forEach((val) => searchParams.append(key, val));
    } else if (typeof value === "string") {
      searchParams.set(key, value);
    }
  }
  return searchParams;
}

export function buildConfigWithPrerenderRelatedFields({
  config,
  isHeadlessRouterPath,
  backgroundSlotsFetch,
}: {
  config: PrefillAndIframeAttrsConfig;
  isHeadlessRouterPath: boolean;
  backgroundSlotsFetch: boolean;
}) {
  // While prerendering headless router path, we by default want to fetch slots in background(for the time being)
  // For other prerenderings, we don't want to fetch slots in background - Keeping the behaviour same as before

  // If we are prerendering a headless router path, we don't want to record the response immediately.
  if (isHeadlessRouterPath) {
    config["cal.queueFormResponse"] = "true";
  }

  if (!backgroundSlotsFetch) {
    // When prerendering, we don't want to preload slots as they might be outdated anyway by the time they are used
    // Also, when used with Headless Router attributes setup, we might endup fetching slots for a lot of people, which would be a waste and unnecessary load on Cal.diy resources
    config["cal.skipSlotsFetch"] = "true";
  }

  return {
    ...config,
    prerender: "true",
  };
}
