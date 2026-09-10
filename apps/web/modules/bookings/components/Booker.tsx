import process from "node:process";
import BookingPageTagManager from "@calcom/app-store/BookingPageTagManager";
import { useIsPlatformBookerEmbed } from "@calcom/atoms/hooks/useIsPlatformBookerEmbed";
import dayjs from "@calcom/dayjs";
import { useEmbedUiConfig } from "@calcom/embed-core/embed-iframe";
import { updateEmbedBookerState } from "@calcom/embed-core/src/embed-iframe";
import { useBookerStoreContext } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import {
  fadeInLeft,
  getBookerSizeClassNames,
  useBookerResizeAnimation,
} from "@calcom/features/bookings/Booker/config";
import framerFeatures from "@calcom/features/bookings/Booker/framer-features";
import type { BookerProps } from "@calcom/features/bookings/Booker/types";
import { isBookingDryRun } from "@calcom/features/bookings/Booker/utils/isBookingDryRun";
import { isTimeSlotAvailable } from "@calcom/features/bookings/Booker/utils/isTimeslotAvailable";
import { getQueryParam } from "@calcom/features/bookings/Booker/utils/query-param";
import { Header } from "@calcom/features/bookings/components/Header";
import { BookerSection } from "@calcom/features/bookings/components/Section";
import { Dialog } from "@calcom/features/components/controlled-dialog";
import { scrollIntoViewSmooth } from "@calcom/lib/browser/browser.utils";
import {
  CLOUDFLARE_SITE_ID,
  CLOUDFLARE_USE_TURNSTILE_IN_BOOKER,
  PUBLIC_INVALIDATE_AVAILABLE_SLOTS_ON_BOOKING_FORM,
} from "@calcom/lib/constants";
import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { BookerLayouts } from "@calcom/prisma/zod-utils";
import classNames from "@calcom/ui/classNames";
import { DialogContent } from "@calcom/ui/components/dialog";
import { UnpublishedEntity } from "@calcom/ui/components/unpublished-entity";
import TurnstileCaptcha from "@calcom/web/modules/auth/components/Turnstile";
import { useSkipConfirmStep } from "@calcom/web/modules/bookings/hooks/useSkipConfirmStep";
import { useNonEmptyScheduleDays } from "@calcom/web/modules/schedules/hooks/useNonEmptyScheduleDays";
import { AnimatePresence, LazyMotion, m } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";
import StickyBox from "react-sticky-box";
import { Toaster } from "sonner";
import { shallow } from "zustand/shallow";
import { useIsQuickAvailabilityCheckFeatureEnabled } from "../hooks/useIsQuickAvailabilityCheckFeatureEnabled";
import type { WrappedBookerProps } from "../types";
import { AvailableTimeSlots } from "./AvailableTimeSlots";
import { BookEventForm } from "./BookEventForm";
import { BookFormAsModal } from "./BookEventForm/BookFormAsModal";
import { DatePicker } from "./DatePicker";
import { DryRunMessage } from "./DryRunMessage";
import { EventMeta } from "./EventMeta";
import { HavingTroubleFindingTime } from "./HavingTroubleFindingTime";
import { LargeCalendar } from "./LargeCalendar";
import { OverlayCalendar } from "./OverlayCalendar/OverlayCalendar";
import { SlotSelectionModalHeader } from "./SlotSelectionModalHeader";
import { NotFound } from "./Unavailable";
import { VerifyCodeDialog } from "./VerifyCodeDialog";

const BookerComponent = ({
  username,
  eventSlug,
  hideBranding = false,
  entity,
  onOverlayClickNoCalendar,
  onClickOverlayContinue,
  onOverlaySwitchStateChange,
  sessionUsername,
  rescheduleUid,
  hasSession,
  extraOptions,
  bookings,
  verifyEmail,
  slots,
  calendars,
  bookerForm,
  event,
  bookerLayout,
  schedule,
  verifyCode,
  isPlatform,
  orgBannerUrl,
  customClassNames,
  userLocale,
  hasValidLicense,
  isBookingDryRun: isBookingDryRunProp,
  renderCaptcha,
  hashedLink,
  confirmButtonDisabled,
  timeZones,
  eventMetaChildren,
  roundRobinHideOrgAndTeam,
  hideOrgTeamAvatar,
  showNoAvailabilityDialog,
}: BookerProps & WrappedBookerProps): JSX.Element | null => {
  const searchParams = useCompatSearchParams();
  const isPlatformBookerEmbed = useIsPlatformBookerEmbed();
  const [bookerState, setBookerState] = useBookerStoreContext(
    (state) => [state.state, state.setState],
    shallow
  );

  const selectedDate = useBookerStoreContext((state) => state.selectedDate);

  const [isSlotSelectionModalVisible, setIsSlotSelectionModalVisible] = useBookerStoreContext(
    (state) => [state.isSlotSelectionModalVisible, state.setIsSlotSelectionModalVisible],
    shallow
  );

  const {
    shouldShowFormInDialog,
    hasDarkBackground,
    extraDays,
    columnViewExtraDays,
    isMobile,
    layout,
    hideEventTypeDetails,
    isEmbed,
    bookerLayouts,
    slotsViewOnSmallScreen,
  } = bookerLayout;

  const [seatedEventData, setSeatedEventData] = useBookerStoreContext(
    (state) => [state.seatedEventData, state.setSeatedEventData],
    shallow
  );
  const { selectedTimeslot, setSelectedTimeslot, allSelectedTimeslots } = slots;
  const [dayCount, setDayCount] = useBookerStoreContext(
    (state) => [state.dayCount, state.setDayCount],
    shallow
  );

  const nonEmptyScheduleDays = useNonEmptyScheduleDays(schedule?.data?.slots).filter(
    (slot) => dayjs(selectedDate).diff(slot, "day") <= 0
  );

  const totalWeekDays = 7;
  const addonDays =
    nonEmptyScheduleDays.length < extraDays
      ? (extraDays - nonEmptyScheduleDays.length + 1) * totalWeekDays
      : 0;
  // Taking one more available slot(extraDays + 1) to calculate the no of days in between, that next and prev button need to shift.
  const availableSlots = nonEmptyScheduleDays.slice(0, extraDays + 1);
  if (nonEmptyScheduleDays.length !== 0) {
    const slotIndex =
      availableSlots.length === extraDays + 1 ? availableSlots.length - 2 : availableSlots.length - 1;
    columnViewExtraDays.current =
      Math.abs(dayjs(selectedDate).diff(availableSlots[slotIndex], "day")) + addonDays;
  }

  const nextSlots =
    Math.abs(dayjs(selectedDate).diff(availableSlots[availableSlots.length - 1], "day")) + addonDays;

  const animationScope = useBookerResizeAnimation(layout, bookerState);

  const timeslotsRef = useRef<HTMLDivElement>(null);
  const isQuickAvailabilityCheckFeatureEnabled = useIsQuickAvailabilityCheckFeatureEnabled();

  const StickyOnDesktop = isMobile ? "div" : StickyBox;

  const { bookerFormErrorRef, key, formEmail, bookingForm, errors: formErrors } = bookerForm;

  const { handleBookEvent, errors, loadingStates } = bookings;

  const watchedCfToken = bookingForm.watch("cfToken");

  const {
    isEmailVerificationModalVisible,
    setEmailVerificationModalVisible,
    handleVerifyEmail,
    renderConfirmNotVerifyEmailButtonCond,
    isVerificationCodeSending,
  } = verifyEmail;

  const { overlayBusyDates, isOverlayCalendarEnabled, connectedCalendars, onToggleCalendar } = calendars;

  const scrolledToTimeslotsOnce = useRef(false);
  const embedUiConfig = useEmbedUiConfig();
  const isCompact = Boolean(
    embedUiConfig.compact ||
      embedUiConfig.unpadded ||
      embedUiConfig.padding === "none" ||
      embedUiConfig.padding === "compact" ||
      (embedUiConfig.layout as string) === "compact"
  );

  const shouldDisableScroll =
    embedUiConfig.disableAutoScroll ||
    embedUiConfig.disableAutofocus ||
    embedUiConfig.autofocus === false ||
    embedUiConfig.scroll === false ||
    embedUiConfig.disableScroll === true;

  const scrollToTimeSlots = () => {
    // Don't scroll if slots view on small screen is enabled
    if (slotsViewOnSmallScreen) {
      return;
    }

    if (
      isMobile &&
      !scrolledToTimeslotsOnce.current &&
      timeslotsRef.current &&
      !shouldDisableScroll
    ) {
      // eslint-disable-next-line @calcom/eslint/no-scroll-into-view-embed -- We are allowing it here because scrollToTimeSlots is called on explicit user action where it makes sense to scroll, remember that the goal is to not do auto-scroll on embed load because that ends up scrolling the embedding webpage too
      scrollIntoViewSmooth(timeslotsRef.current, isEmbed);
      scrolledToTimeslotsOnce.current = true;
    }
  };

  const skipConfirmStep = useSkipConfirmStep(
    bookingForm,
    bookerState,
    layout == BookerLayouts.WEEK_VIEW,
    event?.data?.bookingFields,
    event?.data?.locations
  );

  // Cloudflare Turnstile Captcha
  // Note: process.env may be undefined in embed contexts, so we safely check it
  const isE2E = typeof process !== "undefined" && process.env?.NEXT_PUBLIC_IS_E2E;
  const shouldRenderCaptcha = !!(
    !isE2E &&
    renderCaptcha &&
    CLOUDFLARE_SITE_ID &&
    CLOUDFLARE_USE_TURNSTILE_IN_BOOKER === "1" &&
    (bookerState === "booking" || (bookerState === "selecting_time" && skipConfirmStep))
  );

  const onAvailableTimeSlotSelect = (time: string) => {
    setSelectedTimeslot(time);

    if (!skipConfirmStep) {
      setIsSlotSelectionModalVisible(false);
    }
  };

  updateEmbedBookerState({ bookerState, slotsQuery: schedule });

  useEffect(() => {
    if (event.isPending) return setBookerState("loading");
    if (!selectedDate) return setBookerState("selecting_date");
    if (!selectedTimeslot) return setBookerState("selecting_time");
    const isSkipConfirmStepSupported = layout !== BookerLayouts.WEEK_VIEW;
    if (selectedTimeslot && skipConfirmStep && isSkipConfirmStepSupported)
      return setBookerState("selecting_time");
    return setBookerState("booking");
  }, [event.isPending, selectedDate, selectedTimeslot, setBookerState, skipConfirmStep, layout]);

  const unavailableTimeSlots = isQuickAvailabilityCheckFeatureEnabled
    ? allSelectedTimeslots.filter((slot) => {
        return !isTimeSlotAvailable({
          scheduleData: schedule?.data ?? null,
          slotToCheckInIso: slot,
          quickAvailabilityChecks: slots.quickAvailabilityChecks,
        });
      })
    : [];

  const slot = getQueryParam("slot");

  useEffect(() => {
    setSelectedTimeslot(slot || null);
  }, [slot, setSelectedTimeslot]);

  const onSubmit = (timeSlot?: string) =>
    renderConfirmNotVerifyEmailButtonCond ? handleBookEvent(timeSlot) : handleVerifyEmail();

  const EventBooker = useMemo(() => {
    if (bookerState !== "booking") {
      return null;
    }

    return (
      <BookEventForm
        key={key}
        timeslot={selectedTimeslot}
        shouldRenderCaptcha={shouldRenderCaptcha}
        onCancel={() => {
          setSelectedTimeslot(null);
          // Temporarily allow disabling it, till we are sure that it doesn't cause any significant load on the system
          if (PUBLIC_INVALIDATE_AVAILABLE_SLOTS_ON_BOOKING_FORM) {
            // Ensures that user has latest available slots when they want to re-choose from the slots
            schedule?.invalidate();
          }
          if (seatedEventData.bookingUid) {
            setSeatedEventData({
              ...seatedEventData,
              bookingUid: undefined,
              attendees: undefined,
            });
          }
        }}
        onSubmit={() => (renderConfirmNotVerifyEmailButtonCond ? handleBookEvent() : handleVerifyEmail())}
        errorRef={bookerFormErrorRef}
        errors={{ ...formErrors, ...errors }}
        isTimeslotUnavailable={unavailableTimeSlots.includes(selectedTimeslot || "")}
        loadingStates={loadingStates}
        renderConfirmNotVerifyEmailButtonCond={renderConfirmNotVerifyEmailButtonCond}
        bookingForm={bookingForm}
        eventQuery={event}
        extraOptions={extraOptions}
        isVerificationCodeSending={isVerificationCodeSending}
        confirmButtonDisabled={confirmButtonDisabled}
        classNames={{
          confirmButton: customClassNames?.confirmStep?.confirmButton,
          backButton: customClassNames?.confirmStep?.backButton,
        }}
        isPlatform={isPlatform}
      />
    );
  }, [
    bookerFormErrorRef,
    bookerState,
    bookingForm,
    errors,
    event,
    extraOptions,
    formErrors,
    handleBookEvent,
    handleVerifyEmail,
    key,
    loadingStates,
    renderConfirmNotVerifyEmailButtonCond,
    seatedEventData,
    setSeatedEventData,
    setSelectedTimeslot,
    isPlatform,
    shouldRenderCaptcha,
    isVerificationCodeSending,
    unavailableTimeSlots,
  ]);

  /**
   * Unpublished organization handling - Below
   * - Reschedule links in email are of the organization event for an unpublished org, so we need to allow rescheduling unpublished event
   * - Ideally, we should allow rescheduling only for the event that has an old link(non-org link) but that's a bit complex and we are fine showing all reschedule links on unpublished organization
   */
  const considerUnpublished = entity.considerUnpublished && !rescheduleUid;

  if (considerUnpublished) {
    return <UnpublishedEntity {...entity} />;
  }

  if (event.isSuccess && !event.data) {
    return <NotFound />;
  }

  if (bookerState === "loading") {
    return null;
  }

  return (
    <>
      {event.data && !isPlatform ? <BookingPageTagManager eventType={event.data} /> : <></>}
      {(isBookingDryRunProp || isBookingDryRun(searchParams)) && <DryRunMessage isEmbed={isEmbed} />}
      <div
        className={classNames(
          // In a popup embed, if someone clicks outside the main(having main class or main tag), it closes the embed
          "main",
          "text-default flex min-h-full w-full flex-col items-center",
          layout === BookerLayouts.MONTH_VIEW && !isEmbed && !isCompact && "my-20 ",
          layout === BookerLayouts.MONTH_VIEW ? "overflow-visible" : "overflow-clip",
          `${customClassNames?.bookerWrapper}`
        )}>
        <div
          ref={animationScope}
          data-testid="booker-container"
          className={classNames(
            ...getBookerSizeClassNames(layout, bookerState, hideEventTypeDetails),
            `bg-default dark:bg-cal-muted grid max-w-full items-start dark:scheme-dark sm:transition-[width] sm:duration-300 sm:motion-reduce:transition-none md:flex-row`,
            // We remove border only when the content covers entire viewport. Because in embed, it can almost never be the case that it covers entire viewport, we show the border there
            (layout === BookerLayouts.MONTH_VIEW || isEmbed) && !isCompact && "border-subtle rounded-md",
            !isEmbed && "sm:transition-[width] sm:duration-300",
            isEmbed && layout === BookerLayouts.MONTH_VIEW && !isCompact && "border-booker sm:border-booker-width",
            !isEmbed && layout === BookerLayouts.MONTH_VIEW && !isCompact && `border-subtle border`,
            isCompact && "border-0 rounded-none p-0",
            `${customClassNames?.bookerContainer}`
          )}>
          <AnimatePresence>
            <BookerSection
              area="header"
              className={classNames(
                layout === BookerLayouts.MONTH_VIEW && "fixed top-4 z-10 ltr:right-4 rtl:left-4",
                (layout === BookerLayouts.COLUMN_VIEW || layout === BookerLayouts.WEEK_VIEW) &&
                  "bg-default dark:bg-cal-muted sticky top-0 z-10"
              )}>
              {isPlatform && layout === BookerLayouts.MONTH_VIEW ? (
                <></>
              ) : (
                <Header
                  isMyLink={Boolean(username === sessionUsername)}
                  eventSlug={eventSlug}
                  enabledLayouts={bookerLayouts.enabledLayouts}
                  extraDays={layout === BookerLayouts.COLUMN_VIEW ? columnViewExtraDays.current : extraDays}
                  isMobile={isMobile}
                  nextSlots={nextSlots}
                  renderOverlay={() => {
                    if (isEmbed) return null;
                    return (
                      <OverlayCalendar
                        isOverlayCalendarEnabled={isOverlayCalendarEnabled}
                        connectedCalendars={connectedCalendars}
                        overlayBusyDates={overlayBusyDates}
                        onToggleCalendar={onToggleCalendar}
                        hasSession={hasSession}
                        handleClickContinue={onClickOverlayContinue}
                        handleSwitchStateChange={onOverlaySwitchStateChange}
                        handleClickNoCalendar={() => {
                          onOverlayClickNoCalendar();
                        }}
                      />
                    );
                  }}
                />
              )}
            </BookerSection>
            <StickyOnDesktop key="meta" className={classNames("relative z-10 flex [grid-area:meta]")}>
              <BookerSection
                area="meta"
                className="max-w-screen flex w-full flex-col md:w-(--booker-meta-width)">
                {!hideEventTypeDetails && orgBannerUrl && (
                  <img
                    loading="eager"
                    className="-mb-9 h-auto w-full object-contain object-top ltr:rounded-tl-md rtl:rounded-tr-md sm:h-16 sm:object-cover"
                    alt="org banner"
                    src={orgBannerUrl}
                  />
                )}
                {!hideEventTypeDetails && (
                  <EventMeta
                    selectedTimeslot={selectedTimeslot}
                    classNames={{
                      eventMetaContainer: customClassNames?.eventMetaCustomClassNames?.eventMetaContainer,
                      eventMetaTitle: customClassNames?.eventMetaCustomClassNames?.eventMetaTitle,
                      eventMetaTimezoneSelect:
                        customClassNames?.eventMetaCustomClassNames?.eventMetaTimezoneSelect,
                    }}
                    event={event.data}
                    isPending={event.isPending}
                    isPlatform={isPlatform}
                    isPrivateLink={!!hashedLink}
                    locale={userLocale}
                    timeZones={timeZones}
                    roundRobinHideOrgAndTeam={roundRobinHideOrgAndTeam}
                    hideOrgTeamAvatar={hideOrgTeamAvatar}
                    hideEventTypeDetails={hideEventTypeDetails}>
                    {eventMetaChildren}
                  </EventMeta>
                )}
                {layout !== BookerLayouts.MONTH_VIEW &&
                  !(layout === "mobile" && bookerState === "booking") && (
                    <div className={classNames("mt-auto", isCompact ? "px-2 py-1" : "px-5 py-3")}>
                      <DatePicker
                        classNames={customClassNames?.datePickerCustomClassNames}
                        event={event}
                        slots={schedule?.data?.slots}
                        isLoading={schedule.isPending}
                        scrollToTimeSlots={scrollToTimeSlots}
                        showNoAvailabilityDialog={showNoAvailabilityDialog}
                        onDateChange={() => {
                          if (slotsViewOnSmallScreen) {
                            setIsSlotSelectionModalVisible(true);
                          }
                        }}
                      />
                    </div>
                  )}
              </BookerSection>
            </StickyOnDesktop>

            <BookerSection
              key="book-event-form"
              area="main"
              className={classNames("sticky top-0 -ml-px h-full md:w-(--booker-main-width) md:border-l", isCompact ? "p-2" : "p-6")}
              {...fadeInLeft}
              visible={bookerState === "booking" && !shouldShowFormInDialog}>
              {EventBooker}
            </BookerSection>

            <BookerSection
              key="datepicker"
              area="main"
              visible={bookerState !== "booking" && layout === BookerLayouts.MONTH_VIEW}
              {...fadeInLeft}
              initial="visible"
              className={classNames(
                "md:border-subtle -ml-px h-full shrink lg:w-(--booker-main-width)",
                isCompact ? "px-2 py-1" : "px-5 py-3",
                hideEventTypeDetails ? "" : "md:border-l"
              )}>
              <DatePicker
                classNames={customClassNames?.datePickerCustomClassNames}
                event={event}
                slots={schedule?.data?.slots}
                isLoading={schedule.isPending}
                scrollToTimeSlots={scrollToTimeSlots}
                showNoAvailabilityDialog={showNoAvailabilityDialog}
              />
            </BookerSection>

            <BookerSection
              key="enable-calendar"
              area="main"
              visible={layout === BookerLayouts.WEEK_VIEW}
              className="border-subtle sticky top-0 -ml-px h-full md:border-l"
              {...fadeInLeft}>
              <LargeCalendar
                extraDays={extraDays}
                schedule={schedule.data}
                isLoading={schedule.isPending}
                event={event}
              />
            </BookerSection>

            <BookerSection
              key="timeslots"
              area={{ default: "main", month_view: "timeslots" }}
              visible={
                !(slotsViewOnSmallScreen && isMobile) &&
                ((layout !== BookerLayouts.WEEK_VIEW && bookerState === "selecting_time") ||
                  layout === BookerLayouts.COLUMN_VIEW)
              }
              className={classNames(
                "border-subtle rtl:border-default flex h-full w-full flex-col overflow-x-auto pb-0 rtl:border-r ltr:md:border-l",
                isCompact ? "px-2 py-1" : "px-5 py-3",
                layout === BookerLayouts.MONTH_VIEW &&
                  "h-full overflow-hidden md:w-(--booker-timeslots-width)",
                layout !== BookerLayouts.MONTH_VIEW && "sticky top-0"
              )}
              ref={timeslotsRef}
              {...fadeInLeft}>
              <AvailableTimeSlots
                onAvailableTimeSlotSelect={onAvailableTimeSlotSelect}
                customClassNames={customClassNames?.availableTimeSlotsCustomClassNames}
                extraDays={extraDays}
                limitHeight={layout === BookerLayouts.MONTH_VIEW}
                schedule={schedule}
                isLoading={schedule.isPending}
                seatsPerTimeSlot={event.data?.seatsPerTimeSlot}
                unavailableTimeSlots={unavailableTimeSlots}
                showAvailableSeatsCount={event.data?.seatsShowAvailabilityCount}
                event={event}
                loadingStates={loadingStates}
                renderConfirmNotVerifyEmailButtonCond={renderConfirmNotVerifyEmailButtonCond}
                isVerificationCodeSending={isVerificationCodeSending}
                onSubmit={onSubmit}
                skipConfirmStep={skipConfirmStep}
                shouldRenderCaptcha={shouldRenderCaptcha}
                watchedCfToken={watchedCfToken}
                confirmButtonDisabled={confirmButtonDisabled}
                confirmStepClassNames={customClassNames?.confirmStep}
              />
            </BookerSection>
          </AnimatePresence>
        </div>
        <HavingTroubleFindingTime
          visible={bookerState !== "booking" && layout === BookerLayouts.MONTH_VIEW && !isMobile}
          dayCount={dayCount}
          isScheduleLoading={schedule.isLoading}
          onButtonClick={() => {
            setDayCount(null);
          }}
        />

        {shouldRenderCaptcha && (
          <div className="mb-6 mt-auto pt-6">
            <TurnstileCaptcha
              appearance="interaction-only"
              onVerify={(token) => {
                bookingForm.setValue("cfToken", token);
              }}
            />
          </div>
        )}

        {!hideBranding && (!isPlatform || isPlatformBookerEmbed) && !shouldRenderCaptcha && (
          <m.span
            key="logo"
            className={classNames(
              "mb-6 mt-auto pt-6 [&_img]:h-[15px]",
              hasDarkBackground ? "dark" : "",
              layout === BookerLayouts.MONTH_VIEW ? "block" : "hidden"
            )}>
            {null}
          </m.span>
        )}
      </div>
      <>
        {verifyCode && formEmail ? (
          <VerifyCodeDialog
            isOpenDialog={isEmailVerificationModalVisible}
            setIsOpenDialog={setEmailVerificationModalVisible}
            email={formEmail}
            isUserSessionRequiredToVerify={false}
            verifyCodeWithSessionNotRequired={verifyCode.verifyCodeWithSessionNotRequired}
            verifyCodeWithSessionRequired={verifyCode.verifyCodeWithSessionRequired}
            error={verifyCode.error}
            resetErrors={verifyCode.resetErrors}
            isPending={verifyCode.isPending}
            setIsPending={verifyCode.setIsPending}
          />
        ) : (
          <></>
        )}
      </>
      <BookFormAsModal
        onCancel={() => setSelectedTimeslot(null)}
        visible={bookerState === "booking" && shouldShowFormInDialog}>
        {EventBooker}
      </BookFormAsModal>
      <Dialog open={isMobile && isSlotSelectionModalVisible}>
        <DialogContent
          type={undefined}
          enableOverflow
          className="fixed! inset-0! top-0! left-0! h-screen! max-h-screen! w-screen! max-w-none! translate-x-0! translate-y-0! rounded-none! m-0! px-8 pt-0 pb-8">
          <SlotSelectionModalHeader
            onClick={() => setIsSlotSelectionModalVisible(false)}
            event={event.data}
            isPlatform={isPlatform}
            timeZones={timeZones}
            selectedDate={selectedDate}
          />
          <AvailableTimeSlots
            onAvailableTimeSlotSelect={onAvailableTimeSlotSelect}
            customClassNames={customClassNames?.availableTimeSlotsCustomClassNames}
            extraDays={extraDays}
            limitHeight={layout === BookerLayouts.MONTH_VIEW}
            schedule={schedule}
            isLoading={schedule.isPending}
            seatsPerTimeSlot={event.data?.seatsPerTimeSlot}
            unavailableTimeSlots={unavailableTimeSlots}
            showAvailableSeatsCount={event.data?.seatsShowAvailabilityCount}
            event={event}
            loadingStates={loadingStates}
            renderConfirmNotVerifyEmailButtonCond={renderConfirmNotVerifyEmailButtonCond}
            isVerificationCodeSending={isVerificationCodeSending}
            onSubmit={onSubmit}
            skipConfirmStep={skipConfirmStep}
            shouldRenderCaptcha={shouldRenderCaptcha}
            watchedCfToken={watchedCfToken}
            confirmButtonDisabled={confirmButtonDisabled}
            confirmStepClassNames={customClassNames?.confirmStep}
            hideAvailableTimesHeader
          />
        </DialogContent>
      </Dialog>
      <Toaster position="bottom-right" />
    </>
  );
};

export const Booker = (props: BookerProps & WrappedBookerProps) => {
  return (
    <LazyMotion strict features={framerFeatures}>
      <BookerComponent {...props} />
    </LazyMotion>
  );
};
