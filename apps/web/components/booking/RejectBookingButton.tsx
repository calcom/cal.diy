import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";

import { RejectionReasonDialog } from "../dialog/RejectionReasonDialog";
import { useBookingConfirmation } from "./hooks/useBookingConfirmation";

interface RejectBookingButtonProps {
  bookingId: number;
  bookingUid: string;
  recurringEventId?: string | null;
  isRecurring?: boolean;
  isTabRecurring?: boolean;
  isTabUnconfirmed?: boolean;
  className?: string;
}

export function RejectBookingButton({
  bookingId,
  bookingUid,
  recurringEventId,
  isRecurring = false,
  isTabRecurring = false,
  isTabUnconfirmed = false,
  className,
}: RejectBookingButtonProps) {
  const { t } = useLocale();

  const { bookingConfirm, handleReject, isPending, rejectionDialogIsOpen, setRejectionDialogIsOpen } =
    useBookingConfirmation({
      isRecurring,
      isTabRecurring,
      isTabUnconfirmed,
    });

  const rejectLabel = (isTabRecurring || isTabUnconfirmed) && isRecurring ? t("reject_all") : t("reject");

  return (
    <>
      <RejectionReasonDialog
        isOpenDialog={rejectionDialogIsOpen}
        setIsOpenDialog={setRejectionDialogIsOpen}
        onConfirm={(reason) => bookingConfirm({ bookingId, confirmed: false, recurringEventId, reason })}
        isPending={isPending}
      />

      <Button
        className={className}
        onClick={handleReject}
        disabled={isPending}
        data-booking-uid={bookingUid}
        data-testid="reject">
        {rejectLabel}
      </Button>
    </>
  );
}
