import type { UseBookerLayoutType } from "@calcom/features/bookings/Booker/hooks/useBookerLayout";
import type { UseBookingFormReturnType } from "@calcom/features/bookings/Booker/hooks/useBookingForm";
import type { CustomClassNames, ToggledConnectedCalendars } from "@calcom/features/bookings/Booker/types";
import type { BookerEventQuery } from "@calcom/features/bookings/types";
import type { DataTableRow } from "@calcom/features/data-table/lib/separator";
import type { RouterOutputs } from "@calcom/trpc/react";
import type { EventBusyDate } from "@calcom/types/Calendar";
import type { useScheduleForEventReturnType } from "@calcom/web/modules/schedules/hooks/useEvent";
import type { UseBookingsReturnType } from "./hooks/useBookings";
import type { UseSlotsReturnType } from "./hooks/useSlots";
import type { UseVerifyCodeReturnType } from "./hooks/useVerifyCode";
import type { UseVerifyEmailReturnType } from "./hooks/useVerifyEmail";
import type { validStatuses } from "./lib/validStatuses";

export type BookingsGetOutput = RouterOutputs["viewer"]["bookings"]["get"];

export type BookingOutput = RouterOutputs["viewer"]["bookings"]["get"]["bookings"][0];

export type BookingAttendee = BookingOutput["attendees"][0];

export type RecurringInfo = {
  recurringEventId: string | null;
  count: number;
  firstDate: Date | null;
  bookings: { [key: string]: Date[] };
};

export type BookingRowData = {
  type: "data";
  booking: BookingOutput;
  isToday: boolean;
  recurringInfo?: RecurringInfo;
};

export type RowData = DataTableRow<BookingRowData>;

export type BookingListingStatus = (typeof validStatuses)[number];

export type { UseBookerLayoutType } from "@calcom/features/bookings/Booker/hooks/useBookerLayout";
export type { UseBookingFormReturnType } from "@calcom/features/bookings/Booker/hooks/useBookingForm";
export type { UseBookingsReturnType } from "./hooks/useBookings";
export type { UseSlotsReturnType } from "./hooks/useSlots";
export type { UseVerifyCodeReturnType } from "./hooks/useVerifyCode";
export type { UseVerifyEmailReturnType } from "./hooks/useVerifyEmail";

export type OverlaySocialLoginProvider = "google" | "azure-ad";

export type WrappedBookerPropsMain = {
  sessionUsername?: string | null;
  rescheduleUid: string | null;
  rescheduledBy: string | null;
  bookingUid: string | null;
  isRedirect: boolean;
  fromUserNameRedirected: string;
  hasSession: boolean;
  onOverlayClickNoCalendar: () => void;
  onClickOverlayContinue: (socialLoginProvider?: OverlaySocialLoginProvider) => void;
  overlaySocialLoginProviders?: OverlaySocialLoginProvider[];
  onOverlaySwitchStateChange: (state: boolean) => void;
  extraOptions: Record<string, string | string[]>;
  bookings: UseBookingsReturnType;
  slots: UseSlotsReturnType;
  calendars: {
    overlayBusyDates?: EventBusyDate[];
    isOverlayCalendarEnabled: boolean;
    connectedCalendars: {
      calendars?: {
        name?: string;
        integrationTitle?: string;
        externalId: string;
        primary: boolean | null;
        isSelected?: boolean;
      }[];
      credentialId: number;
      delegationCredentialId?: string | null;
      cacheUpdatedAt: null;
      error?: {
        message: string | null;
      };
      primary?: {
        email?: string;
      };
      integration: {
        slug: string;
        name?: string | undefined;
        title?: string;
        logo: string;
      };
    }[];
    loadingConnectedCalendar: boolean;
    onToggleCalendar: (calendarsToLoad: Set<ToggledConnectedCalendars>) => void;
  };
  bookerForm: UseBookingFormReturnType;
  event: BookerEventQuery;
  schedule: useScheduleForEventReturnType;
  bookerLayout: UseBookerLayoutType;
  verifyEmail: UseVerifyEmailReturnType;
  customClassNames?: CustomClassNames;
  isBookingDryRun?: boolean;
  renderCaptcha?: boolean;
  confirmButtonDisabled?: boolean;
};

export type WrappedBookerPropsForPlatform = WrappedBookerPropsMain & {
  isPlatform: true;
  verifyCode: undefined;
  customClassNames?: CustomClassNames;
  timeZones?: import("@calcom/features/bookings/Booker/types").Timezone[];
  roundRobinHideOrgAndTeam?: boolean;
  hideOrgTeamAvatar?: boolean;
};

export type WrappedBookerPropsForWeb = WrappedBookerPropsMain & {
  isPlatform: false;
  verifyCode: UseVerifyCodeReturnType;
  timeZones?: import("@calcom/features/bookings/Booker/types").Timezone[];
  roundRobinHideOrgAndTeam?: boolean;
  hideOrgTeamAvatar?: boolean;
};

export type WrappedBookerProps = WrappedBookerPropsForPlatform | WrappedBookerPropsForWeb;
