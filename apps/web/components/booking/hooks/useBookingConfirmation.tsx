import { useState } from "react";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { BookingStatus } from "@calcom/prisma/enums";
import { trpc } from "@calcom/trpc/react";
import { showToast } from "@calcom/ui/components/toast";

interface UseBookingConfirmationOptions {
  isRecurring?: boolean;
  isTabRecurring?: boolean;
  isTabUnconfirmed?: boolean;
}

interface BookingConfirmParams {
  bookingId: number;
  confirmed: boolean;
  recurringEventId?: string | null;
  reason?: string;
  forceConfirm?: boolean;
}

export function useBookingConfirmation(options: UseBookingConfirmationOptions = {}) {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [rejectionDialogIsOpen, setRejectionDialogIsOpen] = useState(false);
  const [forceConfirmDialogIsOpen, setForceConfirmDialogIsOpen] = useState(false);
  const [pendingConfirmParams, setPendingConfirmParams] = useState<BookingConfirmParams | null>(null);

  const { isRecurring = false, isTabRecurring = false, isTabUnconfirmed = false } = options;

  const mutation = trpc.viewer.bookings.confirm.useMutation({
    onSuccess: (data) => {
      if (data?.status === BookingStatus.REJECTED) {
        setRejectionDialogIsOpen(false);
        showToast(t("booking_rejection_success"), "success");
      } else {
        setForceConfirmDialogIsOpen(false);
        setPendingConfirmParams(null);
        showToast(t("booking_confirmation_success"), "success");
      }
      utils.viewer.bookings.invalidate();
      utils.viewer.me.bookingUnconfirmedCount.invalidate();
    },
    onError: (error) => {
      if (error.data?.httpStatus === 409 && !pendingConfirmParams?.forceConfirm) {
        setForceConfirmDialogIsOpen(true);
        return;
      }
      showToast(error.message || t("booking_confirmation_failed"), "error");
      utils.viewer.bookings.invalidate();
    },
  });

  const bookingConfirm = (params: BookingConfirmParams) => {
    const { bookingId, confirmed, recurringEventId, reason, forceConfirm } = params;

    const body: Record<string, unknown> = {
      bookingId,
      confirmed,
      reason: reason || "",
    };

    if (forceConfirm) {
      body.forceConfirm = true;
    }

    /**
     * Only pass down the recurring event id when we need to confirm the entire series, which happens in
     * the "Recurring" tab and "Unconfirmed" tab, to support confirming discretionally in the "Recurring" tab.
     */
    if ((isTabRecurring || isTabUnconfirmed) && isRecurring && recurringEventId) {
      body.recurringEventId = recurringEventId;
    }

    // Store params so we can replay with forceConfirm if a conflict dialog is shown
    setPendingConfirmParams(params);

    mutation.mutate(body as Parameters<typeof mutation.mutate>[0]);
  };

  const bookingForceConfirm = () => {
    if (!pendingConfirmParams) return;
    bookingConfirm({ ...pendingConfirmParams, forceConfirm: true });
  };

  const handleReject = () => {
    setRejectionDialogIsOpen(true);
  };

  return {
    bookingConfirm,
    bookingForceConfirm,
    handleReject,
    rejectionDialogIsOpen,
    setRejectionDialogIsOpen,
    forceConfirmDialogIsOpen,
    setForceConfirmDialogIsOpen,
    isPending: mutation.isPending,
  };
}
