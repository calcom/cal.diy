import type { Dispatch, SetStateAction } from "react";

import { Dialog } from "@calcom/features/components/controlled-dialog";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { CancellationReasonRequirement } from "@calcom/prisma/enums";
import { trpc } from "@calcom/trpc/react";
import type { RecurringEvent } from "@calcom/types/Calendar";
import { DialogContent, DialogHeader } from "@calcom/ui/components/dialog";
import { showToast } from "@calcom/ui/components/toast";

import CancelBooking from "@components/booking/CancelBooking";

interface ICancelBookingDialog {
  isOpenDialog: boolean;
  setIsOpenDialog: Dispatch<SetStateAction<boolean>>;
  booking: {
    uid: string;
    id: number;
    title: string;
    startTime: Date;
    payment?: {
      amount: number;
      currency: string;
      success: boolean;
      paymentOption?: string | null;
      appId?: string | null;
      refunded?: boolean;
    }[];
  };
  profile: {
    name: string | null;
    slug: string | null;
  };
  recurringEvent: RecurringEvent | null;
  team?: string | null;
  teamId?: number;
  allRemainingBookings?: boolean;
  seatReferenceUid?: string;
  currentUserEmail?: string;
  bookingCancelledEventProps: {
    booking: unknown;
    organizer: {
      name: string;
      email: string;
      timeZone?: string;
    };
    eventType: unknown;
  };
  isHost: boolean;
  internalNotePresets?: { id: number; name: string; cancellationReason: string | null }[];
  eventTypeMetadata?: Record<string, unknown> | null;
}

export const CancelBookingDialog = (props: ICancelBookingDialog) => {
  const { t } = useLocale();
  const {
    isOpenDialog,
    setIsOpenDialog,
    booking,
    profile,
    recurringEvent,
    team,
    teamId,
    allRemainingBookings = false,
    seatReferenceUid,
    currentUserEmail,
    bookingCancelledEventProps,
    isHost,
    internalNotePresets = [],
    eventTypeMetadata,
  } = props;

  const utils = trpc.useUtils();

  // Get the first payment if it exists and map to expected format
  const payment =
    booking.payment && booking.payment.length > 0
      ? {
          amount: booking.payment[0].amount,
          currency: booking.payment[0].currency,
          appId: booking.payment[0].appId || null,
        }
      : null;

  const handleCanceled = () => {
    utils.viewer.bookings.invalidate();
    showToast(t("booking_cancelled"), "success");
    setIsOpenDialog(false);
  };

  return (
    <Dialog open={isOpenDialog} onOpenChange={setIsOpenDialog}>
      <DialogContent enableOverflow data-testid="cancel-dialog">
        <DialogHeader title={allRemainingBookings ? t("cancel_all_remaining") : t("cancel_event")} />
        <CancelBooking
          renderContext="dialog"
          booking={{
            uid: booking.uid,
            id: booking.id,
            title: booking.title,
            startTime: booking.startTime,
            payment: payment,
          }}
          profile={profile}
          recurringEvent={recurringEvent}
          team={team}
          teamId={teamId}
          setIsCancellationMode={setIsOpenDialog}
          theme={null}
          allRemainingBookings={allRemainingBookings}
          seatReferenceUid={seatReferenceUid}
          currentUserEmail={currentUserEmail}
          bookingCancelledEventProps={bookingCancelledEventProps}
          isHost={isHost}
          internalNotePresets={internalNotePresets}
          eventTypeMetadata={eventTypeMetadata}
          showErrorAsToast={true}
          onCanceled={handleCanceled}
        />
      </DialogContent>
    </Dialog>
  );
};
