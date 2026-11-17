"use client";

import { InstallAppButton } from "@calcom/app-store/InstallAppButton";
import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";
import { ShellSubHeading } from "@calcom/ui/components/layout";
import { List } from "@calcom/ui/components/list";
import { showToast } from "@calcom/ui/components/toast";
import { revalidateSettingsCalendars } from "@calcom/web/app/cache/path/settings/my-account";
import AppListCardWebWrapper from "@calcom/web/modules/apps/components/AppListCardWebWrapper";
import { SkeletonLoader } from "@calcom/web/modules/apps/components/SkeletonLoader";
import { SelectedCalendarsSettingsWebWrapper } from "@calcom/web/modules/calendars/components/SelectedCalendarsSettingsWebWrapper";
import SubHeadingTitleWithConnections from "@components/integrations/SubHeadingTitleWithConnections";
import useRouterQuery from "@lib/hooks/useRouterQuery";
import { QueryCell } from "@lib/QueryCell";
import { Suspense, useEffect } from "react";
import { DestinationCalendarSettingsWebWrapper } from "./DestinationCalendarSettingsWebWrapper";

type CalendarListContainerProps = {
  connectedCalendars: RouterOutputs["viewer"]["calendars"]["connectedCalendars"];
  installedCalendars: RouterOutputs["viewer"]["apps"]["integrations"];
  heading?: boolean;
  fromOnboarding?: boolean;
};

type Props = {
  onChanged: () => unknown | Promise<unknown>;
  fromOnboarding?: boolean;
  destinationCalendarId?: string;
  isPending?: boolean;
};

function CalendarList(props: Props): JSX.Element {
  const { t } = useLocale();
  const query = trpc.viewer.apps.integrations.useQuery({ variant: "calendar", onlyInstalled: false });

  return (
    <QueryCell
      query={query}
      success={({ data }) => (
        <List>
          {data.items.map((item) => (
            <AppListCardWebWrapper
              title={item.name}
              key={item.name}
              logo={item.logo}
              description={item.description}
              shouldHighlight
              slug={item.slug}
              actions={
                item.isInstalled ? (
                  <Button color="secondary" disabled>
                    {t("installed")}
                  </Button>
                ) : (
                  <InstallAppButton
                    type={item.type}
                    render={(buttonProps) => (
                      <Button color="secondary" {...buttonProps}>
                        {t("connect")}
                      </Button>
                    )}
                    onChanged={() => props.onChanged()}
                  />
                )
              }
            />
          ))}
        </List>
      )}
    />
  );
}

const AddCalendarButton = (): JSX.Element => {
  const { t } = useLocale();
  return (
    <Button color="secondary" StartIcon="plus" href="/apps/categories/calendar">
      {t("add_calendar")}
    </Button>
  );
};

export const CalendarListContainerSkeletonLoader = (): JSX.Element => {
  const { t } = useLocale();
  return (
    <SettingsHeader
      title={t("calendars")}
      description={t("calendars_description")}
      CTA={<AddCalendarButton />}>
      <SkeletonLoader />
    </SettingsHeader>
  );
};

export function CalendarListContainer({
  connectedCalendars: data,
  installedCalendars,
  heading = true,
  fromOnboarding,
}: CalendarListContainerProps): JSX.Element {
  const { t } = useLocale();
  const { error, setQuery: setError } = useRouterQuery("error");

  useEffect(() => {
    if (error === "account_already_linked" || error === "no_default_calendar") {
      showToast(t(error), "error", { id: error });
      setError(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const utils = trpc.useUtils();
  const onChanged = (): void => {
    Promise.allSettled([
      utils.viewer.apps.integrations.invalidate(
        { variant: "calendar", onlyInstalled: true },
        {
          exact: true,
        }
      ),
      utils.viewer.apps.integrations.invalidate(
        { variant: "calendar", onlyInstalled: false },
        {
          exact: true,
        }
      ),
      utils.viewer.calendars.connectedCalendars.invalidate(),
      revalidateSettingsCalendars(),
    ]);
  };
  const mutation = trpc.viewer.calendars.setDestinationCalendar.useMutation({
    onSuccess: () => {
      utils.viewer.calendars.connectedCalendars.invalidate();
      revalidateSettingsCalendars();
    },
  });

  let content = null;
  if (!!data.connectedCalendars.length || !!installedCalendars?.items.length) {
    let headingContent = null;
    if (heading) {
      headingContent = (
        <>
          <DestinationCalendarSettingsWebWrapper connectedCalendars={data} />
          <Suspense fallback={<SkeletonLoader />}>
            <SelectedCalendarsSettingsWebWrapper
              onChanged={onChanged}
              fromOnboarding={fromOnboarding}
              destinationCalendarId={data.destinationCalendar?.externalId}
              isPending={mutation.isPending}
              connectedCalendars={data}
            />
          </Suspense>
        </>
      );
    }
    content = headingContent;
  } else if (fromOnboarding) {
    content = (
      <>
        {!!data?.connectedCalendars.length && (
          <ShellSubHeading
            className="mt-4"
            title={<SubHeadingTitleWithConnections title={t("connect_additional_calendar")} />}
          />
        )}
        <CalendarList onChanged={onChanged} />
      </>
    );
  } else {
    content = (
      <EmptyScreen
        Icon="calendar"
        headline={t("no_category_apps", {
          category: t("calendar").toLowerCase(),
        })}
        description={t(`no_category_apps_description_calendar`)}
        buttonRaw={
          <Button
            EndIcon="external-link"
            color="secondary"
            data-testid="connect-calendar-apps"
            href="/apps/categories/calendar">
            {t("connect_your_first_calendar")}
          </Button>
        }
      />
    );
  }

  return (
    <SettingsHeader
      title={t("calendars")}
      description={t("calendars_description")}
      CTA={<AddCalendarButton />}>
      {content}
    </SettingsHeader>
  );
}
