/* eslint-disable react-hooks/exhaustive-deps */

import dayjs from "@calcom/dayjs";
import {
  BookerStoreContext,
  BookerStoreProvider,
  useBookerStoreContext,
  useInitializeBookerStoreContext,
} from "@calcom/features/bookings/Booker/BookerStoreProvider";
import { useBookerLayout } from "@calcom/features/bookings/Booker/hooks/useBookerLayout";
import { useBookingForm } from "@calcom/features/bookings/Booker/hooks/useBookingForm";
import { useLocalSet } from "@calcom/features/bookings/Booker/hooks/useLocalSet";
import { useStableTimezone } from "@calcom/features/bookings/Booker/hooks/useStableTimezone";
import { useInitializeBookerStore } from "@calcom/features/bookings/Booker/store";
import { useTimePreferences } from "@calcom/features/bookings/lib";
import type { ConnectedDestinationCalendars } from "@calcom/features/calendars/lib/getConnectedDestinationCalendars";
import { getUsernameList } from "@calcom/features/eventtypes/lib/defaultEvents";
import { useTimesForSchedule } from "@calcom/features/schedules/hooks/useTimesForSchedule";
import { getRoutedTeamMemberIdsFromSearchParams } from "@calcom/lib/bookings/getRoutedTeamMemberIdsFromSearchParams";
import { localStorage } from "@calcom/lib/webstorage";
import { BookerLayouts } from "@calcom/prisma/zod-utils";
import { Booker as BookerComponent } from "@calcom/web/modules/bookings/components/Booker";
import { useQueryClient } from "@tanstack/react-query";
import debounce from "lodash/debounce";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";
import { useCreateBooking } from "../hooks/bookings/useCreateBooking";
import { useCreateRecurringBooking } from "../hooks/bookings/useCreateRecurringBooking";
import {
  QUERY_KEY as BOOKING_RESCHEDULE_KEY,
  useGetBookingForReschedule,
} from "../hooks/bookings/useGetBookingForReschedule";
import { useHandleBookEvent } from "../hooks/bookings/useHandleBookEvent";
import { useAtomGetPublicEvent } from "../hooks/event-types/public/useAtomGetPublicEvent";
import { useAtomsContext } from "../hooks/useAtomsContext";
import { useAvailableSlots } from "../hooks/useAvailableSlots";
import { useCalendarsBusyTimes } from "../hooks/useCalendarsBusyTimes";
import { useConnectedCalendars } from "../hooks/useConnectedCalendars";
import { useMe } from "../hooks/useMe";
import { useSlots } from "../hooks/useSlots";
import { useVerifyCode } from "../hooks/useVerifyCode";
import { useVerifyEmail } from "../hooks/useVerifyEmail";
import { AtomsWrapper } from "../src/components/atoms-wrapper";
import type {
  BookerPlatformWrapperAtomPropsForIndividual,
  BookerPlatformWrapperAtomPropsForTeam,
  BookerStoreValues,
} from "./types";

const BookerPlatformWrapperComponent = (
  props: BookerPlatformWrapperAtomPropsForIndividual | BookerPlatformWrapperAtomPropsForTeam
) => {
  const {
    view = "MONTH_VIEW",
    bannerUrl,
    embedSearchParams,
    teamMemberEmail,
    crmAppSlug,
    crmOwnerRecordType,
    preventEventTypeRedirect,
    onBookerStateChange,
    allowUpdatingUrlParams = false,
    confirmButtonDisabled,
    isBookingDryRun,
    handleSlotReservation,
    onTimeslotsLoaded,
    startTime: customStartTime,
    showNoAvailabilityDialog,
    silentlyHandleCalendarFailures = false,
    hideEventMetadata = false,
    defaultPhoneCountry,
    rrHostSubsetIds,
    hideOrgTeamAvatar = false,
  } = props;
  const layout = BookerLayouts[view];

  const { clientId } = useAtomsContext();
  const teamId: number | undefined = props.isTeamEvent ? props.teamId : undefined;
  const [_bookerState, setBookerState] = useBookerStoreContext(
    (state) => [state.state, state.setState],
    shallow
  );
  const setSelectedDate = useBookerStoreContext((state) => state.setSelectedDate);
  const setSelectedDuration = useBookerStoreContext((state) => state.setSelectedDuration);
  const setBookingData = useBookerStoreContext((state) => state.setBookingData);
  const setOrg = useBookerStoreContext((state) => state.setOrg);
  const bookingData = useBookerStoreContext((state) => state.bookingData);
  const setSelectedTimeslot = useBookerStoreContext((state) => state.setSelectedTimeslot);
  const setSelectedMonth = useBookerStoreContext((state) => state.setMonth);
  const selectedDuration = useBookerStoreContext((state) => state.selectedDuration);

  const [isOverlayCalendarEnabled, setIsOverlayCalendarEnabled] = useState(
    Boolean(localStorage?.getItem?.("overlayCalendarSwitchDefault"))
  );
  const prevStateRef = useRef<BookerStoreValues | null>(null);
  const bookerStoreContext = useContext(BookerStoreContext);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getStateValues = useCallback((state: any): BookerStoreValues => {
    return Object.fromEntries(
      Object.entries(state).filter(([_, value]) => typeof value !== "function")
    ) as BookerStoreValues;
  }, []);
  const debouncedStateChange = useMemo(() => {
    return debounce(
      (currentStateValues: BookerStoreValues, callback: (values: BookerStoreValues) => void) => {
        const prevState = prevStateRef.current;
        const stateChanged = !prevState || JSON.stringify(prevState) !== JSON.stringify(currentStateValues);

        if (stateChanged) {
          callback(currentStateValues);
          prevStateRef.current = currentStateValues;
        }
      },
      50
    );
  }, []);

  useEffect(() => {
    if (!onBookerStateChange || !bookerStoreContext) return;

    const unsubscribe = bookerStoreContext.subscribe((state) => {
      const currentStateValues = getStateValues(state);
      debouncedStateChange(currentStateValues, onBookerStateChange);
    });

    // Initial call with current state
    const initialState = getStateValues(bookerStoreContext.getState());
    onBookerStateChange(initialState);
    prevStateRef.current = initialState;

    return () => {
      unsubscribe();
      debouncedStateChange.cancel();
    };
  }, [onBookerStateChange, getStateValues, debouncedStateChange, bookerStoreContext]);

  useGetBookingForReschedule({
    uid: props.rescheduleUid ?? props.bookingUid ?? "",
    onSuccess: (data) => {
      setBookingData(data);
    },
  });
  const queryClient = useQueryClient();

  const username = useMemo(() => {
    // when rescheduling, prefer the booking host's username from bookingData
    // this ensures we fetch the correct event type even when an org admin reschedules
    if (bookingData?.user?.username) {
      return formatUsername(bookingData.user.username);
    }
    if (props.username) {
      return formatUsername(props.username);
    }
    return "";
  }, [props.username, bookingData?.user?.username]);

  useEffect(() => {
    setSelectedDuration(props.duration ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.duration]);

  useEffect(() => {
    setOrg(props.entity?.orgSlug ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.entity?.orgSlug]);

  const isDynamic = useMemo(() => {
    return getUsernameList(username ?? "").length > 1;
  }, [username]);

  const event = useAtomGetPublicEvent({
    username,
    eventSlug: props.eventSlug,
    isTeamEvent: props.isTeamEvent,
    teamId,
    selectedDuration,
  });

  const bookerLayout = useBookerLayout(event.data?.profile?.bookerLayouts);
  useInitializeBookerStore({
    ...props,
    teamMemberEmail,
    crmAppSlug,
    crmOwnerRecordType,
    crmRecordId: props.crmRecordId,
    eventId: event?.data?.id,
    rescheduleUid: props.rescheduleUid ?? null,
    bookingUid: props.bookingUid ?? null,
    layout: layout,
    org: props.entity?.orgSlug,
    username,
    bookingData,
    isPlatform: true,
    allowUpdatingUrlParams,
    defaultPhoneCountry,
  });
  useInitializeBookerStoreContext({
    ...props,
    teamMemberEmail,
    crmAppSlug,
    crmOwnerRecordType,
    crmRecordId: props.crmRecordId,
    eventId: event?.data?.id,
    rescheduleUid: props.rescheduleUid ?? null,
    bookingUid: props.bookingUid ?? null,
    layout: layout,
    org: props.entity?.orgSlug,
    username,
    bookingData,
    isPlatform: true,
    allowUpdatingUrlParams,
    defaultPhoneCountry,
  });
  const [dayCount] = useBookerStoreContext((state) => [state.dayCount, state.setDayCount], shallow);
  const selectedDate = useBookerStoreContext((state) => state.selectedDate);

  const month = useBookerStoreContext((state) => state.month);
  const eventSlug = useBookerStoreContext((state) => state.eventSlug);

  const { data: session } = useMe();
  const hasSession = !!session;
  const { name: defaultName, guests: defaultGuests, ...restFormValues } = props.defaultFormValues ?? {};

  const prefillFormParamName = useMemo(() => {
    if (defaultName) {
      return defaultName;
    }
    if (restFormValues.firstName) {
      return `${restFormValues.firstName} ${restFormValues.lastName}`;
    }
    return null;
  }, [defaultName, restFormValues]);

  const prefillFormParams = useMemo(() => {
    return {
      name: prefillFormParamName,
      guests: defaultGuests ?? [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultName, defaultGuests]);

  const extraOptions = useMemo(() => {
    return restFormValues;
  }, [restFormValues]);

  const { timezone: rawTimezone } = useTimePreferences();
  const timezone = useStableTimezone(
    rawTimezone,
    event?.data?.restrictionScheduleId != null
      ? { id: event.data.restrictionScheduleId, useBookerTimezone: event.data.useBookerTimezone }
      : undefined
  );

  const [calculatedStartTime, calculatedEndTime] = useTimesForSchedule({
    month,
    dayCount,
    selectedDate,
    bookerLayout,
  });

  const startTime =
    customStartTime && dayjs(customStartTime).isAfter(dayjs(calculatedStartTime))
      ? dayjs(customStartTime).toISOString()
      : calculatedStartTime;
  const endTime = calculatedEndTime;

  const [routingParams, setRoutingParams] = useState<{
    routedTeamMemberIds?: number[];
    skipContactOwner?: boolean;
    isBookingDryRun?: boolean;
  }>({});

  useEffect(() => {
    const searchParams = embedSearchParams
      ? new URLSearchParams(
          Object.entries(embedSearchParams).flatMap(([key, value]) => (value == null ? [] : [[key, value]]))
        )
      : new URLSearchParams(window.location.search);

    const routedTeamMemberIds = getRoutedTeamMemberIdsFromSearchParams(searchParams);
    const skipContactOwner = searchParams.get("cal.skipContactOwner") === "true";

    const isBookingDryRun =
      searchParams?.get("cal.isBookingDryRun")?.toLowerCase() === "true" ||
      searchParams?.get("cal.sandbox")?.toLowerCase() === "true";
    setRoutingParams({
      ...(skipContactOwner ? { skipContactOwner } : {}),
      ...(routedTeamMemberIds ? { routedTeamMemberIds } : {}),
      ...(isBookingDryRun ? { isBookingDryRun } : {}),
    });
  }, [embedSearchParams]);
  const schedule = useAvailableSlots({
    usernameList: getUsernameList(username),
    eventTypeId: event?.data?.id ?? 0,
    startTime,
    endTime,
    timeZone: timezone,
    duration: selectedDuration ?? undefined,
    rescheduleUid: props.rescheduleUid,
    teamMemberEmail: teamMemberEmail ?? undefined,
    ...(props.isTeamEvent
      ? {
          isTeamEvent: props.isTeamEvent,
          teamId: teamId,
          rrHostSubsetIds: rrHostSubsetIds,
        }
      : {}),
    enabled:
      Boolean(teamId || username) &&
      Boolean(month) &&
      Boolean(timezone) &&
      !event?.isPending &&
      event?.data?.id != null,
    orgSlug: props.entity?.orgSlug ?? undefined,
    eventTypeSlug: isDynamic ? "dynamic" : eventSlug || "",
    _silentCalendarFailures: silentlyHandleCalendarFailures,
    ...routingParams,
  });

  useEffect(() => {
    if (schedule.data && !schedule.isPending && !schedule.error && onTimeslotsLoaded) {
      onTimeslotsLoaded(schedule.data.slots);
    }
  }, [schedule.data, schedule.isPending, schedule.error, onTimeslotsLoaded]);

  const bookerForm = useBookingForm({
    event: event?.data,
    sessionEmail:
      session?.data?.email && clientId
        ? session.data.email.replace(`+${clientId}`, "")
        : session?.data?.email,
    sessionUsername: session?.data?.username,
    sessionName: session?.data?.username,
    hasSession,
    extraOptions: extraOptions ?? {},
    prefillFormParams: prefillFormParams,
    clientId,
  });
  const {
    mutate: createBooking,
    isPending: creatingBooking,
    error: createBookingError,
    isError: isCreateBookingError,
  } = useCreateBooking({
    onSuccess: (data) => {
      if (data?.data?.isDryRun) {
        props?.onDryRunSuccess?.();
      }

      // Decoy bookings from spam/watchlist detection may have responses: null.
      // Guard downstream code with optional chaining but do not short-circuit so
      // the success-redirect path still runs, keeping decoy flow indistinguishable.
      const isDecoyBooking =
        data?.data && "isShortCircuitedBooking" in data.data && data.data.isShortCircuitedBooking;

      if (!isDecoyBooking) {
        schedule.refetch();
      }

      props.onCreateBookingSuccess?.(data);

      if (!preventEventTypeRedirect && !!event?.data?.successRedirectUrl) {
        window.location.href = event?.data?.successRedirectUrl;
      }
    },
    onError: props.onCreateBookingError,
  });
  const {
    mutate: createRecBooking,
    isPending: creatingRecBooking,

    error: createRecBookingError,
    isError: isCreateRecBookingError,
  } = useCreateRecurringBooking({
    onSuccess: (data) => {
      if (data?.data?.[0]?.isDryRun) {
        props?.onDryRunSuccess?.();
      }

      const isDecoyRecurringBooking =
        data?.data?.[0] &&
        "isShortCircuitedBooking" in data.data[0] &&
        data.data[0].isShortCircuitedBooking;

      if (!isDecoyRecurringBooking) {
        schedule.refetch();
      }

      props.onCreateRecurringBookingSuccess?.(data);

      if (event?.data?.successRedirectUrl) {
        window.location.href = event?.data?.successRedirectUrl;
      }
    },
    onError: props.onCreateRecurringBookingError,
  });
  const slots = useSlots(event, {
    onReserveSlotSuccess: props.onReserveSlotSuccess,
    onReserveSlotError: props.onReserveSlotError,
    onDeleteSlotSuccess: props.onDeleteSlotSuccess,
    onDeleteSlotError: props.onDeleteSlotError,
    isBookingDryRun: props.isBookingDryRun ? props.isBookingDryRun : routingParams?.isBookingDryRun,
    handleSlotReservation,
  });

  const verifyEmail = useVerifyEmail({
    email: bookerForm.formEmail,
    name: bookerForm.formName,
    requiresBookerEmailVerification: event?.data?.requiresBookerEmailVerification,
    onVerifyEmail: bookerForm.beforeVerifyEmail,
    eventTypeId: event?.data?.id,
  });

  const verifyCode = useVerifyCode({
    onSuccess: () => {
      if (!bookerForm.formEmail) return;

      verifyEmail.setVerifiedEmail(bookerForm.formEmail);
      verifyEmail.setEmailVerificationModalVisible(false);
      handleBookEvent();
    },
  });

  const { data: connectedCalendars, isPending: fetchingConnectedCalendars } = useConnectedCalendars({
    enabled: hasSession,
  });
  const calendars = connectedCalendars as ConnectedDestinationCalendars;

  const { set, clearSet } = useLocalSet<{
    credentialId: number;
    externalId: string;
  }>("toggledConnectedCalendars", []);
  const [latestCalendarsToLoad, setLatestCalendarsToLoad] = useState(
    Array.from(set).map((item) => ({
      credentialId: item.credentialId,
      externalId: item.externalId,
    }))
  );
  const { data: overlayBusyDates } = useCalendarsBusyTimes({
    loggedInUsersTz: timezone,
    dateFrom: selectedDate,
    dateTo: selectedDate,
    calendarsToLoad: latestCalendarsToLoad,
    onError: () => {
      clearSet();
    },
    enabled: Boolean(hasSession && isOverlayCalendarEnabled && latestCalendarsToLoad?.length > 0),
  });

  const handleBookEvent = useHandleBookEvent({
    event,
    bookingForm: bookerForm.bookingForm,
    hashedLink: props.hashedLink,
    metadata: props.metadata ?? {},
    handleBooking: props?.handleCreateBooking ?? createBooking,
    handleRecBooking: props?.handleCreateRecurringBooking ?? createRecBooking,
    locationUrl: props.locationUrl,
    isBookingDryRun: isBookingDryRun ?? routingParams?.isBookingDryRun,
    ...(props.isTeamEvent
      ? {
          rrHostSubsetIds: rrHostSubsetIds,
        }
      : {}),
  });

  const onOverlaySwitchStateChange = useCallback(
    (state: boolean) => {
      setIsOverlayCalendarEnabled(state);
      if (state) {
        localStorage?.setItem("overlayCalendarSwitchDefault", "true");
      } else {
        localStorage?.removeItem("overlayCalendarSwitchDefault");
      }
    },
    [setIsOverlayCalendarEnabled]
  );
  const selectedDateProp = useMemo(
    () => dayjs(props.selectedDate).format("YYYY-MM-DD"),
    [props.selectedDate]
  );
  useEffect(() => {
    setSelectedDate({ date: selectedDateProp, omitUpdatingParams: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateProp]);

  useEffect(() => {
    // reset booker whenever it's unmounted
    return () => {
      slots.handleRemoveSlot();
      setBookerState("loading");
      setSelectedDate({ date: null });
      setSelectedTimeslot(null);
      setSelectedDuration(null);
      setOrg(null);
      setSelectedMonth(null);
      if (props.rescheduleUid) {
        // clean booking data from cache
        queryClient.removeQueries({
          queryKey: [BOOKING_RESCHEDULE_KEY, props.rescheduleUid],
          exact: true,
        });
        setBookingData(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isOverlayCalendarEnabled && view === "MONTH_VIEW") {
      localStorage?.removeItem("overlayCalendarSwitchDefault");
    }
    setIsOverlayCalendarEnabled(Boolean(localStorage?.getItem?.("overlayCalendarSwitchDefault")));
  }, [view, isOverlayCalendarEnabled]);

  return (
    <AtomsWrapper customClassName={props?.customClassNames?.atomsWrapper}>
      <BookerComponent
        timeZones={props.timeZones}
        teamMemberEmail={teamMemberEmail}
        crmAppSlug={crmAppSlug}
        crmOwnerRecordType={crmOwnerRecordType}
        customClassNames={props.customClassNames}
        eventSlug={props.eventSlug}
        username={username}
        showNoAvailabilityDialog={showNoAvailabilityDialog}
        entity={
          event?.data?.entity ?? {
            considerUnpublished: false,
            orgSlug: undefined,
            teamSlug: undefined,
            name: undefined,
          }
        }
        rescheduleUid={props.rescheduleUid ?? null}
        rescheduledBy={props.rescheduledBy ?? null}
        bookingUid={props.bookingUid ?? null}
        isRedirect={false}
        confirmButtonDisabled={confirmButtonDisabled}
        fromUserNameRedirected=""
        hasSession={hasSession}
        onOverlayClickNoCalendar={(): void => {
          throw new Error("Function not implemented.");
        }}
        onClickOverlayContinue={(): void => {
          throw new Error("Function not implemented.");
        }}
        onOverlaySwitchStateChange={onOverlaySwitchStateChange}
        extraOptions={extraOptions ?? {}}
        bookings={{
          handleBookEvent: (timeSlot?: string) => {
            handleBookEvent(timeSlot);
            return;
          },
          bookingForm: bookerForm.bookingForm,
          bookerFormErrorRef: bookerForm.bookerFormErrorRef,
          errors: {
            hasDataErrors: isCreateBookingError || isCreateRecBookingError,
            dataErrors: createBookingError || createRecBookingError,
          },
          loadingStates: {
            creatingBooking: creatingBooking,
            creatingRecurringBooking: creatingRecBooking,
          },
        }}
        slots={slots}
        calendars={{
          overlayBusyDates: overlayBusyDates?.data,
          isOverlayCalendarEnabled: isOverlayCalendarEnabled,
          connectedCalendars: calendars?.connectedCalendars || [],
          loadingConnectedCalendar: fetchingConnectedCalendars,
          onToggleCalendar: (data) => {
            const calendarsToLoad = Array.from(data ?? []);
            setLatestCalendarsToLoad(calendarsToLoad);
            return;
          },
        }}
        verifyEmail={verifyEmail}
        bookerForm={bookerForm}
        event={event}
        schedule={schedule}
        orgBannerUrl={bannerUrl ?? event.data?.bannerUrl}
        bookerLayout={{
          ...bookerLayout,
          hideEventTypeDetails: hideEventMetadata,
        }}
        verifyCode={verifyCode}
        isPlatform
        hasValidLicense={true}
        isBookingDryRun={isBookingDryRun ?? routingParams?.isBookingDryRun}
        eventMetaChildren={props.eventMetaChildren}
        roundRobinHideOrgAndTeam={props.roundRobinHideOrgAndTeam}
        hideOrgTeamAvatar={hideOrgTeamAvatar}
      />
    </AtomsWrapper>
  );
};

export const BookerPlatformWrapper = (
  props: BookerPlatformWrapperAtomPropsForIndividual | BookerPlatformWrapperAtomPropsForTeam
) => {
  return (
    <BookerStoreProvider>
      <BookerPlatformWrapperComponent {...props} />
    </BookerStoreProvider>
  );
};

export function formatUsername(username: string | string[]): string {
  if (typeof username === "string") {
    return username;
  }
  return username.join("+");
}
