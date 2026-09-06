"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { mapOldToNewCssVars } from "./ui/cssVarsMap";
import type { Message } from "./embed";
import {
  embedStore,
  EMBED_IFRAME_STATE,
  resetPageData,
  setReloadInitiated,
  incrementView,
} from "./embed-iframe/lib/embedStore";
import {
  runAsap,
  isBookerReady,
  isLinkReady,
  keepParentInformedAboutDimensionChanges,
  isPrerendering,
  isBrowser,
  log,
} from "./embed-iframe/lib/utils";
import { sdkActionManager } from "./sdk-event";
import type {
  UiConfig,
  EmbedNonStylesConfig,
  BookerLayouts,
  EmbedStyles,
  EmbedBookerState,
  SlotsQuery,
  PrefillAndIframeAttrsConfig,
  SetStyles,
  setNonStylesConfig,
} from "./types";
import { useCompatSearchParams } from "./useCompatSearchParams";
export { useBookerEmbedEvents, useSlotsViewOnSmallScreen } from "./embed-iframe/react-hooks";

// We don't import it from Booker/types because the types from this module are published to npm and we can't import packages that aren't published
type BookerState = "loading" | "selecting_date" | "selecting_time" | "booking";

// Prerendering is a hidden process and we shouldn't really track any events from it unless absolutely necessary
const eventsAllowedInPrerendering = [
  // so that Postmessage communication starts
  "__iframeReady",
  // so that iframe height is adjusted according to the content, and iframe is ready to be shown when needed
  "__dimensionChanged",
  // When this event is fired, the iframe is still in prerender state but is going to be moved out of prerender state
  "__connectInitiated",

  "linkPrerendered",

  // For other events, we should consider introducing prerender specific events and not reuse existing events
];

declare global {
  interface Window {
    CalEmbed: {
      __logQueue?: unknown[];
      embedStore: typeof embedStore;
      applyCssVars: (cssVarsPerTheme: UiConfig["cssVarsPerTheme"]) => void;
    };
    // Marks that Booker has moved to some non-"loading" state
    _embedBookerState?: EmbedBookerState;
  }
}

let isSafariBrowser = false;

if (isBrowser) {
  window.CalEmbed = window?.CalEmbed || {};
  window.CalEmbed.embedStore = embedStore;
  const ua = navigator.userAgent.toLowerCase();
  isSafariBrowser = ua.includes("safari") && !ua.includes("chrome");
  if (isSafariBrowser) {
    log("Safari Detected: Using setTimeout instead of rAF");
  }
}

const setEmbedStyles = (stylesConfig: EmbedStyles) => {
  embedStore.styles = stylesConfig;
  for (const [, setEmbedStyle] of Object.entries(
    embedStore.reactStylesStateSetters
  )) {
    setEmbedStyle((styles) => {
      return {
        ...styles,
        ...stylesConfig,
      };
    });
  }
};

const setEmbedNonStyles = (stylesConfig: EmbedNonStylesConfig) => {
  embedStore.nonStyles = stylesConfig;
  for (const [, setEmbedStyle] of Object.entries(
    embedStore.reactStylesStateSetters
  )) {
    setEmbedStyle((styles) => {
      return {
        ...styles,
        ...stylesConfig,
      };
    });
  }
};

const registerNewSetter = (
  registration:
    | {
        elementName: keyof EmbedStyles;
        setState: SetStyles;
        styles: true;
      }
    | {
        elementName: keyof EmbedNonStylesConfig;
        setState: setNonStylesConfig;
        styles: false;
      }
) => {
  // It's possible that 'ui' instruction has already been processed and the registration happened due to some action by the user in iframe.
  // So, we should call the setter immediately with available embedStyles
  if (registration.styles) {
    embedStore.reactStylesStateSetters[
      registration.elementName as keyof EmbedStyles
    ] = registration.setState;
    registration.setState(embedStore.styles || {});
    return () => {
      delete embedStore.reactStylesStateSetters[registration.elementName];
    };
  } else {
    embedStore.reactNonStylesStateSetters[
      registration.elementName as keyof EmbedNonStylesConfig
    ] = registration.setState;
    registration.setState(embedStore.nonStyles || {});

    return () => {
      delete embedStore.reactNonStylesStateSetters[registration.elementName];
    };
  }
};

function isValidNamespace(ns: string | null | undefined) {
  return typeof ns !== "undefined" && ns !== null;
}

/**
 * It handles any URL change done through Web history API as well
 * History API is currently being used by Booker/utils/query-param
 */
const useUrlChange = (callback: (newUrl: string) => void) => {
  const currentFullUrl = isBrowser ? new URL(document.URL) : null;
  const pathname = currentFullUrl?.pathname ?? "";
  const searchParams = currentFullUrl?.searchParams ?? null;
  const lastKnownUrl = useRef(`${pathname}?${searchParams}`);
  useEffect(() => {
    const newUrl = `${pathname}?${searchParams}`;
    if (lastKnownUrl.current !== newUrl) {
      lastKnownUrl.current = newUrl;
      callback(newUrl);
    }
  }, [pathname, searchParams, callback]);
};

export const useEmbedTheme = () => {
  const searchParams = useCompatSearchParams();
  const [theme, setTheme] = useState(
    embedStore.theme || (searchParams?.get("theme") as typeof embedStore.theme)
  );

  const onUrlChange = useCallback(() => {
    sdkActionManager?.fire("__routeChanged", {});
  }, []);
  useUrlChange(onUrlChange);

  embedStore.setTheme = setTheme;
  return theme;
};

/**
 * It serves following purposes
 * - Gives consistent values for ui config even after Soft Navigation. When a new React component mounts, it would ensure that the component gets the correct value of ui config
 * - Ensures that all the components using useEmbedUiConfig are updated when ui config changes. It is done by maintaining a list of all non-stale setters.
 */
export const useEmbedUiConfig = () => {
  const [uiConfig, setUiConfig] = useState(embedStore.uiConfig || {});
  embedStore.setUiConfig.push(setUiConfig);
  useEffect(() => {
    return () => {
      const foundAtIndex = embedStore.setUiConfig.findIndex(
        (item) => item === setUiConfig
      );
      // Keep removing the setters that are stale
      embedStore.setUiConfig.splice(foundAtIndex, 1);
    };
  });
  return uiConfig;
};

// TODO: Make it usable as an attribute directly instead of styles value. It would allow us to go beyond styles e.g. for debugging we can add a special attribute identifying the element on which UI config has been applied
export const useEmbedStyles = (elementName: keyof EmbedStyles) => {
  const [, setStyles] = useState<EmbedStyles>({});

  useEffect(() => {
    return registerNewSetter({
      elementName,
      setState: setStyles,
      styles: true,
    });
  }, []);
  const styles = embedStore.styles || {};
  // Always read the data from global embedStore so that even across components, the same data is used.
  return styles[elementName] || {};
};

export const useEmbedNonStylesConfig = (
  elementName: keyof EmbedNonStylesConfig
) => {
  const [, setNonStyles] = useState({} as EmbedNonStylesConfig);

  useEffect(() => {
    return registerNewSetter({
      elementName,
      setState: setNonStyles,
      styles: false,
    });
  }, []);

  // Always read the data from global embedStore so that even across components, the same data is used.
  const nonStyles = embedStore.nonStyles || {};
  return nonStyles[elementName] || {};
};

export const useIsBackgroundTransparent = () => {
  let isBackgroundTransparent = false;
  // TODO: Background should be read as ui.background and not ui.body.background
  const bodyEmbedStyles = useEmbedStyles("body");

  if (bodyEmbedStyles.background === "transparent") {
    isBackgroundTransparent = true;
  }
  return isBackgroundTransparent;
};

export const useBrandColors = () => {
  // TODO: Branding shouldn't be part of ui.styles. It should exist as ui.branding.
  const brandingColors = useEmbedNonStylesConfig(
    "branding"
  ) as EmbedNonStylesConfig["branding"];
  return brandingColors || {};
};

function getNamespace() {
  if (isValidNamespace(embedStore.namespace)) {
    // Persist this so that even if query params changed, we know that it is an embed.
    return embedStore.namespace;
  }
  if (isBrowser) {
    const namespace = window?.getEmbedNamespace?.() ?? null;
    embedStore.namespace = namespace;
    return namespace;
  }
}

function getEmbedType() {
  if (embedStore.embedType) {
    return embedStore.embedType;
  }
  if (isBrowser) {
    const url = new URL(document.URL);
    const embedType = (embedStore.embedType =
      url.searchParams.get("embedType"));
    return embedType;
  }
}

export const useIsEmbed = (embedSsr?: boolean) => {
  const [isEmbed, setIsEmbed] = useState(embedSsr);
  useEffect(() => {
    const namespace = getNamespace();
    const _isValidNamespace = isValidNamespace(namespace);
    if (parent !== window && !_isValidNamespace) {
      log(
        "Looks like you have iframed cal.com but not using Embed Snippet. Directly using an iframe isn't recommended."
      );
    }
    setIsEmbed(window?.isEmbed?.() || false);
  }, []);
  return isEmbed;
};

export const useEmbedType = () => {
  const [state, setState] = useState<string | null | undefined>(null);
  useEffect(() => {
    setState(getEmbedType());
  }, []);
  return state;
};

function makeBodyVisible() {
  // Guard against test environment teardown where document may no longer exist
  if (typeof document === "undefined" || !document.body) {
    return;
  }
  if (document.body.style.visibility !== "visible") {
    document.body.style.visibility = "visible";
  }
  if (document.body.style.opacity !== "1") {
    document.body.style.opacity = "1";
  }
  // Ensure that it stays visible and not reverted by React
  runAsap(() => {
    makeBodyVisible();
  });
}

/**
 * On an embed page, there are two changes done
 * - Body is made invisible
 * - Background is set to transparent
 *
 * This function reverses both of them
 */
function showPageAsNonEmbed() {
  makeBodyVisible();
  resetTransparentBackground();
  function resetTransparentBackground() {
    if (document.body.style.background === "transparent") {
      document.body.style.background = "";
    }
  }
}

async function waitForRenderStateToBeCompleted() {
  return new Promise<void>((resolve) => {
    (function tryToConnect() {
      if (embedStore.renderState !== "completed") {
        runAsap(tryToConnect);
        return;
      }
      resolve();
    })();
  });
}

// It is a map of methods that can be called by parent using doInIframe({method: "methodName", arg: "argument"})
export const methods = {
  ui: function style(uiConfig: UiConfig) {
    // TODO: Create automatic logger for all methods. Useful for debugging.
    log("Method: ui called", uiConfig);
    const stylesConfig = uiConfig.styles;

    if (stylesConfig) {
      console.warn(
        "Cal.diy Embed: `styles` prop is deprecated. Use `cssVarsPerTheme` instead to achieve the same effect. Here is a list of CSS variables that are supported. https://github.com/calcom/cal.diy/blob/main/packages/config/tailwind-preset.js#L19"
      );
    }

    // body can't be styled using React state hook as it is generated by _document.tsx which doesn't support hooks.
    if (stylesConfig?.body?.background) {
      document.body.style.background = stylesConfig.body.background as string;
    }

    if (uiConfig.theme) {
      embedStore.theme = uiConfig.theme as UiConfig["theme"];
      if (embedStore.setTheme) {
        embedStore.setTheme(uiConfig.theme);
      }
    }

    // Merge new values over the old values
    // For cssVarsPerTheme, we need to merge at the theme level to preserve variables from both old and new configs
    const oldCssVarsPerTheme = embedStore.uiConfig?.cssVarsPerTheme;
    const newCssVarsPerTheme = uiConfig.cssVarsPerTheme;
    let mergedCssVarsPerTheme: UiConfig["cssVarsPerTheme"] | undefined;

    if (oldCssVarsPerTheme || newCssVarsPerTheme) {
      mergedCssVarsPerTheme = {} as Record<
        "light" | "dark",
        Record<string, string>
      >;
      const themeKeys = [
        ...(oldCssVarsPerTheme ? Object.keys(oldCssVarsPerTheme) : []),
        ...(newCssVarsPerTheme ? Object.keys(newCssVarsPerTheme) : []),
      ];
      const themes = Array.from(new Set(themeKeys)) as Array<"light" | "dark">;

      for (const theme of themes) {
        mergedCssVarsPerTheme[theme] = {
          ...oldCssVarsPerTheme?.[theme],
          ...newCssVarsPerTheme?.[theme],
        };
      }
    }

    const getExplicitDisableAutoScroll = (config: UiConfig): boolean | undefined => {
      if (
        config.disableAutoScroll === true ||
        config.disableAutofocus === true ||
        config.disableScroll === true ||
        config.autofocus === false ||
        config.scroll === false
      ) {
        return true;
      }
      if (
        config.disableAutoScroll === false ||
        config.disableAutofocus === false ||
        config.disableScroll === false ||
        config.autofocus === true ||
        config.scroll === true
      ) {
        return false;
      }
      return undefined;
    };

    const getExplicitCompact = (config: UiConfig): boolean | undefined => {
      if (
        config.compact === true ||
        config.unpadded === true ||
        config.padding === "none" ||
        config.padding === "compact" ||
        config.layout === "compact"
      ) {
        return true;
      }
      if (
        config.compact === false ||
        config.unpadded === false ||
        config.padding !== undefined ||
        config.layout !== undefined
      ) {
        return false;
      }
      return undefined;
    };

    const disableAutoScroll =
      getExplicitDisableAutoScroll(uiConfig) ??
      embedStore.uiConfig?.disableAutoScroll;

    const compact =
      getExplicitCompact(uiConfig) ??
      embedStore.uiConfig?.compact;

    uiConfig = {
      ...embedStore.uiConfig,
      ...uiConfig,
      ...(disableAutoScroll !== undefined ? { disableAutoScroll, disableAutofocus: disableAutoScroll } : {}),
      ...(compact !== undefined ? { compact, unpadded: compact } : {}),
      ...(mergedCssVarsPerTheme
        ? { cssVarsPerTheme: mergedCssVarsPerTheme }
        : {}),
    };

    if (uiConfig.cssVarsPerTheme) {
      const mappedCssVarsPerTheme = mapOldToNewCssVars(
        uiConfig.cssVarsPerTheme
      );
      window.CalEmbed.applyCssVars(mappedCssVarsPerTheme);
    }

    if (uiConfig.colorScheme) {
      actOnColorScheme(uiConfig.colorScheme);
    }

    if (embedStore.setUiConfig) {
      runAllUiSetters(uiConfig);
    }

    setEmbedStyles(stylesConfig || {});
    setEmbedNonStyles(stylesConfig || {});
  },
  parentKnowsIframeReady: (_unused: unknown) => {
    log("Method: `parentKnowsIframeReady` called");
    // No UI change should happen in sight. Let the parent height adjust and in next cycle show it.
    // Embed background must still remain transparent
    runAsap(function tryInformingLinkReady() {
      if (!isLinkReady({ embedStore })) {
        runAsap(tryInformingLinkReady);
        return;
      }

      // Check page status again before firing linkReady, in case it was set after initialization
      if (hasPageError()) {
        handlePageError(window.CalComPageStatus);
        return;
      }

      makeBodyVisible();
      log("renderState is 'completed'");
      embedStore.renderState = "completed";
      if (isPrerendering()) {
        sdkActionManager?.fire("linkPrerendered", {});
      } else {
        sdkActionManager?.fire("linkReady", {});
      }
    });
  },
  /**
   * Connects new config to prerendered page
   */
  connect: async function connect({
    config,
    params,
  }: {
    config: PrefillAndIframeAttrsConfig;
    // This is basically searchParams simplified as Record<string, string | string[]>
    // So a=1&a=2&b=3 would be {a: ["1", "2"], b: "3"}
    // We can't accept URLSearchParams as it isn't cloneable and thus postMessage doesn't support it
    params: Record<string, string | string[]>;
  }) {
    sdkActionManager?.fire("__connectInitiated", {});
    log("Method: connect, requested with params", { config, params });
    const {
      iframeAttrs: _1,
      "cal.embed.noSlotsFetchOnConnect": noSlotsFetchOnConnect,
      ...queryParamsFromConfig
    } = config;
    // We reset it to allow informing parent again through `__dimensionChanged` event about possibly updated dimensions with changes in config
    embedStore.providedCorrectHeightToParent = false;

    if (noSlotsFetchOnConnect !== "true") {
      log(
        "Method: connect, noSlotsFetchOnConnect is false. Requesting slots re-fetch"
      );
      // Incrementing the version forces the slots call to be made again
      embedStore.connectVersion = embedStore.connectVersion + 1;
    }

    const connectVersion = embedStore.connectVersion;
    // Config is just a typed and more declarative way to pass the query params from the parent(except iframeAttrs which is meant to be consumed by parent and not supposed to passed to child)
    // So, query params can come directly by providing them to calLink or through config
    const toBeThereParams = {
      ...params,
      // Query params from config takes precedence over query params in url
      ...(queryParamsFromConfig as Record<string, string | string[]>),
      "cal.embed.connectVersion": connectVersion.toString(),
    };

    const toRemoveParams = ["preload", "prerender", "cal.skipSlotsFetch"];
    await waitForRenderStateToBeCompleted();

    log("Method: connect, renderState is completed. Connecting");
    await connectPreloadedEmbed({
      // We know after removing iframeAttrs, that it is of this type
      toBeThereParams,
      toRemoveParams,
    });

  },
  __reloadInitiated: function __reloadInitiated(_unused: unknown) {
    log("Method: __reloadInitiated called");
    setReloadInitiated(true);
  },
};

export type InterfaceWithParent = {
  [key in keyof typeof methods]: (
    firstAndOnlyArg: Parameters<(typeof methods)[key]>[number]
  ) => void;
};

export const interfaceWithParent: InterfaceWithParent = methods;

const messageParent = (data: CustomEvent["detail"]) => {
  parent.postMessage(
    {
      originator: "CAL",
      ...data,
    },
    "*"
  );
};

function main() {
  if (!isBrowser) {
    return;
  }
  log("Embed SDK loaded", { isEmbed: window?.isEmbed?.() || false });
  const url = new URL(document.URL);
  embedStore.theme = window?.getEmbedTheme?.();

  const autoScrollFromParam = url.searchParams.get("ui.autoscroll");
  const autoFocusFromParam = url.searchParams.get("ui.autofocus");
  const disableAutoFocusParam = url.searchParams.get("disableAutofocus");
  const scrollFromParam = url.searchParams.get("ui.scroll");
  const disableScrollParam = url.searchParams.get("disableScroll");

  const isAutoScrollDisabled =
    autoScrollFromParam === "false" ||
    autoFocusFromParam === "false" ||
    disableAutoFocusParam === "true" ||
    scrollFromParam === "false" ||
    disableScrollParam === "true";

  const isAutoScrollEnabled =
    autoScrollFromParam === "true" ||
    autoFocusFromParam === "true" ||
    disableAutoFocusParam === "false" ||
    scrollFromParam === "true" ||
    disableScrollParam === "false";

  const shouldDisableAutoScroll = isAutoScrollDisabled && !isAutoScrollEnabled;

  const compactFromParam = url.searchParams.get("ui.compact") ?? url.searchParams.get("compact") ?? url.searchParams.get("ui.unpadded") ?? url.searchParams.get("unpadded");
  const isCompact = compactFromParam === "true" || url.searchParams.get("layout") === "compact";

  const useSlotsViewOnSmallScreenParam = url.searchParams.get(
    "useSlotsViewOnSmallScreen"
  );

  embedStore.uiConfig = {
    // TODO: Add theme as well here
    colorScheme: url.searchParams.get("ui.color-scheme"),
    layout: url.searchParams.get("layout") as BookerLayouts,
    disableAutoScroll: shouldDisableAutoScroll,
    disableAutofocus: shouldDisableAutoScroll,
    compact: isCompact,
    unpadded: isCompact,
    // by default useSlotsViewOnSmallScreen should be false
    useSlotsViewOnSmallScreen:
      (useSlotsViewOnSmallScreenParam ?? "false") === "true",
  };

  actOnColorScheme(embedStore.uiConfig.colorScheme);
  // If embed link is opened in top, and not in iframe. Let the page be visible.
  if (top === window) {
    showPageAsNonEmbed();
    // We would want to avoid a situation where Cal.diy embeds cal.com and then embed-iframe is in the top as well. In such case, we would want to avoid infinite loop of events being passed.
    log("Embed SDK Skipped as we are in top");
    return;
  }

  const willSlotsBeFetched =
    url.searchParams.get("cal.skipSlotsFetch") !== "true";
  log(`Slots will ${willSlotsBeFetched ? "" : "NOT "}be fetched`);

  window.addEventListener("message", (e) => {
    const data: Message = e.data;
    if (!data) {
      return;
    }
    const method: keyof typeof interfaceWithParent = data.method;
    if (data.originator === "CAL" && typeof method === "string") {
      interfaceWithParent[method]?.(data.arg as never);
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target || !(e.target instanceof Node)) {
      return;
    }
    const mainElement =
      document.getElementsByClassName("main")[0] ||
      document.getElementsByTagName("main")[0] ||
      document.documentElement;
    if (e.target.contains(mainElement)) {
      // Because the iframe can take the entire width but the actual content could still be smaller and everything beyond that would be considered backdrop
      sdkActionManager?.fire("__closeIframe", {});
    }
  });

  sdkActionManager?.on("linkReady", () => {
    // Even though linkReady isn't fired in prerendering phase, this is a safe guard for future
    if (isPrerendering()) {
      return;
    }
    resetPageData();
    incrementView();
  });

  sdkActionManager?.on("*", (e) => {
    if (
      isPrerendering() &&
      !eventsAllowedInPrerendering.includes(e.detail.type)
    ) {
      return;
    }
    const detail = e.detail;
    log(detail);
    messageParent(detail);
  });

  if (url.searchParams.get("preload") !== "true" && window?.isEmbed?.()) {
    initializeAndSetupEmbed();
  } else {
    log(
      `Preloaded scenario - Skipping initialization and setup as only assets need to be loaded`
    );
  }
}

/**
 * Checks if there's a page error (non-200 status).
 * @returns true if an error exists, false otherwise
 */
function hasPageError() {
  const pageStatus = window.CalComPageStatus;
  return !!(pageStatus && pageStatus != "200");
}

/**
 * Handles a page error by firing the linkFailed event.
 * @param pageStatus - The error status code (e.g., "404", "500", "403")
 */
function handlePageError(pageStatus: string) {
  sdkActionManager?.fire("linkFailed", {
    code: pageStatus,
    msg: "Problem loading the link",
    data: {
      url: document.URL,
    },
  });
}

function initializeAndSetupEmbed() {
  sdkActionManager?.fire("__iframeReady", {
    isPrerendering: isPrerendering(),
  });

  embedStore.renderState = "inProgress";

  // Only NOT_INITIALIZED -> INITIALIZED transition is allowed
  if (embedStore.state !== EMBED_IFRAME_STATE.NOT_INITIALIZED) {
    log("Embed Iframe already initialized");
    return;
  }
  embedStore.state = EMBED_IFRAME_STATE.INITIALIZED;
  log("Initializing embed-iframe");
  // HACK
  const pageStatus = window.CalComPageStatus;

  if (hasPageError()) {
    handlePageError(pageStatus);
    return;
  } else {
    keepParentInformedAboutDimensionChanges({ embedStore });
  }
}

function runAllUiSetters(uiConfig: UiConfig) {
  // Update EmbedStore so that when a new react component mounts, useEmbedUiConfig can get the persisted value from embedStore.uiConfig
  embedStore.uiConfig = uiConfig;
  embedStore.setUiConfig.forEach((setUiConfig) => setUiConfig(uiConfig));
}

function actOnColorScheme(colorScheme: string | null | undefined) {
  if (!colorScheme) {
    return;
  }
  document.documentElement.style.colorScheme = colorScheme;
}

/**
 * Apply configurations to the preloaded page and then ask parent to show the embed
 * If there is a need to fetch the slots, then the slots would be fetched and then only this function call would complete
 * url has the config as params
 */
async function connectPreloadedEmbed({
  toBeThereParams,
  toRemoveParams,
}: {
  toBeThereParams: Record<string, string | string[]>;
  toRemoveParams: string[];
}) {
  const { hasChanged, stopEnsuringQueryParamsInUrl } =
    embedStore.router.ensureQueryParamsInUrl({
      toBeThereParams,
      toRemoveParams,
    });

  let waitForFrames = 0;

  if (isBookerReady() && hasChanged) {
    // Give some time for react to update state that might lead booker to go to slotsLoading state
    waitForFrames = 2;
  }

  // Booker might alreadyu be in slotsDone state. But we don't know if new getTeamSchedule request would intitiate or not. It would initiate when React updates the state but it might not go depending on if there is no actual state change in useSchedule components
  // But we can know if cal.routedTeamMemberIds is changed. If it is changed, then we reset slotsDone -> slotsLoading.

  // Firing this event would stop the loader and show the embed
  // This causes loader to go away later.
  await new Promise<void>((resolve) => {
    runAsap(function tryToFireLinkReady() {
      if (!isLinkReady({ embedStore }) || waitForFrames > 0) {
        waitForFrames--;
        runAsap(tryToFireLinkReady);
        return;
      }
      // Check page status again before firing linkReady, in case it was set after initialization
      if (hasPageError()) {
        handlePageError(window.CalComPageStatus);
        resolve();
        return;
      }

      // link is ready now, so we could stop doing it.
      // Also the page is visible to user now.
      stopEnsuringQueryParamsInUrl();
      sdkActionManager?.fire("__connectCompleted", {});
      sdkActionManager?.fire("linkReady", {});
      resolve();
    });
  });

  return {
    stopEnsuringQueryParamsInUrl,
  };
}

export function getEmbedBookerState({
  bookerState,
  slotsQuery,
}: {
  bookerState: BookerState;
  slotsQuery: SlotsQuery;
}): EmbedBookerState {
  if (bookerState === "loading") {
    return "initializing";
  }

  if (slotsQuery.isLoading) {
    return "slotsLoading";
  }

  // Pending but not loading, it means that request is intentionally disabled via enabled:false in useQuery
  if (slotsQuery.isPending) {
    return "slotsDone";
  }

  if (slotsQuery.isSuccess) {
    return "slotsDone";
  }

  if (slotsQuery.isError) {
    return "slotsLoadingError";
  }

  return "slotsPending";
}

/**
 * It is meant to sync BookerState to EmbedBookerState
 * This function is meant to be called outside useEffect so that we don't wait for React to re-render before doing our work
 */
export function updateEmbedBookerState({
  bookerState,
  slotsQuery,
}: {
  bookerState: BookerState;
  slotsQuery: SlotsQuery;
}) {
  // Ensure that only after the bookerState is reflected, we update the embedIsBookerReady
  if (typeof window === "undefined") {
    return;
  }

  const _window = window as Window & {
    _embedBookerState?: EmbedBookerState;
  };

  const embedBookerState = getEmbedBookerState({ bookerState, slotsQuery });
  _window._embedBookerState = embedBookerState;
}

main();
