import Link from "next/link";
import { useState } from "react";
import posthog from "posthog-js";

import { InstallAppButtonWithoutPlanCheck } from "@calcom/app-store/InstallAppButtonWithoutPlanCheck";
import type { TDependencyData } from "@calcom/app-store/_appRegistry";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import type { App } from "@calcom/types/App";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { showToast } from "@calcom/ui/components/toast";
import { ArrowRightIcon, CircleAlertIcon } from "@coss/ui/icons";

interface IAppConnectionItem {
  title: string;
  description?: string;
  logo: string;
  type: App["type"];
  installed?: boolean;
  isDefault?: boolean;
  defaultInstall?: boolean;
  slug?: string;
  dependencyData?: TDependencyData;
}

const AppConnectionItem = (props: IAppConnectionItem) => {
  const { title, logo, type, installed, isDefault, defaultInstall, slug } = props;
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const setDefaultConferencingApp = trpc.viewer.apps.setDefaultConferencingApp.useMutation({
    onSuccess: async () => {
      await utils.viewer.me.invalidate();
    },
    onError: (error) => {
      showToast(t("something_went_wrong"), "error");
      console.error(error);
    },
  });
  const dependency = props.dependencyData?.find((data) => !data.installed);

  const [isInstalling, setInstalling] = useState(false);

  return (
    <div className="flex flex-row items-center justify-between p-5">
      <div className="flex items-center space-x-3">
        {/* eslint-disable @next/next/no-img-element */}
        <img src={logo} alt={title} className="h-8 w-8" />
        <p className="text-sm font-bold">{title}</p>
        {isDefault && <Badge variant="green">{t("default")}</Badge>}
      </div>
      <div className="flex items-center space-x-2">
        <InstallAppButtonWithoutPlanCheck
          type={type}
          options={{
            onSuccess: (data) => {
              setInstalling(false);
              utils.viewer.apps.integrations.invalidate();
              // Don't show success toast if OAuth flow is pending (user will be redirected)
              if (data?.setupPending) return;
              if (defaultInstall && slug) {
                setDefaultConferencingApp.mutate({ slug });
              }
              showToast(t("app_successfully_installed"), "success");
            },
            onError: (error) => {
              if (error instanceof Error)
                showToast(error.message || t("app_could_not_be_installed"), "error");
            },
          }}
          render={(buttonProps) => (
            <Button
              {...buttonProps}
              color="secondary"
              disabled={installed || !!dependency}
              type="button"
              loading={isInstalling || buttonProps?.loading}
              tooltip={
                dependency ? (
                  <div className="items-start space-x-2.5">
                    <div className="flex items-start">
                      <div>
                        <CircleAlertIcon className="mr-2 mt-1 font-semibold" />
                      </div>
                      <div>
                        <span className="text-xs font-semibold">
                          {t("this_app_requires_connected_account", {
                            appName: title,
                            dependencyName: dependency.name,
                            interpolation: { escapeValue: false },
                          })}
                        </span>

                        <div>
                          <div>
                            <>
                              <Link
                                href={`${WEBAPP_URL}/getting-started/connected-calendar`}
                                className="flex items-center text-xs underline">
                                <span className="mr-1">
                                  {t("connect_app", { dependencyName: dependency.name })}
                                </span>
                                <ArrowRightIcon className="inline-block h-3 w-3" />
                              </Link>
                            </>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : undefined
              }
              onClick={(event) => {
                posthog.capture("onboarding_app_connect_clicked", {
                  app_title: title,
                  app_type: type,
                  app_slug: slug,
                  has_dependency: !!dependency,
                });
                // Save cookie key to return url step
                document.cookie = `return-to=${window.location.href};path=/;max-age=3600;SameSite=Lax`;
                if (buttonProps?.onClick) {
                  buttonProps.onClick(event);
                }
                setInstalling(true);
              }}>
              {installed ? t("installed") : t("connect")}
            </Button>
          )}
        />
        {/* It is possible that app is already installed here during onboarding due to Delegation Credential enabled at organization level. We allow the user to set it as default */}
        {installed && !isDefault && (
          <Button
            color="secondary"
            className="ml-2"
            type="button"
            loading={setDefaultConferencingApp.isPending}
            onClick={() => {
              if (slug) {
                setDefaultConferencingApp.mutate({ slug });
              }
            }}>
            {t("set_as_default")}
          </Button>
        )}
      </div>
    </div>
  );
};

export { AppConnectionItem };
