import { useAutoAnimate } from "@formkit/auto-animate/react";
import { ErrorMessage } from "@hookform/error-message";
import { useState } from "react";
import { useFormContext, Controller } from "react-hook-form";

import { useIsPlatform } from "@calcom/atoms/hooks/useIsPlatform";
import type { FormValues } from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import { TextField } from "@calcom/ui/components/form";
import { SettingsToggle } from "@calcom/ui/components/form";
import { Icon } from "@calcom/ui/components/icon";
import { Tooltip } from "@calcom/ui/components/tooltip";
import LocationSettingsContainer from "@calcom/web/modules/event-types/components/locations/LocationSettingsContainer";
import { InfoBadge } from "@calcom/ui/components/badge";

const CalVideoSettings = () => {
  const { t } = useLocale();
  const formMethods = useFormContext<FormValues>();
  const isPlatform = useIsPlatform();
  const [isExpanded, setIsExpanded] = useState(false);
  const [parent] = useAutoAnimate<HTMLDivElement>();
  const hasTeamPlan = false;
  return (
    <>
      <Tooltip content="expandable" side="right" className="lg:hidden">
        <button
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded(!isExpanded)}
          className={classNames(
            "cursor-pointer todesktop:py-[7px] text-default group flex w-full items-center rounded-md px-2 pt-1.5 text-sm font-medium transition",
            "[&[aria-current='page']]:!bg-transparent",
            "[&[aria-current='page']]:text-emphasis mt-0.5 text-sm"
          )}>
          <span className="hidden w-full justify-between truncate text-ellipsis lg:flex">
            {!isExpanded ? t("show_advanced_settings") : t("hide_advanced_settings")}
          </span>
          <Icon name={isExpanded ? "chevron-up" : "chevron-down"} className="ml-auto h-4 w-4" />
        </button>
      </Tooltip>
      <div ref={parent}>
        {isExpanded && (
          <LocationSettingsContainer>
            <Controller
              name="calVideoSettings.disableRecordingForGuests"
              defaultValue={false}
              render={({ field: { onChange, value } }) => {
                return (
                  <SettingsToggle
                    title={t("disable_recording_for_guests")}
                    labelClassName="text-sm leading-6 whitespace-normal wrap-break-word"
                    checked={value}
                    disabled={!hasTeamPlan}
                    onCheckedChange={onChange}
                    Badge={undefined}
                  />
                );
              }}
            />

            <Controller
              name="calVideoSettings.disableRecordingForOrganizer"
              defaultValue={false}
              render={({ field: { onChange, value } }) => {
                return (
                  <SettingsToggle
                    title={t("disable_recording_for_organizer")}
                    labelClassName="text-sm leading-6 whitespace-normal wrap-break-word"
                    checked={value}
                    disabled={!hasTeamPlan}
                    onCheckedChange={onChange}
                    Badge={undefined}
                  />
                );
              }}
            />

            {!isPlatform && (
              <Controller
                name="calVideoSettings.enableAutomaticRecordingForOrganizer"
                defaultValue={false}
                render={({ field: { onChange, value } }) => {
                  return (
                    <SettingsToggle
                      title={t("enable_automatic_recording")}
                      labelClassName="text-sm"
                      checked={value}
                      disabled={!hasTeamPlan}
                      onCheckedChange={onChange}
                      Badge={undefined}
                    />
                  );
                }}
              />
            )}

            <Controller
              name="calVideoSettings.enableAutomaticTranscription"
              defaultValue={false}
              render={({ field: { onChange, value } }) => {
                return (
                  <SettingsToggle
                    title={t("enable_automatic_transcription")}
                    labelClassName="text-sm leading-6 whitespace-normal wrap-break-word"
                    checked={value}
                    disabled={!hasTeamPlan}
                    onCheckedChange={onChange}
                    Badge={undefined}
                  />
                );
              }}
            />

            {!isPlatform && (
              <Controller
                name="calVideoSettings.disableTranscriptionForGuests"
                defaultValue={false}
                render={({ field: { onChange, value } }) => {
                  return (
                    <SettingsToggle
                      title={t("disable_transcription_for_guests")}
                      labelClassName="text-sm leading-6 whitespace-normal wrap-break-word"
                      checked={value}
                      disabled={!hasTeamPlan}
                      onCheckedChange={onChange}
                      Badge={undefined}
                    />
                  );
                }}
              />
            )}
            {!isPlatform && (
              <Controller
                name="calVideoSettings.disableTranscriptionForOrganizer"
                defaultValue={false}
                render={({ field: { onChange, value } }) => {
                  return (
                    <SettingsToggle
                      title={t("disable_transcription_for_organizer")}
                      labelClassName="text-sm leading-6 whitespace-normal wrap-break-word"
                      checked={value}
                      disabled={!hasTeamPlan}
                      onCheckedChange={onChange}
                      Badge={undefined}
                    />
                  );
                }}
              />
            )}

            <Controller
              name="calVideoSettings.requireEmailForGuests"
              defaultValue={false}
              render={({ field: { onChange, value } }) => {
                return (
                  <SettingsToggle
                    title={t("require_email_for_guests")}
                    description={t("require_email_for_guests_description")}
                    labelClassName="text-sm leading-6 whitespace-normal break-words"
                    checked={value}
                    disabled={!hasTeamPlan}
                    onCheckedChange={onChange}
                    Badge={undefined}
                  />
                );
              }}
            />

            <TextField
              label={
                <div className="flex gap-1 items-center">
                  {t("redirect_url")}
                  <InfoBadge content={t("enter_redirect_url_on_exit_description")} />
                </div>
              }
              defaultValue=""
              data-testid="calVideoSettings.redirectUrlOnExit"
              containerClassName="mt-4"
              className="leading-6"
              {...formMethods.register("calVideoSettings.redirectUrlOnExit", {
                setValueAs: (v) => (!v || v.trim() === "" ? null : v),
              })}
            />
            <ErrorMessage
              errors={formMethods.formState.errors?.calVideoSettings}
              name="redirectUrlOnExit"
              className={classNames("text-error text-sm")}
              as="div"
              id="calVideoSettings.redirectUrlOnExit-error"
            />
          </LocationSettingsContainer>
        )}
      </div>
    </>
  );
};

export default CalVideoSettings;
