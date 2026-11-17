import { type BookerLayoutSettings, bookerLayoutOptions } from "@calcom/prisma/zod-utils";

export const validateBookerLayouts = (settings: BookerLayoutSettings) => {
  // Allow layouts to be null, as per database defaults.
  if (settings === null) return;

  // At least one layout should be enabled.
  const atLeastOneLayoutIsEnabled = settings?.enabledLayouts.length > 0;
  if (!atLeastOneLayoutIsEnabled) return "bookerlayout_error_min_one_enabled";

  // Default layout should also be enabled.
  const defaultLayoutIsInEnabledLayouts = settings?.enabledLayouts.find(
    (layout) => layout === settings.defaultLayout
  );

  if (!defaultLayoutIsInEnabledLayouts) return "bookerlayout_error_default_not_enabled";

  // Validates that users don't try to insert an unknown layout into DB.
  const enabledLayoutsDoesntContainUnknownLayout = settings?.enabledLayouts.every((layout) =>
    bookerLayoutOptions.includes(layout)
  );
  const defaultLayoutIsKnown = bookerLayoutOptions.includes(settings.defaultLayout);

  if (!enabledLayoutsDoesntContainUnknownLayout || !defaultLayoutIsKnown) {
    return "bookerlayout_error_unknown_layout";
  }
};

// export const getEnabledLayouts =
