import type { EventTypeAppSettingsComponentProps } from "@calcom/app-store/types";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import {
  Dropdown,
  DropdownItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@calcom/ui/components/dropdown";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { loadLocationConfiguration, loadSetupConfiguration } from "../lib/setupConfiguration";

const SERVER_TYPE_TRANSLATION_KEYS = {
  CUSTOM: "toab_jitsi_custom_server",
  DEFAULT: "toab_jitsi_default_server",
} as const;

type Server = {
  id: number;
  name: string;
  serverUrl: string;
  serverType: "CUSTOM" | "DEFAULT";
};

export default function EventTypeAppSettingsInterface({
  disabled,
  eventType,
  getAppData,
  setAppData,
}: EventTypeAppSettingsComponentProps): ReactElement {
  const { t } = useLocale();
  const selectedServerId = getAppData("serverId");
  const getAppDataRef = useRef(getAppData);
  const setAppDataRef = useRef(setAppData);
  getAppDataRef.current = getAppData;
  setAppDataRef.current = setAppData;
  const [servers, setServers] = useState<Server[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [locationEnabled, setLocationEnabled] = useState<boolean>();

  useEffect(() => {
    let isCurrent = true;
    async function loadConfiguration(): Promise<void> {
      setIsLoading(true);
      setError(undefined);
      try {
        const [result, location] = await Promise.all([
          loadSetupConfiguration(eventType.id),
          loadLocationConfiguration(eventType.id),
        ]);
        if (!isCurrent) return;
        setServers(result.servers);
        setLocationEnabled(location.moderatorLocationEnabled);
        if (getAppDataRef.current("userId") !== result.userId) {
          setAppDataRef.current("userId", result.userId);
        }
        const selectedId = getAppDataRef.current("serverId");
        if (selectedId && !result.servers.some((server) => server.id === selectedId)) {
          setAppDataRef.current("serverId", undefined);
          setAppDataRef.current("serverUrl", undefined);
        }
      } catch (loadError) {
        if (isCurrent) {
          let message = t("toab_jitsi_config_load_error");
          if (loadError instanceof ErrorWithCode && loadError.code === ErrorCode.InternalServerError) {
            message = t("toab_jitsi_location_check_error");
          }
          setError(message);
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }
    void loadConfiguration();
    return (): void => {
      isCurrent = false;
    };
  }, [eventType.id, t]);

  const serverSelectionDisabled = disabled || isLoading || locationEnabled !== true || !!error;
  const selectedServer = servers.find((server) => server.id === selectedServerId);
  let triggerLabel = selectedServer?.name || t("toab_jitsi_choose_server");
  if (isLoading) triggerLabel = t("toab_jitsi_loading_servers");

  return (
    <div className="flex w-full flex-col gap-4 text-sm">
      {locationEnabled === false && (
        <p role="alert" className="text-red-600">
          {t("toab_jitsi_location_alert")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <div className="flex w-full flex-col gap-2">
        <label className="font-medium text-default text-sm leading-none">
          {t("toab_jitsi_select_conference_server")}
        </label>
        <Dropdown>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={serverSelectionDisabled}
              className="flex w-full items-center justify-between rounded-md border border-default bg-default px-3 py-2 text-default text-sm focus:border-brand-default focus:outline-none focus:ring-1 focus:ring-brand-default disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50">
              {triggerLabel}
              <svg className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[220px]">
            {servers.map((server) => (
              <DropdownMenuItem
                key={server.id}
                disabled={serverSelectionDisabled}
                className="cursor-pointer"
                onSelect={(): void => {
                  if (serverSelectionDisabled) return;
                  setAppData("serverId", server.id);
                  setAppData("serverUrl", server.serverUrl);
                }}>
                <DropdownItem className="w-full">
                  {server.name} ({t(SERVER_TYPE_TRANSLATION_KEYS[server.serverType])})
                </DropdownItem>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </Dropdown>
        {selectedServer && <p className="mt-1 text-subtle text-xs">{selectedServer.serverUrl}</p>}
      </div>
    </div>
  );
}
