"use client";

import { APP_NAME } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@coss/ui/components/button";
import {
  AppHeader,
  AppHeaderActions,
  AppHeaderContent,
  AppHeaderDescription,
} from "@coss/ui/shared/app-header";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type WebhookFormHeaderProps = {
  CTA?: ReactNode;
  titleKey?: "add_webhook" | "edit_webhook" | "create_webhook";
};

export function WebhookFormHeader({
  CTA,
  titleKey = "add_webhook",
}: WebhookFormHeaderProps) {
  const { t } = useLocale();

  return (
    <AppHeader>
      <div className="flex min-w-0 items-start gap-3">
        <AppHeaderContent title={t(titleKey)}>
          <AppHeaderDescription>{t("add_webhook_description", { appName: APP_NAME })}</AppHeaderDescription>
        </AppHeaderContent>
      </div>
      {CTA && <AppHeaderActions>{CTA}</AppHeaderActions>}
    </AppHeader>
  );
}
