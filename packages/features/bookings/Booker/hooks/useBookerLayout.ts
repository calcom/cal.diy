import { useEffect, useRef } from "react";
import { shallow } from "zustand/shallow";

import {
  useEmbedType,
  useEmbedUiConfig,
  useIsEmbed,
  useSlotsViewOnSmallScreen,
} from "@calcom/embed-core/embed-iframe";
import { useBookerStoreContext } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import { extraDaysConfig } from "@calcom/features/bookings/Booker/config";
import type { BookerLayout } from "@calcom/features/bookings/Booker/types";
import { validateLayout } from "@calcom/features/bookings/Booker/utils/layout";
import { getQueryParam } from "@calcom/features/bookings/Booker/utils/query-param";
import type { BookerEvent } from "@calcom/features/bookings/types";
import useMediaQuery from "@calcom/lib/hooks/useMediaQuery";
import type { BookerLayouts } from "@calcom/prisma/zod-utils";
import { defaultBookerLayoutSettings } from "@calcom/prisma/zod-utils";

export type UseBookerLayoutType = ReturnType<typeof useBookerLayout>;

export const useBookerLayout = (
  profileBookerLayouts: BookerEvent["profile"]["bookerLayouts"] | undefined | null
) => {
  const [_layout, setLayout] = useBookerStoreContext((state) => [state.layout, state.setLayout], shallow);
  const isEmbed = useIsEmbed();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isTablet = useMediaQuery("(max-width: 1024px)");
  const embedUiConfig = useEmbedUiConfig();
  // In Embed we give preference to embed configuration for the layout.If that's not set, we use the App configuration for the event layout
  // But if it's mobile view, there is only one layout supported which is 'mobile'
  const layout = isEmbed ? (isMobile ? "mobile" : validateLayout(embedUiConfig.layout) || _layout) : _layout;
  const extraDays = isTablet ? extraDaysConfig[layout].tablet : extraDaysConfig[layout].desktop;
  const embedType = useEmbedType();
  // Floating Button and Element Click both are modal and thus have dark background
  const hasDarkBackground = isEmbed && embedType !== "inline";
  const columnViewExtraDays = useRef<number>(
    isTablet ? extraDaysConfig[layout].tablet : extraDaysConfig[layout].desktop
  );
  const bookerLayouts = profileBookerLayouts || defaultBookerLayoutSettings;
  const queryParamLayout = getQueryParam("layout") as BookerLayouts;
  const validQueryLayout =
    !isEmbed &&
    validateLayout(queryParamLayout) &&
    bookerLayouts?.enabledLayouts?.find((userLayout) => userLayout === queryParamLayout);
  const defaultLayout = isEmbed
    ? validateLayout(embedUiConfig.layout) || bookerLayouts.defaultLayout
    : validQueryLayout || bookerLayouts.defaultLayout;

  useEffect(() => {
    if (isMobile && layout !== "mobile") {
      setLayout("mobile");
    } else if (!isMobile && layout === "mobile") {
      setLayout(defaultLayout);
    }
  }, [isMobile, setLayout, layout, defaultLayout]);
  //setting layout from query param
  useEffect(() => {
    const layout = getQueryParam("layout") as BookerLayouts;
    if (
      !isMobile &&
      !isEmbed &&
      validateLayout(layout) &&
      bookerLayouts?.enabledLayouts?.length &&
      layout !== _layout
    ) {
      const validLayout = bookerLayouts.enabledLayouts.find((userLayout) => userLayout === layout);
      if (validLayout) setLayout(validLayout);
    }
  }, [bookerLayouts, setLayout, _layout, isEmbed, isMobile]);

  // In Embed, a Dialog doesn't look good, we disable it intentionally for the layouts that support showing Form without Dialog(i.e. no-dialog Form)
  const shouldShowFormInDialogMap: Record<BookerLayout, boolean> = {
    // mobile supports showing the Form without Dialog
    mobile: !isEmbed,
    // We don't show Dialog in month_view currently. Can be easily toggled though as it supports no-dialog Form
    month_view: false,
    // week_view doesn't support no-dialog Form
    // When it's supported, disable it for embed
    week_view: true,
    // column_view doesn't support no-dialog Form
    // When it's supported, disable it for embed
    column_view: true,
  };

  const shouldShowFormInDialog = shouldShowFormInDialogMap[layout];

  const hideEventTypeDetailsParam = getQueryParam("hideEventTypeDetails");
  const hideEventTypeDetails = isEmbed
    ? embedUiConfig.hideEventTypeDetails
    : typeof hideEventTypeDetailsParam === "string"
      ? hideEventTypeDetailsParam === "true"
      : false;

  const slotsViewOnSmallScreen = useSlotsViewOnSmallScreen();

  return {
    shouldShowFormInDialog,
    hasDarkBackground,
    extraDays,
    columnViewExtraDays,
    isMobile,
    isEmbed,
    isTablet,
    layout,
    defaultLayout,
    hideEventTypeDetails,
    slotsViewOnSmallScreen,
    bookerLayouts,
  };
};
