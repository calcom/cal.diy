import type { CSSProperties } from "react";

type Theme = "dark" | "light";
export type EmbedThemeConfig = Theme | "auto";

export type BookerLayouts = "month_view" | "week_view" | "column_view" | "compact";
export type AllPossibleLayouts = BookerLayouts | "mobile";
// Only allow certain styles to be modified so that when we make any changes to HTML, we know what all embed styles might be impacted.
// Keep this list to minimum, only adding those styles which are really needed.
export interface EmbedStyles {
  body?: Pick<CSSProperties, "background">;
  eventTypeListItem?: Pick<CSSProperties, "background" | "color" | "backgroundColor">;
  enabledDateButton?: Pick<CSSProperties, "background" | "color" | "backgroundColor">;
  disabledDateButton?: Pick<CSSProperties, "background" | "color" | "backgroundColor">;
  availabilityDatePicker?: Pick<CSSProperties, "background" | "color" | "backgroundColor">;
}

export interface EmbedNonStylesConfig {
  /** Default would be center */
  align?: "left";
  branding?: {
    brandColor?: string;
  };
}

export type UiConfig = {
  hideEventTypeDetails?: boolean;
  // If theme not provided we would get null
  theme?: EmbedThemeConfig | null;
  styles?: EmbedStyles & EmbedNonStylesConfig;
  //TODO: Extract from tailwind the list of all custom variables and support them in auto-completion as well as runtime validation. Followup with listing all variables in Embed Snippet Generator UI.
  cssVarsPerTheme?: Record<Theme, Record<string, string>>;
  layout?: BookerLayouts;
  colorScheme?: string | null;
  disableAutoScroll?: boolean;
  disableAutofocus?: boolean;
  autofocus?: boolean;
  scroll?: boolean;
  disableScroll?: boolean;
  compact?: boolean;
  padding?: "none" | "compact" | "default" | string;
  unpadded?: boolean;
  useSlotsViewOnSmallScreen?: boolean;
};

declare global {
  interface Window {
    CalComPageStatus: string;
    isEmbed?: () => boolean;
    getEmbedNamespace: () => string | null;
    getEmbedTheme: () => EmbedThemeConfig | null;
  }
}

export type EmbedPageType =
  // First page of booker for team event
  | "team.event.booking.slots"
  // First page of booker for user event
  | "user.event.booking.slots"
  // Booking Form(Second page of booker) for team event
  | "team.event.booking.form"
  // Booking Form(Second page of booker) for user event
  | "user.event.booking.form";

export type KnownConfig = {
  // TODO: It should have a dedicated prefill prop
  // prefill: {},
  "flag.coep"?: "true" | "false";

  // TODO: Move layout and theme as nested props of ui as it makes it clear that these two can be configured using `ui` instruction as well any time.
  // ui: {layout; theme}
  layout?: BookerLayouts;
  // TODO: Rename layout and theme as ui.layout and ui.theme as it makes it clear that these two can be configured using `ui` instruction as well any time.
  "ui.color-scheme"?: string;
  "ui.autoscroll"?: "true" | "false";
  "ui.autofocus"?: "true" | "false";
  "ui.scroll"?: "true" | "false";
  "ui.compact"?: "true" | "false";
  "ui.unpadded"?: "true" | "false";
  disableAutofocus?: "true" | "false";
  disableScroll?: "true" | "false";
  compact?: "true" | "false";
  unpadded?: "true" | "false";
  theme?: EmbedThemeConfig;
  // Prefixing with cal.embed because there could be more query params that aren't required by embed and are used for things like prefilling booking form, configuring dry run, and some other params simply to be forwarded to the booking success redirect URL.
  // There are some cal. prefixed query params as well, not meant for embed specifically, but in general for cal.com
  "cal.embed.pageType"?: EmbedPageType;
  // If true, then when doing a "connect" with pre-rendered iframe, we won't fetch slots. This is useful when we are reusing the iframe fully as is.
  "cal.embed.noSlotsFetchOnConnect"?: "true" | "false";
  // If true, enables slots view on small screen in the booker
  useSlotsViewOnSmallScreen?: "true" | "false";
};

export type EmbedBookerState =
  | "initializing"
  | "slotsPending"
  | "slotsLoading"
  /**
   * When slots have loaded
   * Even when slots aren't requested, due to cal.skipSlotFetch, then also this state is achieved
   */
  | "slotsDone"
  | "slotsLoadingError";

export type SlotsStatus = "loading" | "success" | "error";
export type SlotsQuery = {
  isPending?: boolean;
  isError?: boolean;
  isSuccess?: boolean;
  isLoading?: boolean;
};

/**
 * All types of config that are critical to be processed as soon as possible are provided as query params to the iframe
 */
export type PrefillAndIframeAttrsConfig = Record<string, string | string[] | Record<string, string>> & {
  // TODO: iframeAttrs shouldn't be part of it as that configures the iframe element and not the iframed app.
  iframeAttrs?: Record<string, string> & {
    id?: string;
  };
} & KnownConfig;

export type SetStyles = React.Dispatch<React.SetStateAction<EmbedStyles>>;
export type setNonStylesConfig = React.Dispatch<React.SetStateAction<EmbedNonStylesConfig>>;

export type ModalPrerenderOptions = {
  slotsStaleTimeMs?: number;
  iframeForceReloadThresholdMs?: number;
  backgroundSlotsFetch?: boolean;
};
