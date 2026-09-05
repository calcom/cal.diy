import { updateEmbedBookerState } from "@calcom/embed-core/src/embed-iframe";
import { sdkActionManager } from "@calcom/embed-core/src/sdk-event";
import { useBookerStore } from "@calcom/features/bookings/Booker/store";
import { isBookingDryRun } from "@calcom/features/bookings/Booker/utils/isBookingDryRun";
import { getUsernameList } from "@calcom/features/eventtypes/lib/defaultEvents";
import { useTimesForSchedule } from "@calcom/features/schedules/hooks/useTimesForSchedule";
import { getRoutedTeamMemberIdsFromSearchParams } from "@calcom/lib/bookings/getRoutedTeamMemberIdsFromSearchParams";
import { PUBLIC_QUERY_AVAILABLE_SLOTS_INTERVAL_SECONDS } from "@calcom/lib/constants";
import { trpc } from "@calcom/trpc/react";
import { useSearchParams } from "next/navigation";
import { useApiV2AvailableSlots } from "./useApiV2AvailableSlots";

export type UseScheduleWithCacheArgs = {
  username?: string | null;
  eventSlug?: string | null;
  eventId?: number | null;
  month?: string | null;
  timezone?: string | null;
  selectedDate?: string | null;
  duration?: number | null;
  dayCount?: number | null;
  rescheduleUid?: string | null;
  isTeamEvent?: boolean;
  orgSlug?: string;
  teamMemberEmail?: string | null;
  useApiV2?: boolean;
  /***
   * Required when prefetching is needed
   */
  bookerLayout?: {
    layout: string;
    extraDays: number;
    columnViewExtraDays: { current: number };
  };
};

const getAvailabilityLoadedEventPayload = ({
  eventId,
  eventSlug,
}: {
  eventId: number;
  eventSlug: string;
}) => {
  return {
    eventId,
    eventSlug,
  };
};

export const useSchedule = ({
  month,
  timezone,
  username,
  eventSlug,
  eventId,
  selectedDate,
  duration,
  dayCount,
  rescheduleUid,
  isTeamEvent,
  orgSlug,
  teamMemberEmail,
  useApiV2 = false,
  bookerLayout,
}: UseScheduleWithCacheArgs) => {
  const bookerState = useBookerStore((state) => state.state);

  const [startTime, endTime] = useTimesForSchedule({
    month,
    dayCount,
    selectedDate,
    bookerLayout,
  });
  const searchParams = useSearchParams();
  const routedTeamMemberIds = searchParams
    ? getRoutedTeamMemberIdsFromSearchParams(new URLSearchParams(searchParams.toString()))
    : null;
  const skipContactOwner = searchParams ? searchParams.get("cal.skipContactOwner") === "true" : false;
  const utils = trpc.useUtils();
  const queuedFormResponseId = searchParams?.get("cal.queuedFormResponseId");
  const email = searchParams?.get("email");
  // We allow skipping the schedule fetch as a requirement for prerendering in iframe through embed as when the pre-rendered iframe is connected, then we would fetch the availability, which would be upto-date
  // Also, a reuse through Headless Router could completely change the availability as different team members are selected and thus it is unnecessary to fetch the schedule
  const skipGetSchedule = searchParams?.get("cal.skipSlotsFetch") === "true";
  const embedConnectVersion = searchParams?.get("cal.embed.connectVersion") || "0";
  const input = {
    isTeamEvent,
    usernameList: getUsernameList(username ?? ""),
    // Prioritize slug over id, since slug is the first value we get available.
    // If we have a slug, we don't need to fetch the id.
    // TODO: are queries using eventTypeId faster? Even tho we lost time fetching the id with the slug.
    ...(eventSlug ? { eventTypeSlug: eventSlug } : { eventTypeId: eventId ?? 0 }),
    // @TODO: Old code fetched 2 days ago if we were fetching the current month.
    // Do we want / need to keep that behavior?
    startTime,
    // if `prefetchNextMonth` is true, two months are fetched at once.
    endTime,
    // We use a placeholder value that is there to keep TS happy, but still invalid to tell us that it shouldn't actually be passed in request(and wouldn't because enabled is false if timezone is nullish)
    // TODO: Better approach here is to use `skipToken` from react-query which requires an upgrade of react-query
    timeZone: timezone ?? "PLACEHOLDER_TIMEZONE",
    duration: duration ? `${duration}` : undefined,
    rescheduleUid,
    orgSlug,
    teamMemberEmail,
    routedTeamMemberIds,
    skipContactOwner,
    ...(queuedFormResponseId ? { queuedFormResponseId } : {}),
    email,
    // Ensures that connectVersion causes a refresh of the data
    ...(embedConnectVersion ? { embedConnectVersion } : {}),
    _isDryRun: searchParams ? isBookingDryRun(searchParams) : false,
  };

  const options = {
    trpc: {
      context: {
        skipBatch: true,
      },
    },
    // It allows people who might not have the tab in focus earlier, to get latest available slots
    // It might not work correctly in iframes, so we have refetchInterval to take care of that.
    // But where it works, it should give user latest availability even if they come back to tab before refetchInterval.
    refetchOnWindowFocus: true,
    // It allows long sitting users to get latest available slots
    refetchInterval: PUBLIC_QUERY_AVAILABLE_SLOTS_INTERVAL_SECONDS * 1000,
    enabled:
      !skipGetSchedule &&
      Boolean(username) &&
      Boolean(month) &&
      Boolean(timezone) &&
      // Should only wait for one or the other, not both.
      (Boolean(eventSlug) || Boolean(eventId) || eventId === 0),
  };

  const isCallingApiV2Slots = useApiV2 && Boolean(isTeamEvent) && options.enabled;

  // API V2 query for team events
  const teamScheduleV2 = useApiV2AvailableSlots({
    ...input,
    enabled: isCallingApiV2Slots,
    duration: input.duration ? Number(input.duration) : undefined,
    routedTeamMemberIds: input.routedTeamMemberIds ?? undefined,
    teamMemberEmail: input.teamMemberEmail ?? undefined,
    eventTypeId: eventId ?? undefined,
  });

  const schedule = trpc.viewer.slots.getSchedule.useQuery(input, {
    ...options,
    // Only enable if we're not using API V2
    enabled: options.enabled && !isCallingApiV2Slots,
  });

  if (isCallingApiV2Slots && !teamScheduleV2.failureReason) {
    updateEmbedBookerState({
      bookerState,
      slotsQuery: teamScheduleV2,
    });

    if (teamScheduleV2.isSuccess && eventId && eventSlug) {
      sdkActionManager?.fire("availabilityLoaded", getAvailabilityLoadedEventPayload({ eventId, eventSlug }));
    }

    return {
      ...teamScheduleV2,
      /**
       * Invalidates the request and resends it regardless of any other configuration including staleTime
       */
      invalidate: () => {
        return teamScheduleV2.refetch();
      },
    };
  }

  updateEmbedBookerState({
    bookerState,
    slotsQuery: schedule,
  });

  if (schedule.isSuccess && eventId && eventSlug) {
    sdkActionManager?.fire("availabilityLoaded", getAvailabilityLoadedEventPayload({ eventId, eventSlug }));
  }

  return {
    ...schedule,
    /**
     * Invalidates the request and resends it regardless of any other configuration including staleTime
     */
    invalidate: () => {
      return utils.viewer.slots.getSchedule.invalidate(input);
    },
  };
};
