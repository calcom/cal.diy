import React from "react";
import { createStore } from "zustand";
import type { StoreApi } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";

import dayjs from "@calcom/dayjs";
import { CURRENT_TIMEZONE } from "@calcom/lib/timezoneConstants";

import type {
  CalendarComponentProps,
  CalendarPublicActions,
  CalendarState,
  CalendarStoreProps,
} from "../types/state";
import { mergeOverlappingDateRanges, weekdayDates } from "../utils";

const defaultState: CalendarComponentProps = {
  view: "week",
  startDate: weekdayDates(0, new Date()).startDate,
  endDate: weekdayDates(0, new Date()).endDate,
  events: [],
  startHour: 0,
  endHour: 23,
  gridCellsPerHour: 4,
  timezone: CURRENT_TIMEZONE,
  showBackgroundPattern: true,
  showBorder: true,
  borderColor: "default",
  showTimezone: false,
};

export function createCalendarStore(initial?: Partial<CalendarComponentProps>): StoreApi<CalendarStoreProps> {
  return createStore<CalendarStoreProps>((set) => ({
    ...defaultState,
    ...initial,
    setView: (view: CalendarComponentProps["view"]) => set({ view }),
    setStartDate: (startDate: CalendarComponentProps["startDate"]) => set({ startDate }),
    setEndDate: (endDate: CalendarComponentProps["endDate"]) => set({ endDate }),
    setEvents: (events: CalendarComponentProps["events"]) => set({ events }),
    // This looks a bit odd but init state only overrides the public props + actions as we don't want to override our internal state
    initState: (state: CalendarState & CalendarPublicActions) => {
      // Handle sorting of events if required
      let events = state.events;

      if (state.sortEvents) {
        events = [...state.events].sort((a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf());
      }
      const blockingDates = mergeOverlappingDateRanges(state.blockingDates || []); // We merge overlapping dates so we don't get duplicate blocking "Cells" in the UI

      set({
        ...state,
        blockingDates,
        events,
        selectedBookingUid: state.selectedBookingUid,
      });
    },
    setSelectedEvent: (event) => set({ selectedEvent: event }),
    handleDateChange: (payload) =>
      set((state) => {
        const { startDate, endDate } = state;
        if (payload === "INCREMENT") {
          const newStartDate = dayjs(startDate).add(1, state.view).toDate();
          const newEndDate = dayjs(endDate).add(1, state.view).toDate();

          // Do nothing if
          if (
            (state.minDate && newStartDate < state.minDate) ||
            (state.maxDate && newEndDate > state.maxDate)
          ) {
            return {
              startDate,
              endDate,
            };
          }

          // We call this callback if we have it -> Allows you to change your state outside of the component
          state.onDateChange?.(newStartDate, newEndDate);
          return {
            startDate: newStartDate,
            endDate: newEndDate,
          };
        }
        const newStartDate = dayjs(startDate).subtract(1, state.view).toDate();
        const newEndDate = dayjs(endDate).subtract(1, state.view).toDate();
        state.onDateChange?.(newStartDate, newEndDate);
        return {
          startDate: newStartDate,
          endDate: newEndDate,
        };
      }),
  }));
}

export const CalendarStoreContext = React.createContext<StoreApi<CalendarStoreProps> | null>(null);

export function useCalendarStore<T>(
  selector: (state: CalendarStoreProps) => T,
  equalityFn?: (a: T, b: T) => boolean
): T {
  const store = React.useContext(CalendarStoreContext);
  if (!store) {
    throw new Error("useCalendarStore must be used within a CalendarStoreProvider");
  }

  return useStoreWithEqualityFn(store, selector, equalityFn);
}
