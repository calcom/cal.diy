import AppCard from "@calcom/app-store/_components/AppCard";
import useIsAppEnabled from "@calcom/app-store/_utils/useIsAppEnabled";
import { useAppContextWithSchema } from "@calcom/app-store/EventTypeAppContext";
import type { EventTypeAppCardComponent } from "@calcom/app-store/types";
import { useEffect } from "react";
import { loadSetupConfiguration } from "../lib/setupConfiguration";
import type { appDataSchema } from "../zod";
import EventTypeAppSettingsInterface from "./EventTypeAppSettingsInterface";

/** Render the TOAB Jitsi app card and prefetch configuration while it is installed. */
const EventTypeAppCard: EventTypeAppCardComponent = function EventTypeAppCard({
  app,
  eventType,
  onAppInstallSuccess,
}: Parameters<EventTypeAppCardComponent>[0]) {
  const { getAppData, setAppData, disabled } = useAppContextWithSchema<typeof appDataSchema>();
  const { enabled, updateEnabled } = useIsAppEnabled(app);

  useEffect(() => {
    if (!app.isInstalled) return;
    void loadSetupConfiguration(eventType.id).catch(() => undefined);
  }, [app.isInstalled, eventType.id]);

  return (
    <AppCard
      onAppInstallSuccess={onAppInstallSuccess}
      hideSettingsIcon
      app={app}
      switchOnClick={updateEnabled}
      switchChecked={enabled}
      teamId={eventType.team?.id || undefined}>
      <EventTypeAppSettingsInterface
        disabled={disabled}
        eventType={eventType}
        slug={app.slug}
        getAppData={getAppData}
        setAppData={setAppData}
      />
    </AppCard>
  );
};

export default EventTypeAppCard;
