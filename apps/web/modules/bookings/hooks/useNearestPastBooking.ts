import type { Dayjs } from "@calcom/dayjs";
import { trpc } from "@calcom/trpc/react";

import { NAVIGATION_PROBE_WINDOW_MONTHS } from "../lib/constants";
import type { BookingListingStatus } from "../types";

interface UseNearestPastBookingProps {
  currentWeekStart: Dayjs;
  filters: {
    statuses: BookingListingStatus[];
    userIds?: number[];
  };
}

/**
 * Probe hook to find the nearest past booking before the current week.
 * Used for calendar view navigation to determine if there are any bookings
 * in the past and to jump directly to the week containing that booking.
 *
 * Uses a broad date range (NAVIGATION_PROBE_WINDOW_MONTHS) but only fetches
 * 1 booking (the nearest one) to minimize data transfer.
 * Uses descending sort to get the closest past booking first.
 */
export function useNearestPastBooking({
  currentWeekStart,
  filters,
}: UseNearestPastBookingProps) {
  // Search from NAVIGATION_PROBE_WINDOW_MONTHS months ago to the start of current week
  const afterDate = currentWeekStart.subtract(NAVIGATION_PROBE_WINDOW_MONTHS, "month").startOf("day");
  const beforeDate = currentWeekStart.startOf("day");

  const query = trpc.viewer.bookings.get.useQuery(
    {
      filters: {
        statuses: filters.statuses,
        userIds: filters.userIds,
        afterStartDate: afterDate.toISOString(),
        beforeEndDate: beforeDate.toISOString(),
      },
      limit: 1, // Only need the nearest one
      sort: { sortStart: "desc" }, // Get the closest past booking first
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
