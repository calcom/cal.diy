import AppCard from "@calcom/app-store/_components/AppCard";
import { useAppContextWithSchema } from "@calcom/app-store/EventTypeAppContext";
import type { EventTypeAppCardComponent } from "@calcom/app-store/types";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { usePathname } from "next/navigation";
import { useState } from "react";
import checkForMultiplePaymentApps from "../../_utils/payments/checkForMultiplePaymentApps";
import useIsAppEnabled from "../../_utils/useIsAppEnabled";
import type { appDataSchema } from "../zod";
import EventTypeAppSettingsInterface from "./EventTypeAppSettingsInterface";

const EventTypeAppCard: EventTypeAppCardComponent = function EventTypeAppCard({
  app,
  eventType,
  eventTypeFormMetadata,
  onAppInstallSuccess,
}) {
  const { t } = useLocale();
  const pathname = usePathname();
  const { getAppData, setAppData, disabled } = useAppContextWithSchema<typeof appDataSchema>();
  const { enabled, updateEnabled } = useIsAppEnabled(app);
  const otherPaymentAppEnabled = checkForMultiplePaymentApps(eventTypeFormMetadata);
  const [requirePayment] = useState(getAppData("enabled"));
  const shouldDisableSwitch = !requirePayment && otherPaymentAppEnabled;

  return (
    <AppCard
      onAppInstallSuccess={onAppInstallSuccess}
      returnTo={`${WEBAPP_URL}${pathname}?tabName=apps`}
      app={app}
      switchChecked={enabled}
      switchOnClick={(e) => {
        updateEnabled(e);
      }}
      teamId={eventType.team?.id || undefined}
      disableSwitch={shouldDisableSwitch}
      switchTooltip={shouldDisableSwitch ? t("other_payment_app_enabled") : undefined}>
      <EventTypeAppSettingsInterface
        eventType={eventType}
        slug={app.slug}
        disabled={disabled}
        getAppData={getAppData}
        setAppData={setAppData}
      />
    </AppCard>
  );
};

export default EventTypeAppCard;
