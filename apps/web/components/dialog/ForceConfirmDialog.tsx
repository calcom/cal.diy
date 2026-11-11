import type { Dispatch, SetStateAction } from "react";

import { Dialog } from "@calcom/features/components/controlled-dialog";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { DialogContent, DialogFooter, DialogClose } from "@calcom/ui/components/dialog";

interface ForceConfirmDialogProps {
  isOpenDialog: boolean;
  setIsOpenDialog: Dispatch<SetStateAction<boolean>>;
  onConfirm: () => void;
  isPending?: boolean;
}

export function ForceConfirmDialog({
  isOpenDialog,
  setIsOpenDialog,
  onConfirm,
  isPending = false,
}: ForceConfirmDialogProps) {
  const { t } = useLocale();

  return (
    <Dialog open={isOpenDialog} onOpenChange={setIsOpenDialog}>
      <DialogContent
        title={t("force_confirm_dialog_title")}
        description={t("force_confirm_dialog_description")}
        enableOverflow>
        <DialogFooter noSticky>
          <DialogClose color="secondary" />
          <Button
            color="primary"
            disabled={isPending}
            data-testid="force-confirm"
            onClick={onConfirm}>
            {t("force_confirm_anyway")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
