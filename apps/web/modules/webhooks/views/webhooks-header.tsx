"use client";

import { APP_NAME } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import {
  AppHeader,
  AppHeaderActions,
  AppHeaderContent,
  AppHeaderDescription,
} from "@coss/ui/shared/app-header";

export function WebhooksHeader() {
  const { t } = useLocale();

  return (
    <AppHeader>
      <AppHeaderContent title={t("webhooks")}>
        <AppHeaderDescription>{t("add_webhook_description", { appName: APP_NAME })}</AppHeaderDescription>
      </AppHeaderContent>
    </AppHeader>
  );
}
