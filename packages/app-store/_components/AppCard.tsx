import { useAutoAnimate } from "@formkit/auto-animate/react";
import Link from "next/link";

import { useAppContextWithSchema } from "@calcom/app-store/EventTypeAppContext";
import { useIsPlatform } from "@calcom/atoms/hooks/useIsPlatform";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import { Switch } from "@calcom/ui/components/form";
import { Icon } from "@calcom/ui/components/icon";
import { Section } from "@calcom/ui/components/section";

import type { AppCardApp } from "../types";
import OmniInstallAppButton from "./OmniInstallAppButton";

export default function AppCard({
  app,
  switchOnClick,
  switchChecked,
  children,
  returnTo,
  teamId,
  disableSwitch,
  switchTooltip,
  hideSettingsIcon = false,
  hideAppCardOptions = false,
  onAppInstallSuccess,
}: {
  app: AppCardApp;
  onAppInstallSuccess: () => void;
  description?: React.ReactNode;
  switchChecked?: boolean;
  switchOnClick?: (e: boolean) => void;
  children?: React.ReactNode;
  returnTo?: string;
  teamId?: number;
  LockedIcon?: React.ReactNode;
  disableSwitch?: boolean;
  switchTooltip?: string;
  hideSettingsIcon?: boolean;
  hideAppCardOptions?: boolean;
}) {
  const { t } = useLocale();
  const [animationRef] = useAutoAnimate<HTMLDivElement>();
  const { setAppData, LockedIcon, disabled: managedDisabled } = useAppContextWithSchema();
  const isPlatform = useIsPlatform();

  return (
    <Section className={classNames(!app?.isInstalled && "rounded-xl")}>
      <Section.Header
        rawHeading={
          <div>
            <div className="flex w-full items-center gap-1">
              <Section.Title>{app?.name}</Section.Title>
              {!app?.isInstalled && (
                <span className="bg-emphasis ml-1 rounded px-1 py-0.5 text-xs font-medium leading-3 tracking-[0.01em]">
                  {app?.categories[0].charAt(0).toUpperCase() + app?.categories[0].slice(1)}
                </span>
              )}
            </div>
            <Section.Description>{app?.description}</Section.Description>
          </div>
        }
        iconSlot={
          <Link href={`/apps/${app.slug}`} className="flex h-8 w-8 items-center justify-center">
            <img
              className={classNames(
                app?.logo.includes("-dark") && "dark:invert",
                "max-h-full max-w-full object-contain"
              )}
              src={app?.logo}
              alt={app?.name}
            />
          </Link>
        }>
        <div>
          <div>
            {/* {app.credentialOwner && !isPlatform && (
              <div className="ml-auto">
                <Badge variant="gray">
                  <div className="flex items-center">
                    <Avatar
                      className="mr-2"
                      alt={app.credentialOwner.name || "Credential Owner Name"}
                      size="sm"
                      imageSrc={app.credentialOwner.avatar}
                    />
                    {app.credentialOwner.name}
                  </div>
                </Badge>
              </div>
            )} */}
            {app?.isInstalled || app.credentialOwner ? (
              <div className="ml-auto flex items-center">
                <Switch
                  size="sm"
                  disabled={!app.enabled || managedDisabled || disableSwitch}
                  onCheckedChange={(enabled) => {
                    if (switchOnClick) {
                      switchOnClick(enabled);
                    }
                    setAppData("enabled", enabled);
                  }}
                  checked={switchChecked}
                  LockedIcon={LockedIcon}
                  data-testid={`${app.slug}-app-switch`}
                  tooltip={switchTooltip}
                />
              </div>
            ) : (
              <OmniInstallAppButton
                className="ml-auto flex items-center"
                app={app}
                returnTo={returnTo}
                teamId={teamId}
                onAppInstallSuccess={onAppInstallSuccess}
              />
            )}
          </div>
        </div>
      </Section.Header>
      {hideAppCardOptions
        ? null
        : app?.isInstalled &&
        switchChecked && (
          <div ref={animationRef}>
            {app.isSetupAlready === undefined || app.isSetupAlready ? (
              <div className="relative text-sm [&_input]:mb-0 [&_input]:leading-4">
                {!hideSettingsIcon && !isPlatform && (
                  <Link href={`/apps/${app.slug}/setup`} className="absolute right-0 top-0 ">
                    <Icon name="settings" className="text-default h-4 w-4" aria-hidden="true" />
                  </Link>
                )}
                {children}
              </div>
            ) : (
              <div className="flex h-64 w-full flex-col items-center justify-center gap-4 ">
                <p>{t("this_app_is_not_setup_already")}</p>
                <Link href={`/apps/${app.slug}/setup`}>
                  <Button StartIcon="settings">{t("setup")}</Button>
                </Link>
              </div>
            )}
          </div>
        )}
    </Section>
  );
}
