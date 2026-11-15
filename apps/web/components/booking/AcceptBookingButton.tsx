import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";

import { ForceConfirmDialog } from "../dialog/ForceConfirmDialog";
import { useBookingConfirmation } from "./hooks/useBookingConfirmation";

interface AcceptBookingButtonProps {
  bookingId: number;
  bookingUid: string;
  recurringEventId?: string | null;
  isRecurring?: boolean;
  isTabRecurring?: boolean;
  isTabUnconfirmed?: boolean;
  size?: "sm" | "base" | "lg";
  color?: "primary" | "secondary" | "minimal" | "destructive";
  className?: string;
}

export function AcceptBookingButton({
  bookingId,
  bookingUid,
  recurringEventId,
  isRecurring = false,
  isTabRecurring = false,
  isTabUnconfirmed = false,
  size = "base",
  color = "primary",
  className,
}: AcceptBookingButtonProps) {
  const { t } = useLocale();

  const {
    bookingConfirm,
    bookingForceConfirm,
    forceConfirmDialogIsOpen,
    setForceConfirmDialogIsOpen,
    isPending,
  } = useBookingConfirmation({
    isRecurring,
    isTabRecurring,
    isTabUnconfirmed,
  });

  const confirmLabel = (isTabRecurring || isTabUnconfirmed) && isRecurring ? t("confirm_all") : t("confirm");

  return (
    <>
      <ForceConfirmDialog
        isOpenDialog={forceConfirmDialogIsOpen}
        setIsOpenDialog={setForceConfirmDialogIsOpen}
        onConfirm={bookingForceConfirm}
        isPending={isPending}
      />

      <Button
        color={color}
        size={size}
        className={className}
        onClick={() => bookingConfirm({ bookingId, confirmed: true, recurringEventId })}
        disabled={isPending}
        data-booking-uid={bookingUid}
        data-testid="confirm">
        {confirmLabel}
      </Button>
    </>
  );
}
