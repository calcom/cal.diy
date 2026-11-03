"use client";

import dayjs from "@calcom/dayjs";
import { BOOKER_NUMBER_OF_DAYS_TO_LOAD } from "@calcom/lib/constants";
import { BookerLayouts } from "@calcom/prisma/zod-utils";
import { useEffect } from "react";
import { createWithEqualityFn } from "zustand/traditional";
import type { GetBookingType } from "../lib/get-booking";
import type { BookerLayout, BookerState } from "./types";
import { getQueryParam, removeQueryParam, updateQueryParam } from "./utils/query-param";
import { getValidDate, getValidMonth } from "./utils/validate-date";

const _iso_3166_1_alpha_2_codes = [
  "ad",
  "ae",
  "af",
  "ag",
  "ai",
  "al",
  "am",
  "ao",
  "aq",
  "ar",
  "as",
  "at",
  "au",
  "aw",
  "ax",
  "az",
  "ba",
  "bb",
  "bd",
  "be",
  "bf",
  "bg",
  "bh",
  "bi",
  "bj",
  "bl",
  "bm",
  "bn",
  "bo",
  "bq",
  "br",
  "bs",
  "bt",
  "bv",
  "bw",
  "by",
  "bz",
  "ca",
  "cc",
  "cd",
  "cf",
  "cg",
  "ch",
  "ci",
  "ck",
  "cl",
  "cm",
  "cn",
  "co",
  "cr",
  "cu",
  "cv",
  "cw",
  "cx",
  "cy",
  "cz",
  "de",
  "dj",
  "dk",
  "dm",
  "do",
  "dz",
  "ec",
  "ee",
  "eg",
  "eh",
  "er",
  "es",
  "et",
  "fi",
  "fj",
  "fk",
  "fm",
  "fo",
  "fr",
  "ga",
  "gb",
  "gd",
  "ge",
  "gf",
  "gg",
  "gh",
  "gi",
  "gl",
  "gm",
  "gn",
  "gp",
  "gq",
  "gr",
  "gs",
  "gt",
  "gu",
  "gw",
  "gy",
  "hk",
  "hm",
  "hn",
  "hr",
  "ht",
  "hu",
  "id",
  "ie",
  "il",
  "im",
  "in",
  "io",
  "iq",
  "ir",
  "is",
  "it",
  "je",
  "jm",
  "jo",
  "jp",
  "ke",
  "kg",
  "kh",
  "ki",
  "km",
  "kn",
  "kp",
  "kr",
  "kw",
  "ky",
  "kz",
  "la",
  "lb",
  "lc",
  "li",
  "lk",
  "lr",
  "ls",
  "lt",
  "lu",
  "lv",
  "ly",
  "ma",
  "mc",
  "md",
  "me",
  "mf",
  "mg",
  "mh",
  "mk",
  "ml",
  "mm",
  "mn",
  "mo",
  "mp",
  "mq",
  "mr",
  "ms",
  "mt",
  "mu",
  "mv",
  "mw",
  "mx",
  "my",
  "mz",
  "na",
  "nc",
  "ne",
  "nf",
  "ng",
  "ni",
  "nl",
  "no",
  "np",
  "nr",
  "nu",
  "nz",
  "om",
  "pa",
  "pe",
  "pf",
  "pg",
  "ph",
  "pk",
  "pl",
  "pm",
  "pn",
  "pr",
  "ps",
  "pt",
  "pw",
  "py",
  "qa",
  "re",
  "ro",
  "rs",
  "ru",
  "rw",
  "sa",
  "sb",
  "sc",
  "sd",
  "se",
  "sg",
  "sh",
  "si",
  "sj",
  "sk",
  "sl",
  "sm",
  "sn",
  "so",
  "sr",
  "ss",
  "st",
  "sv",
  "sx",
  "sy",
  "tc",
  "td",
  "tf",
  "tg",
  "th",
  "tj",
  "tk",
  "tl",
  "tm",
  "tn",
  "to",
  "tr",
  "tt",
  "tv",
  "tw",
  "tz",
  "ua",
  "ug",
  "um",
  "us",
  "uy",
  "uz",
  "va",
  "vc",
  "ve",
  "vg",
  "vi",
  "vn",
  "vu",
  "wf",
  "ws",
  "ye",
  "yt",
  "za",
  "zm",
  "zw",
] as const;

export type CountryCode = (typeof _iso_3166_1_alpha_2_codes)[number];

/**
 * Arguments passed into store initializer, containing
 * the event data.
 */
export type StoreInitializeType = {
  username: string;
  eventSlug: string;
  // Month can be undefined if it's not passed in as a prop.
  eventId: number | undefined;
  layout: BookerLayout;
  month?: string;
  bookingUid?: string | null;
  isTeamEvent?: boolean;
  bookingData?: GetBookingType | null | undefined;
  verifiedEmail?: string | null;
  rescheduleUid?: string | null;
  rescheduledBy?: string | null;
  seatReferenceUid?: string;
  durationConfig?: number[] | null;
  org?: string | null;
  timezone?: string | null;
  teamMemberEmail?: string | null;
  crmOwnerRecordType?: string | null;
  crmAppSlug?: string | null;
  crmRecordId?: string | null;
  isPlatform?: boolean;
  allowUpdatingUrlParams?: boolean;
  defaultPhoneCountry?: CountryCode;
};

type SeatedEventData = {
  seatsPerTimeSlot?: number | null;
  attendees?: number;
  bookingUid?: string;
  showAvailableSeatsCount?: boolean | null;
};

export type BookerStore = {
  /**
   * Event details. These are stored in store for easier
   * access in child components.
   */
  username: string | null;
  eventSlug: string | null;
  eventId: number | null;
  /**
   * Verified booker email.
   * Needed in case user turns on Requires Booker Email Verification for an event
   */
  verifiedEmail: string | null;
  setVerifiedEmail: (email: string | null) => void;
  /**
   * Verification code for email verification.
   * Stored after successful verification to be included in booking request
   */
  verificationCode: string | null;
  setVerificationCode: (code: string | null) => void;
  /**
   * Current month being viewed. Format is YYYY-MM.
   */
  month: string | null;
  setMonth: (month: string | null) => void;
  /**
   * Current state of the booking process
   * the user is currently in. See enum for possible values.
   */
  state: BookerState;
  setState: (state: BookerState) => void;
  /**
   * The booker component supports different layouts,
   * this value tracks the current layout.
   */
  layout: BookerLayout;
  setLayout: (layout: BookerLayout) => void;
  /**
   * Date selected by user (exact day). Format is YYYY-MM-DD.
   */
  selectedDate: string | null;
  setSelectedDate: (params: {
    date: string | null;
    omitUpdatingParams?: boolean;
    preventMonthSwitching?: boolean;
  }) => void;
  addToSelectedDate: (days: number) => void;
  /**
   * Multiple Selected Dates and Times
   */
  selectedDatesAndTimes: { [key: string]: { [key: string]: string[] } } | null;
  setSelectedDatesAndTimes: (selectedDatesAndTimes: { [key: string]: { [key: string]: string[] } }) => void;
  /**
   * Multiple duration configuration
   */
  durationConfig: number[] | null;
  /**
   * Selected event duration in minutes.
   */
  selectedDuration: number | null;
  setSelectedDuration: (duration: number | null) => void;
  /**
   * Selected timeslot user has chosen. This is a date string
   * containing both the date + time.
   */
  selectedTimeslot: string | null;
  setSelectedTimeslot: (timeslot: string | null) => void;
  tentativeSelectedTimeslots: string[];
  setTentativeSelectedTimeslots: (slots: string[]) => void;
  /**
   * Number of recurring events to create.
   */
  recurringEventCount: number | null;
  setRecurringEventCount(count: number | null): void;
  /**
   * Input occurrence count.
   */
  recurringEventCountQueryParam: number | null;
  setRecurringEventCountQueryParam(count: number | null): void;
  /**
   * The number of days worth of schedules to load.
   */
  dayCount: number | null;
  setDayCount: (dayCount: number | null) => void;
  /**
   * If booking is being rescheduled or it has seats, it receives a rescheduleUid with rescheduledBy or bookingUid
   * the current booking details are passed in. The `bookingData`
   * object is something that's fetched server side.
   */
  rescheduleUid: string | null;
  setRescheduleUid: (rescheduleUid: string | null) => void;
  rescheduledBy: string | null;
  bookingUid: string | null;
  bookingData: GetBookingType | null;
  setBookingData: (bookingData: GetBookingType | null | undefined) => void;

  /**
   * Method called by booker component to set initial data.
   */
  initialize: (data: StoreInitializeType) => void;
  /**
   * Stored form state, used when user navigates back and
   * forth between timeslots and form. Gets cleared on submit
   * to prevent sticky data.
   */
  formValues: Record<string, any>;
  setFormValues: (values: Record<string, any>) => void;
  /**
   * Force event being a team event, so we only query for team events instead
   * of also include 'user' events and return the first event that matches with
   * both the slug and the event slug.
   */
  isTeamEvent: boolean;
  seatedEventData: SeatedEventData;
  setSeatedEventData: (seatedEventData: SeatedEventData) => void;

  org?: string | null;
  setOrg: (org: string | null | undefined) => void;

  timezone: string | null;
  setTimezone: (timezone: string | null) => void;

  teamMemberEmail?: string | null;
  crmOwnerRecordType?: string | null;
  crmAppSlug?: string | null;
  crmRecordId?: string | null;
  isPlatform?: boolean;
  allowUpdatingUrlParams?: boolean;
  defaultPhoneCountry?: CountryCode | null;
  /**
   * Whether the two-step slot selection modal/dialog is visible
   */
  isSlotSelectionModalVisible: boolean;
  setIsSlotSelectionModalVisible: (visible: boolean) => void;
};

/**
 * Creates a new booker store instance
 */
export const createBookerStore = () =>
  createWithEqualityFn<BookerStore>((set, get) => ({
    state: "loading",
    setState: (state: BookerState) => set({ state }),
    layout: BookerLayouts.MONTH_VIEW,
    setLayout: (layout: BookerLayout) => {
      // If we switch to a large layout and don't have a date selected yet,
      // we selected it here, so week title is rendered properly.
      if (["week_view", "column_view"].includes(layout) && !get().selectedDate) {
        set({ selectedDate: dayjs().format("YYYY-MM-DD") });
      }
      if (!get().isPlatform || get().allowUpdatingUrlParams) {
        updateQueryParam("layout", layout);
      }
      return set({ layout });
    },
    selectedDate: getValidDate(getQueryParam("date")),
    setSelectedDate: ({ date: selectedDate, omitUpdatingParams = false, preventMonthSwitching = false }) => {
      // unset selected date
      if (!selectedDate) {
        removeQueryParam("date");
        return;
      }

      const currentSelection = dayjs(get().selectedDate);
      const newSelection = dayjs(selectedDate);
      set({ selectedDate });
      if (!omitUpdatingParams && (!get().isPlatform || get().allowUpdatingUrlParams)) {
        updateQueryParam("date", selectedDate ?? "");
      }

      // Setting month make sure small calendar in fullscreen layouts also updates.
      // preventMonthSwitching is true in monthly view
      if (!preventMonthSwitching && newSelection.month() !== currentSelection.month()) {
        set({ month: newSelection.format("YYYY-MM") });
        if (!omitUpdatingParams && (!get().isPlatform || get().allowUpdatingUrlParams)) {
          updateQueryParam("month", newSelection.format("YYYY-MM"));
        }
      }
    },
    selectedDatesAndTimes: null,
    setSelectedDatesAndTimes: (selectedDatesAndTimes) => {
      set({ selectedDatesAndTimes });
    },
    addToSelectedDate: (days: number) => {
      const currentSelection = dayjs(get().selectedDate);
      let newSelection = currentSelection.add(days, "day");

      // If newSelection is before the current date, set it to today
      if (newSelection.isBefore(dayjs(), "day")) {
        newSelection = dayjs();
      }

      const newSelectionFormatted = newSelection.format("YYYY-MM-DD");

      if (newSelection.month() !== currentSelection.month()) {
        set({ month: newSelection.format("YYYY-MM") });
        if (!get().isPlatform || get().allowUpdatingUrlParams) {
          updateQueryParam("month", newSelection.format("YYYY-MM"));
        }
      }

      set({ selectedDate: newSelectionFormatted });
      if (!get().isPlatform || get().allowUpdatingUrlParams) {
        updateQueryParam("date", newSelectionFormatted);
      }
    },
    username: null,
    eventSlug: null,
    eventId: null,
    rescheduledBy: null,
    verifiedEmail: null,
    setVerifiedEmail: (email: string | null) => {
      set({ verifiedEmail: email });
    },
    verificationCode: null,
    setVerificationCode: (code: string | null) => {
      set({ verificationCode: code });
    },
    month:
      getValidMonth(getQueryParam("month")) ||
      (getValidDate(getQueryParam("date")) ? dayjs(getQueryParam("date")).format("YYYY-MM") : null) ||
      dayjs().format("YYYY-MM"),
    setMonth: (month: string | null) => {
      if (!month) {
        removeQueryParam("month");
        return;
      }
      set({ month, selectedTimeslot: null });
      if (!get().isPlatform || get().allowUpdatingUrlParams) {
        updateQueryParam("month", month ?? "");
      }
      get().setSelectedDate({ date: null });
    },
    dayCount: BOOKER_NUMBER_OF_DAYS_TO_LOAD > 0 ? BOOKER_NUMBER_OF_DAYS_TO_LOAD : null,
    setDayCount: (dayCount: number | null) => {
      set({ dayCount });
    },
    isTeamEvent: false,
    seatedEventData: {
      seatsPerTimeSlot: undefined,
      attendees: undefined,
      bookingUid: undefined,
      showAvailableSeatsCount: true,
    },
    setSeatedEventData: (seatedEventData: SeatedEventData) => {
      set({ seatedEventData });
      if (!get().isPlatform || get().allowUpdatingUrlParams) {
        updateQueryParam("bookingUid", seatedEventData.bookingUid ?? "null");
      }
    },
    // This is different from timeZone in timePreferencesStore, because timeZone in timePreferencesStore is the preferred timezone of the booker,
    // it is the timezone configured through query param. So, this is in a way the preference of the person who shared the link.
    // it is the timezone configured through query param. So, this is in a way the preference of the person who shared the link.
    timezone: getQueryParam("cal.tz") ?? null,
    setTimezone: (timezone: string | null) => {
      set({ timezone });
    },
    initialize: ({
      username,
      eventSlug,
      month,
      eventId,
      rescheduleUid = null,
      rescheduledBy = null,
      bookingUid = null,
      bookingData = null,
      layout,
      isTeamEvent,
      durationConfig,
      org,
      timezone = null,
      teamMemberEmail,
      crmOwnerRecordType,
      crmAppSlug,
      crmRecordId,
      isPlatform = false,
      allowUpdatingUrlParams = true,
      defaultPhoneCountry,
    }: StoreInitializeType) => {
      const selectedDateInStore = get().selectedDate;

      if (
        get().username === username &&
        get().eventSlug === eventSlug &&
        get().month === month &&
        get().eventId === eventId &&
        get().rescheduleUid === rescheduleUid &&
        get().bookingUid === bookingUid &&
        get().bookingData?.responses.email === bookingData?.responses.email &&
        get().layout === layout &&
        get().timezone === timezone &&
        get().rescheduledBy === rescheduledBy &&
        get().teamMemberEmail === teamMemberEmail &&
        get().crmOwnerRecordType === crmOwnerRecordType &&
        get().crmAppSlug === crmAppSlug &&
        get().crmRecordId === crmRecordId
      )
        return;
      set({
        username,
        eventSlug,
        eventId,
        org,
        rescheduleUid,
        rescheduledBy,
        bookingUid,
        bookingData,
        layout: layout || BookerLayouts.MONTH_VIEW,
        isTeamEvent: isTeamEvent || false,
        durationConfig,
        timezone,
        // Preselect today's date in week / column view, since they use this to show the week title.
        selectedDate:
          selectedDateInStore ||
          (["week_view", "column_view"].includes(layout) ? dayjs().format("YYYY-MM-DD") : null),
        teamMemberEmail,
        crmOwnerRecordType,
        crmAppSlug,
        crmRecordId,
        isPlatform,
        allowUpdatingUrlParams,
        defaultPhoneCountry,
      });

      if (durationConfig?.includes(Number(getQueryParam("duration")))) {
        set({
          selectedDuration: Number(getQueryParam("duration")),
        });
      } else {
        removeQueryParam("duration");
      }

      // Unset selected timeslot if user is rescheduling. This could happen
      // if the user reschedules a booking right after the confirmation page.
      // In that case the time would still be store in the store, this way we
      // force clear this.
      if (rescheduleUid && bookingData) {
        set({ selectedTimeslot: null });
      }
      if (month) set({ month });

      //removeQueryParam("layout");
    },
    durationConfig: null,
    selectedDuration: null,
    setSelectedDuration: (selectedDuration: number | null) => {
      set({ selectedDuration });
      if (!get().isPlatform || get().allowUpdatingUrlParams) {
        updateQueryParam("duration", selectedDuration ?? "");
      }
    },
    setBookingData: (bookingData: GetBookingType | null | undefined) => {
      set({ bookingData: bookingData ?? null });
    },
    setRescheduleUid: (rescheduleUid: string | null) => {
      set({ rescheduleUid });
    },
    recurringEventCount: null,
    setRecurringEventCount: (recurringEventCount: number | null) => set({ recurringEventCount }),
    recurringEventCountQueryParam: Number(getQueryParam("recurringEventCount")) || null,
    setRecurringEventCountQueryParam: (recurringEventCountQueryParam: number | null) => {
      // Guard: only update state if value is valid (not NaN or null)
      if (recurringEventCountQueryParam !== null && !isNaN(recurringEventCountQueryParam)) {
        set({ recurringEventCountQueryParam });
        if (!get().isPlatform || get().allowUpdatingUrlParams) {
          updateQueryParam("recurringEventCount", recurringEventCountQueryParam);
        }
      }
      // If invalid, don't update state or URL - just ignore the call
    },
    rescheduleUid: null,
    bookingData: null,
    bookingUid: null,
    selectedTimeslot: getQueryParam("slot") || null,
    tentativeSelectedTimeslots: [],
    setTentativeSelectedTimeslots: (tentativeSelectedTimeslots: string[]) => {
      set({ tentativeSelectedTimeslots });
    },
    setSelectedTimeslot: (selectedTimeslot: string | null) => {
      set({ selectedTimeslot });
      if (!get().isPlatform || get().allowUpdatingUrlParams) {
        updateQueryParam("slot", selectedTimeslot ?? "", false);
      }
    },
    formValues: {},
    setFormValues: (formValues: Record<string, any>) => {
      set({ formValues });
    },
    org: null,
    setOrg: (org: string | null | undefined) => {
      set({ org });
    },
    isPlatform: false,
    allowUpdatingUrlParams: true,
    defaultPhoneCountry: null,
    isSlotSelectionModalVisible: false,
    setIsSlotSelectionModalVisible: (isSlotSelectionModalVisible: boolean) => {
      set({ isSlotSelectionModalVisible });
    },
  }));

/**
 * Default global store instance for backward compatibility
 */
export const useBookerStore = createBookerStore();

export const useInitializeBookerStore = ({
  username,
  eventSlug,
  month,
  eventId,
  rescheduleUid = null,
  rescheduledBy = null,
  bookingData = null,
  verifiedEmail = null,
  layout,
  isTeamEvent,
  durationConfig,
  org,
  timezone = null,
  teamMemberEmail,
  crmOwnerRecordType,
  crmAppSlug,
  crmRecordId,
  isPlatform = false,
  allowUpdatingUrlParams = true,
  defaultPhoneCountry,
}: StoreInitializeType) => {
  const initializeStore = useBookerStore((state) => state.initialize);
  useEffect(() => {
    initializeStore({
      username,
      eventSlug,
      month,
      eventId,
      rescheduleUid,
      rescheduledBy,
      bookingData,
      layout,
      isTeamEvent,
      org,
      verifiedEmail,
      durationConfig,
      timezone,
      teamMemberEmail,
      crmOwnerRecordType,
      crmAppSlug,
      crmRecordId,
      isPlatform,
      allowUpdatingUrlParams,
      defaultPhoneCountry,
    });
  }, [
    initializeStore,
    org,
    username,
    eventSlug,
    month,
    eventId,
    rescheduleUid,
    rescheduledBy,
    bookingData,
    layout,
    isTeamEvent,
    verifiedEmail,
    durationConfig,
    timezone,
    teamMemberEmail,
    crmOwnerRecordType,
    crmAppSlug,
    crmRecordId,
    isPlatform,
    allowUpdatingUrlParams,
    defaultPhoneCountry,
  ]);
};
