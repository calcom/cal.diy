import dayjs from "@calcom/dayjs";
import { useBookerStoreContext } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import { useOverlayCalendarStore } from "@calcom/features/bookings/Booker/components/OverlayCalendar/store";
import type { ToggledConnectedCalendars } from "@calcom/features/bookings/Booker/types";
import { useTimePreferences } from "@calcom/features/bookings/lib";
import { localStorage } from "@calcom/lib/webstorage";
import { trpc } from "@calcom/trpc/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { shallow } from "zustand/shallow";

type UseCalendarsProps = {
  hasSession: boolean;
  lastVisibleDate: string | null;
};

// Week view shows extraDays consecutive days, column view the next extraDays days that have availability
export const getLastVisibleDate = ({
  selectedDate,
  layout,
  extraDays,
  availableDays,
}: {
  selectedDate: string | null;
  layout: string;
  extraDays: number;
  availableDays: string[];
}) => {
  if (!selectedDate) return null;
  if (layout === "column_view") {
    const shownDays = availableDays
      .filter((day) => !dayjs(day).isBefore(selectedDate, "day"))
      .slice(0, Math.max(extraDays, 1));
    return shownDays[shownDays.length - 1] ?? selectedDate;
  }
  return dayjs(selectedDate)
    .add(Math.max(extraDays - 1, 0), "day")
    .format("YYYY-MM-DD");
};

// dateTo must be the end of the last day, a bare date would be read as midnight at its start
export const getOverlayDateRange = (selectedDate: string | null, lastVisibleDate: string | null) => {
  if (!selectedDate) return { dateFrom: null, dateTo: null };
  const firstDay = dayjs(selectedDate).startOf("day");
  const lastDay = dayjs.max(firstDay, dayjs(lastVisibleDate ?? selectedDate)).endOf("day");
  return { dateFrom: firstDay.format(), dateTo: lastDay.format() };
};

export const useCalendars = ({ hasSession, lastVisibleDate }: UseCalendarsProps) => {
  const searchParams = useSearchParams();
  // The date picker writes to the context store, the legacy global store only knows the date from the URL at load
  const selectedDate = useBookerStoreContext((state) => state.selectedDate);
  const { timezone } = useTimePreferences();
  const switchEnabled =
    searchParams?.get("overlayCalendar") === "true" ||
    localStorage?.getItem("overlayCalendarSwitchDefault") === "true";

  const [set, setSet] = useState<Set<ToggledConnectedCalendars>>(() => {
    const storedValue = localStorage.getItem("toggledConnectedCalendars");
    return storedValue ? new Set(JSON.parse(storedValue)) : new Set([]);
  });

  const [calendarSettingsOverlay] = useOverlayCalendarStore(
    (state) => [state.calendarSettingsOverlayModal, state.setCalendarSettingsOverlayModal],
    shallow
  );

  const { dateFrom, dateTo } = getOverlayDateRange(selectedDate, lastVisibleDate);
  const { data: overlayBusyDates, isError } = trpc.viewer.availability.calendarOverlay.useQuery(
    {
      loggedInUsersTz: timezone || "Europe/London",
      dateFrom,
      dateTo,
      calendarsToLoad: Array.from(set).map((item) => ({
        credentialId: item.credentialId,
        externalId: item.externalId,
      })),
    },
    {
      enabled: hasSession && set.size > 0 && switchEnabled,
    }
  );

  useEffect(
    function refactorMeWithoutEffect() {
      if (!isError) return;
      setSet(new Set([]));
    },
    [isError]
  );

  const { data, isPending } = trpc.viewer.calendars.connectedCalendars.useQuery(
    {
      skipSync: true,
    },
    {
      enabled: !!calendarSettingsOverlay || Boolean(searchParams?.get("overlayCalendar")),
    }
  );

  return {
    overlayBusyDates,
    isOverlayCalendarEnabled: switchEnabled,
    connectedCalendars: data?.connectedCalendars || [],
    loadingConnectedCalendar: isPending,
    onToggleCalendar: setSet,
  };
};
