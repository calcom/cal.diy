import { SelectedCalendarsSettings } from "@calcom/atoms/selected-calendars/SelectedCalendarsSettings";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Alert } from "@calcom/ui/components/alert";
import { Select } from "@calcom/ui/components/form";
import { List } from "@calcom/ui/components/list";
import AppListCardWebWrapper from "@calcom/web/modules/apps/components/AppListCardWebWrapper";
import CredentialActionsDropdown from "@calcom/web/modules/apps/components/CredentialActionsDropdown";
import AdditionalCalendarSelector from "@calcom/web/modules/calendars/components/AdditionalCalendarSelector";
import { CalendarSwitch } from "@calcom/web/modules/calendars/components/CalendarSwitch";
import Link from "next/link";
import React from "react";

export enum SelectedCalendarSettingsScope {
  User = "user",
  EventType = "eventType",
}

type SelectedCalendarsSettingsWebWrapperProps = {
  onChanged?: () => unknown | Promise<unknown>;
  fromOnboarding?: boolean;
  destinationCalendarId?: string;
  isPending?: boolean;
  eventTypeId?: number;
  disabledScope?: SelectedCalendarSettingsScope;
  scope?: SelectedCalendarSettingsScope;
  setScope?: (scope: SelectedCalendarSettingsScope) => void;
  disableConnectionModification?: boolean;
  connectedCalendars?: RouterOutputs["viewer"]["calendars"]["connectedCalendars"];
};

const ConnectedCalendarList = ({
  fromOnboarding = false,
  scope,
  items,
  disableConnectionModification,
  eventTypeId,
  onChanged,
  isDisabled,
}: {
  fromOnboarding?: boolean;
  scope: SelectedCalendarSettingsScope;
  items: RouterOutputs["viewer"]["calendars"]["connectedCalendars"]["connectedCalendars"];
  disableConnectionModification?: boolean;
  eventTypeId: number | null;
  onChanged?: () => unknown | Promise<unknown>;
  isDisabled: boolean;
}) => {
  const { t } = useLocale();
  const shouldUseEventTypeScope = scope === SelectedCalendarSettingsScope.EventType;
  return (
    <List noBorderTreatment className="p-6 pt-2">
      {items.map((connectedCalendar) => {
        if (!!connectedCalendar.calendars && connectedCalendar.calendars.length > 0) {
          return (
            <AppListCardWebWrapper
              key={`list-${connectedCalendar.credentialId}-${scope}`}
              shouldHighlight
              slug={connectedCalendar.integration.slug}
              title={connectedCalendar.integration.name}
              logo={connectedCalendar.integration.logo}
              description={connectedCalendar.primary?.email ?? connectedCalendar.integration.description}
              className="border-subtle mt-4 rounded-lg border"
              actions={
                <div className="flex w-32 justify-end">
                  <CredentialActionsDropdown
                    credentialId={connectedCalendar.credentialId}
                    onSuccess={onChanged}
                    delegationCredentialId={connectedCalendar.delegationCredentialId}
                    disableConnectionModification={disableConnectionModification}
                  />
                </div>
              }>
              <div className="border-subtle border-t">
                {!fromOnboarding && (
                  <>
                    <p className="text-subtle px-5 pt-4 text-sm">{t("toggle_calendars_conflict")}</p>
                    <ul className="stack-y-4 px-5 py-4">
                      {connectedCalendar.calendars?.map((cal) => (
                        <CalendarSwitch
                          disabled={isDisabled}
                          key={cal.externalId}
                          externalId={cal.externalId}
                          title={cal.name || "Nameless calendar"}
                          name={cal.name || "Nameless calendar"}
                          type={connectedCalendar.integration.type}
                          isChecked={cal.isSelected}
                          destination={false}
                          credentialId={cal.credentialId}
                          eventTypeId={(() => {
                            if (shouldUseEventTypeScope) {
                              return eventTypeId;
                            }
                            return null;
                          })()}
                          delegationCredentialId={connectedCalendar.delegationCredentialId || null}
                        />
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </AppListCardWebWrapper>
          );
        }
        return (
          <Alert
            key={`alert-${connectedCalendar.credentialId}`}
            severity="warning"
            title={t("something_went_wrong")}
            message={
              <span>
                <Link href={`/apps/${connectedCalendar.integration.slug}`}>
                  {connectedCalendar.integration.name}
                </Link>
                : {t("calendar_error")}
              </span>
            }
            iconClassName="h-10 w-10 ml-2 mr-1 mt-0.5"
            actions={
              <div className="flex w-32 justify-end">
                <CredentialActionsDropdown
                  credentialId={connectedCalendar.credentialId}
                  onSuccess={onChanged}
                  delegationCredentialId={connectedCalendar.delegationCredentialId}
                  disableConnectionModification={disableConnectionModification}
                />
              </div>
            }
          />
        );
      })}
    </List>
  );
};

export const SelectedCalendarsSettingsWebWrapper = (props: SelectedCalendarsSettingsWebWrapperProps) => {
  const {
    scope = SelectedCalendarSettingsScope.User,
    setScope = () => {
      return;
    },
    disabledScope,
    disableConnectionModification,
    eventTypeId = null,
  } = props;

  let queryInput: { eventTypeId: number } | undefined;
  if (scope === SelectedCalendarSettingsScope.EventType) {
    queryInput = { eventTypeId: eventTypeId! };
  }

  let initialData: RouterOutputs["viewer"]["calendars"]["connectedCalendars"] | undefined;
  if (scope === SelectedCalendarSettingsScope.User && props.connectedCalendars) {
    initialData = props.connectedCalendars;
  }

  const query = trpc.viewer.calendars.connectedCalendars.useQuery(queryInput, {
    initialData,
    suspense: true,
    refetchOnWindowFocus: false,
  });

  const isPending = props.isPending;
  const showScopeSelector = !!props.eventTypeId;

  let isDisabled = false;
  if (disabledScope) {
    isDisabled = disabledScope === scope;
  }

  const shouldDisableConnectionModification = isDisabled || disableConnectionModification;
  return (
    <div>
      <SelectedCalendarsSettings>
        <SelectedCalendarsSettingsHeading
          isConnectedCalendarsPresent={!!query.data?.connectedCalendars.length}
          isPending={isPending}
          showScopeSelector={showScopeSelector}
          setScope={setScope}
          scope={scope}
          shouldDisableConnectionModification={shouldDisableConnectionModification}
        />
        {!!(query.data?.connectedCalendars && query.data?.connectedCalendars.length > 0) && (
          <ConnectedCalendarList
            fromOnboarding={props.fromOnboarding}
            scope={scope}
            disableConnectionModification={disableConnectionModification}
            onChanged={props.onChanged}
            eventTypeId={eventTypeId}
            items={query.data.connectedCalendars}
            isDisabled={isDisabled}
          />
        )}
      </SelectedCalendarsSettings>
    </div>
  );
};

export const SelectedCalendarsSettingsWebWrapperSkeleton = () => {
  return (
    <div className="border-subtle mt-6 rounded-lg border">
      <div className="border-subtle border-b p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="bg-emphasis h-4 w-32 animate-pulse rounded-md" />
            <div className="bg-emphasis mt-2 h-4 w-48 animate-pulse rounded-md" />
          </div>
          <div className="bg-emphasis h-8 w-32 animate-pulse rounded-md" />
        </div>
      </div>
      <div className="p-6 pt-2">
        <div className="border-subtle mt-4 rounded-lg border p-4">
          <div className="flex items-center">
            <div className="bg-emphasis h-10 w-10 animate-pulse rounded-md" />
            <div className="ml-4 stack-y-2">
              <div className="bg-emphasis h-4 w-32 animate-pulse rounded-md" />
              <div className="bg-emphasis h-4 w-48 animate-pulse rounded-md" />
            </div>
          </div>
          <div className="border-subtle mt-4 stack-y-4 border-t pt-4">
            <div className="bg-emphasis h-4 w-64 animate-pulse rounded-md" />
            <div className="stack-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="bg-emphasis h-4 w-48 animate-pulse rounded-md" />
                  <div className="bg-emphasis h-6 w-10 animate-pulse rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SelectedCalendarsSettingsHeading = (props: {
  isConnectedCalendarsPresent: boolean;
  isPending?: boolean;
  showScopeSelector: boolean;
  setScope: (scope: SelectedCalendarSettingsScope) => void;
  scope: SelectedCalendarSettingsScope;
  shouldDisableConnectionModification?: boolean;
}) => {
  const { t } = useLocale();
  const optionsToSwitchScope = [
    { label: "User", value: SelectedCalendarSettingsScope.User },
    { label: "Event Type", value: SelectedCalendarSettingsScope.EventType },
  ];
  const switchScopeSelectValue = optionsToSwitchScope.find((option) => option.value === props.scope);
  return (
    <div className="border-subtle border-b p-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-emphasis text-base font-semibold leading-5">{t("check_for_conflicts")}</h4>
          <p className="text-default text-sm leading-tight">{t("select_calendars")}</p>
        </div>

        {!props.shouldDisableConnectionModification && (
          <div className="flex flex-col xl:flex-row xl:space-x-5">
            {props.isConnectedCalendarsPresent && (
              <div className="flex items-center">
                <AdditionalCalendarSelector isPending={props.isPending} />
              </div>
            )}
          </div>
        )}
      </div>
      {props.showScopeSelector && (
        <div className="mt-2 flex flex-row items-center space-x-2">
          <span className="text-default text-sm">Using</span>
          <Select
            onChange={(option) => {
              if (!option) return;
              props.setScope(option.value);
            }}
            value={switchScopeSelectValue}
            options={optionsToSwitchScope}
          />
          <span className="text-default text-sm">settings</span>
        </div>
      )}
    </div>
  );
};
