import { useEffect, useState } from "react";
import { shallow } from "zustand/shallow";

import dayjs from "@calcom/dayjs";
import { useOverlayCalendarStore } from "@calcom/features/bookings/Booker/components/OverlayCalendar/store";
import type { ToggledConnectedCalendars } from "@calcom/features/bookings/Booker/types";
import { useTimePreferences } from "@calcom/features/bookings/lib";

import type { WrappedBookerPropsMain } from "../types";
import { useLocalSet } from "@calcom/features/bookings/Booker/hooks/useLocalSet";

export const useOverlayCalendar = ({
  connectedCalendars,
  overlayBusyDates,
  onToggleCalendar,
}: Pick<
  WrappedBookerPropsMain["calendars"],
  "overlayBusyDates" | "onToggleCalendar" | "connectedCalendars"
>): {
  isOpenOverlayContinueModal: boolean;
  isOpenOverlaySettingsModal: boolean;
  handleCloseContinueModal: (val: boolean) => void;
  handleCloseSettingsModal: (val: boolean) => void;
  handleToggleConnectedCalendar: (externalCalendarId: string, credentialId: number) => void;
  checkIsCalendarToggled: (externalId: string, credentialId: number) => boolean;
} => {
  const { set, addValue, toggleValue, hasItem } = useLocalSet<ToggledConnectedCalendars>(
    "toggledConnectedCalendars",
    []
  );
  const [initalised, setInitalised] = useState(false);
  const [continueWithProvider, setContinueWithProvider] = useOverlayCalendarStore(
    (state) => [state.continueWithProviderModal, state.setContinueWithProviderModal],
    shallow
  );
  const [calendarSettingsOverlay, setCalendarSettingsOverlay] = useOverlayCalendarStore(
    (state) => [state.calendarSettingsOverlayModal, state.setCalendarSettingsOverlayModal],
    shallow
  );
  const setOverlayBusyDates = useOverlayCalendarStore((state) => state.setOverlayBusyDates);
  const { timezone } = useTimePreferences();

  useEffect(() => {
    if (overlayBusyDates) {
      const offsettedArray = overlayBusyDates.map((item) => {
        // Compute the browser->selected timezone shift per busy instant: a fixed
        // offset taken from "now" is wrong for dates in a different DST period
        // when the browser and selected timezones follow different DST rules.
        const shiftedToSelectedTz = (value: string | Date) => {
          const date = dayjs(value);
          const shiftFor = (d: typeof date) => (d.tz(timezone).utcOffset() - d.utcOffset()) / 60;
          // First pass: offsets at the original instant.
          let shift = shiftFor(date);
          let shifted = date.add(shift, "hours");
          // The browser (or selected) offset at the shifted instant can differ
          // across a DST transition; recompute once so the shifted wall clock
          // matches the original instant's wall clock in the selected timezone.
          const correctedShift = shiftFor(shifted);
          if (correctedShift !== shift) {
            shifted = date.add(correctedShift, "hours");
          }
          return shifted.toDate();
        };
        return {
          ...item,
          start: shiftedToSelectedTz(item.start),
          end: shiftedToSelectedTz(item.end),
        };
      });
      setOverlayBusyDates(offsettedArray);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayBusyDates]);

  useEffect(() => {
    // Wait for the connected calendars to load, otherwise we'd initialise with nothing
    if (connectedCalendars?.length && set.size === 0 && !initalised) {
      // Start with the calendars the user checks for conflicts, that's what they consider themselves busy with
      const defaultCalendars = connectedCalendars.flatMap((item) =>
        (item.calendars ?? [])
          .filter((cal) => cal.isSelected ?? cal.primary)
          .map((cal) => ({ credentialId: item.credentialId, externalId: cal.externalId }))
      );
      defaultCalendars.forEach(addValue);
      onToggleCalendar(new Set(defaultCalendars));
      setInitalised(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasItem, set, initalised]);

  const handleToggleConnectedCalendar = (externalCalendarId: string, credentialId: number): void => {
    const calendarsToLoad = toggleValue({
      credentialId: credentialId,
      externalId: externalCalendarId,
    });
    setOverlayBusyDates([]);
    onToggleCalendar(calendarsToLoad);
  };

  return {
    isOpenOverlayContinueModal: continueWithProvider,
    isOpenOverlaySettingsModal: calendarSettingsOverlay,
    handleCloseContinueModal: (val: boolean) => setContinueWithProvider(val),
    handleCloseSettingsModal: (val: boolean) => setCalendarSettingsOverlay(val),
    handleToggleConnectedCalendar,
    checkIsCalendarToggled: (externalId: string, credentialId: number) => {
      return hasItem({
        credentialId: credentialId,
        externalId: externalId,
      });
    },
  };
};
