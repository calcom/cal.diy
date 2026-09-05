import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";

import { useBookingConfirmation } from "./hooks/useBookingConfirmation";

interface AcceptBookingButtonProps {
  bookingId: number;
  bookingUid: string;
  recurringEventId?: string | null;
  isRecurring?: boolean;
  isTabRecurring?: boolean;
  isTabUnconfirmed?: boolean;
  className?: string;
}

export function AcceptBookingButton({
  bookingId,
  bookingUid,
  recurringEventId,
  isRecurring = false,
  isTabRecurring = false,
  isTabUnconfirmed = false,
  className,
}: AcceptBookingButtonProps) {
  const { t } = useLocale();

  const { bookingConfirm, isPending } = useBookingConfirmation({
    isRecurring,
    isTabRecurring,
    isTabUnconfirmed,
  });

  const confirmLabel = (isTabRecurring || isTabUnconfirmed) && isRecurring ? t("confirm_all") : t("confirm");

  return (
    <Button
      className={className}
      onClick={() => bookingConfirm({ bookingId, confirmed: true, recurringEventId })}
      disabled={isPending}
      data-booking-uid={bookingUid}
      data-testid="confirm">
      {confirmLabel}
    </Button>
  );
}
