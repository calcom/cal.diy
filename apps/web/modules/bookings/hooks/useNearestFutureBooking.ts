import type { Dayjs } from "@calcom/dayjs";
import { trpc } from "@calcom/trpc/react";

import { NAVIGATION_PROBE_WINDOW_MONTHS } from "../lib/constants";
import type { BookingListingStatus } from "../types";

interface UseNearestFutureBookingProps {
  currentWeekStart: Dayjs;
  filters: {
    statuses: BookingListingStatus[];
    userIds?: number[];
  };
}

/**
 * Probe hook to find the nearest future booking after the current week.
 * Used for calendar view navigation to determine if there are any bookings
 * in the future and to jump directly to the week containing that booking.
 *
 * Uses a broad date range (NAVIGATION_PROBE_WINDOW_MONTHS) but only fetches
 * 1 booking (the nearest one) to minimize data transfer.
 */
export function useNearestFutureBooking({
  currentWeekStart,
  filters,
}: UseNearestFutureBookingProps) {
  // Search from the end of current week to NAVIGATION_PROBE_WINDOW_MONTHS months ahead
  const afterDate = currentWeekStart.add(1, "week").startOf("day");
  const beforeDate = currentWeekStart.add(NAVIGATION_PROBE_WINDOW_MONTHS, "month").endOf("day");

  const query = trpc.viewer.bookings.get.useQuery(
    {
      filters: {
        statuses: filters.statuses,
        userIds: filters.userIds,
        afterStartDate: afterDate.toISOString(),
        beforeEndDate: beforeDate.toISOString(),
      },
      limit: 1, // Only need the nearest one
      // Default sort for "upcoming" status is ASC, which gives us the nearest future booking
    },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );

  return {
    nearestBooking: query.data?.bookings[0] ?? null,
    isLoading: query.isLoading,
  };
}
