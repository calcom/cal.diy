"use client";

import type { GlobalCal, GlobalCalWithoutNs } from "@calcom/embed-core";
import EmbedSnippet from "@calcom/embed-snippet";

import Cal from "./Cal";

// Exporting for consumption by @calcom/embed-react user
export type { EmbedEvent } from "@calcom/embed-core";

export type GetCalApiOptions = {
  embedJsUrl?: string;
  namespace?: string;
  disableAutofocus?: boolean;
  autofocus?: boolean;
  scroll?: boolean;
  disableScroll?: boolean;
  disableAutoScroll?: boolean;
  compact?: boolean;
  unpadded?: boolean;
};

export function getCalApi(options?: GetCalApiOptions): Promise<GlobalCal | GlobalCalWithoutNs>;
export function getCalApi(embedJsUrl: string): Promise<GlobalCal | GlobalCalWithoutNs>;

export function getCalApi(
  optionsOrEmbedJsUrl?: GetCalApiOptions | string
): Promise<GlobalCal | GlobalCalWithoutNs> {
  const options =
    typeof optionsOrEmbedJsUrl === "string" ? { embedJsUrl: optionsOrEmbedJsUrl } : optionsOrEmbedJsUrl ?? {};

  const { namespace = "", embedJsUrl, disableAutofocus, autofocus, scroll, disableScroll, disableAutoScroll, compact, unpadded } = options;
  return new Promise(function tryReadingFromWindow(resolve) {
    const globalCal = EmbedSnippet(embedJsUrl);
    globalCal("init", namespace);
    const api = namespace ? globalCal.ns[namespace as keyof typeof globalCal.ns] : globalCal;
    if (!api) {
      setTimeout(() => {
        tryReadingFromWindow(resolve);
      }, 50);
      return;
    }

    const shouldDisableScroll =
      disableAutoScroll ??
      disableAutofocus ??
      (autofocus === false ? true : undefined) ??
      (scroll === false ? true : undefined) ??
      disableScroll;

    const isCompact = compact ?? unpadded;

    if (shouldDisableScroll !== undefined || isCompact !== undefined) {
      api("ui", {
        ...(shouldDisableScroll !== undefined ? { disableAutoScroll: shouldDisableScroll, disableAutofocus: shouldDisableScroll } : {}),
        ...(isCompact !== undefined ? { compact: isCompact, unpadded: isCompact } : {}),
      });
    }

    resolve(api);
  });
}

export default Cal;
