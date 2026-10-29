import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

import { Dialog } from "@calcom/features/components/controlled-dialog";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { DialogContent, DialogFooter, DialogHeader, DialogClose } from "@calcom/ui/components/dialog";
import { showToast } from "@calcom/ui/components/toast";
import { CreditCardIcon, TriangleAlertIcon } from "@coss/ui/icons";

interface IRescheduleDialog {
  isOpenDialog: boolean;
  setIsOpenDialog: Dispatch<SetStateAction<boolean>>;
  bookingId: number;
  paymentAmount: number;
  paymentCurrency: string;
}

export const ChargeCardDialog = (props: IRescheduleDialog) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const { isOpenDialog, setIsOpenDialog, bookingId } = props;
  const [chargeError, setChargeError] = useState<string | null>(null);

  const chargeCardMutation = trpc.viewer.payments.chargeCard.useMutation({
    onSuccess: () => {
      utils.viewer.bookings.invalidate();
      setIsOpenDialog(false);
      setChargeError(null);
      showToast("Charge successful", "success");
    },
    onError: (error) => {
      setChargeError(error.message || t("error_charging_card"));
    },
  });

  const currencyStringParams = {
    amount: props.paymentAmount / 100.0,
    formatParams: { amount: { currency: props.paymentCurrency } },
  };

  return (
    <Dialog open={isOpenDialog} onOpenChange={setIsOpenDialog}>
      <DialogContent>
        <div className="flex flex-row space-x-3">
          <div className=" bg-subtle flex h-10 w-10 shrink-0 justify-center rounded-full">
            <CreditCardIcon className="m-auto h-6 w-6" />
          </div>
          <div className="pt-1">
            <DialogHeader title={t("charge_card")} />
            <p>{t("charge_card_dialog_body", currencyStringParams)}</p>

            {chargeError && (
              <div className="mt-4 flex text-red-500">
                <TriangleAlertIcon className="mr-2 h-5 w-5" />
                <p className="text-sm">{chargeError}</p>
              </div>
            )}

            <DialogFooter>
              <DialogClose />
              <Button
                data-testid="send_request"
                disabled={chargeCardMutation.isPending}
                onClick={() => {
                  setChargeError(null);
                  chargeCardMutation.mutate({
                    bookingId,
                  });
                }}>
                {t("charge_attendee", currencyStringParams)}
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
