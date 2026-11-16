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
      const nowDate = dayjs();
      const usersTimezoneDate = nowDate.tz(timezone);

      const offset = (usersTimezoneDate.utcOffset() - nowDate.utcOffset()) / 60;

      const offsettedArray = overlayBusyDates.map((item) => {
        return {
          ...item,
          start: dayjs(item.start).add(offset, "hours").toDate(),
          end: dayjs(item.end).add(offset, "hours").toDate(),
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
