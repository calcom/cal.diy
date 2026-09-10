import { useCopy } from "@calcom/lib/hooks/useCopy";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import type { ReactElement } from "react";

export function BookingUid({ uid }: { uid: string }): ReactElement {
  const { copyToClipboard, isCopied } = useCopy();
  const { t } = useLocale();
  let copyLabel = t("copy_to_clipboard");
  let copyIcon: "clipboard" | "clipboard-check" = "clipboard";

  if (isCopied) {
    copyLabel = t("copied");
    copyIcon = "clipboard-check";
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <code className="truncate font-mono text-default text-sm" title={uid}>
        {uid}
      </code>
      <Button
        type="button"
        variant="icon"
        color="minimal"
        size="sm"
        StartIcon={copyIcon}
        tooltip={copyLabel}
        aria-label={copyLabel}
        onClick={(): void => copyToClipboard(uid)}
      />
    </div>
  );
}
