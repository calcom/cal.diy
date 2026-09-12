import type { SelectClassNames } from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { App } from "@calcom/types/App";
import type { IntegrationCalendar } from "@calcom/types/Calendar";
import { Badge } from "@calcom/ui/components/badge";
import { Select } from "@calcom/ui/components/form";
import { CheckIcon } from "@coss/ui/icons";
import classNames from "classnames";
import { useEffect, useState } from "react";
import type { OptionProps, SingleValueProps } from "react-select";
import { components } from "react-select";

type CalendarWithPrimary = Omit<IntegrationCalendar, "primary"> & {
  primary?: boolean | null;
  isSelected?: boolean;
  credentialId?: number | null;
  delegationCredentialId?: string | null;
};

interface ConnectedCalendar {
  credentialId: number;
  integration: App & { title?: string; slug?: string };
  primary?: CalendarWithPrimary | null;
  calendars?: CalendarWithPrimary[] | null;
  cacheUpdatedAt?: Date | string | null;
  delegationCredentialId?: string | null;
  error?: {
    message: string;
  };
}

interface DestinationCalendar {
  integration: string;
  externalId: string;
  primaryEmail?: string | null;
  name?: string | null;
  integrationTitle?: string | null;
  credentialId?: number | null;
  email?: string | null;
  readOnly?: boolean | null;
  primary?: boolean | null;
  id?: string | number | null;
  userId?: number | null;
  eventTypeId?: number | null;
  customCalendarReminder?: number | null;
  delegationCredentialId?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

interface CalendarsQueryData {
  connectedCalendars: ConnectedCalendar[];
  destinationCalendar: DestinationCalendar | null;
}

interface Props {
  onChange: (value: { externalId: string; integration: string }) => void;
  isPending?: boolean;
  hidePlaceholder?: boolean;
  /** The external Id of the connected calendar */ // destinationCalendar?: DestinationCalendar | null;
  value: string | undefined;
  maxWidth?: number;
  hideAdvancedText?: boolean;
  calendarsQueryData?: CalendarsQueryData;
  customClassNames?: SelectClassNames;
}

interface Option {
  label: string;
  value: string;
  subtitle: string;
}

const formatCalendarDetails = (...parts: (string | null | undefined)[]): string => {
  const details = parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" - ");
  return details ? `(${details})` : "";
};

const formatCalendarLabel = (
  name: string | null | undefined,
  ...details: (string | null | undefined)[]
): string => [name?.trim(), formatCalendarDetails(...details)].filter(Boolean).join(" ");

export const SingleValueComponent = ({ ...props }: SingleValueProps<Option>) => {
  const { label, subtitle } = props.data;
  return (
    <components.SingleValue {...props} className="flex space-x-1">
      <p>{label}</p> <p className=" text-subtle">{subtitle}</p>
    </components.SingleValue>
  );
};

export const OptionComponent = ({ ...props }: OptionProps<Option>) => {
  const { label } = props.data;
  return (
    <components.Option {...props}>
      <div className="flex">
        <span className="mr-auto">{label}</span>
        {props.isSelected && <CheckIcon className="ml-2 h-4 w-4" />}
      </div>
    </components.Option>
  );
};

const DestinationCalendarSelector = ({
  onChange,
  isPending,
  value,
  hidePlaceholder,
  hideAdvancedText,
  maxWidth,
  calendarsQueryData,
  customClassNames,
}: Props): JSX.Element | null => {
  const { t } = useLocale();
  const connectedCalendarsList = calendarsQueryData?.connectedCalendars;
  const destinationCalendar = calendarsQueryData?.destinationCalendar;

  const [selectedOption, setSelectedOption] = useState<{
    value: string;
    label: string;
    subtitle: string;
  } | null>(null);

  // Extra styles to show prefixed text in react-select
  const content = (hidePlaceholder = false) => {
    if (!hidePlaceholder) {
      return {
        alignItems: "center",
        width: "100%",
        display: "flex",
        ":before": {
          content: `'${t("create_events_on")}:'`,
          display: "block",
          marginRight: 8,
        },
      };
    }
    return {};
  };

  useEffect(() => {
    const selected = connectedCalendarsList
      ?.flatMap((connected) => connected.calendars ?? [])
      .find((cal) => cal.externalId === value);

    if (selected) {
      const selectedIntegration = connectedCalendarsList?.find((integration) =>
        integration.calendars?.some((calendar) => calendar.externalId === selected.externalId)
      );

      setSelectedOption({
        value: `${selected.integration}:${selected.externalId}`,
        label: selected.name ? `${selected.name} ` : "",
        subtitle: formatCalendarDetails(
          selectedIntegration?.integration.name.replace(/calendar/i, ""),
          selectedIntegration?.primary?.name
        ),
      });
    }
  }, [connectedCalendarsList]);

  if (!connectedCalendarsList?.length) {
    return null;
  }
  const options =
    connectedCalendarsList?.map((selectedCalendar) => ({
      key: selectedCalendar.credentialId,
      label: formatCalendarLabel(
        selectedCalendar.integration.name.replace(/calendar/i, ""),
        selectedCalendar.primary?.integration === "office365_calendar"
          ? selectedCalendar.primary?.email
          : selectedCalendar.primary?.name
      ),
      options: (selectedCalendar.calendars ?? [])
        .filter((cal) => cal.readOnly === false)
        .map((cal) => ({
          label: cal.name?.trim() ?? "",
          subtitle: formatCalendarDetails(
            selectedCalendar.integration.name.replace(/calendar/i, ""),
            selectedCalendar.primary?.name
          ),
          value: `${cal.integration}:${cal.externalId}`,
        })),
    })) ?? [];

  return (
    <div
      className="relative table w-full table-fixed"
      title={`${t("create_events_on")}: ${selectedOption?.label || ""}`}>
      <Select
        name="primarySelectedCalendar"
        placeholder={
          !hidePlaceholder ? (
            `${t("create_events_on")}`
          ) : (
            <span className="text-default min-w-0 overflow-hidden truncate whitespace-nowrap">
              <Badge variant="blue">{t("default")}</Badge>{" "}
              {formatCalendarLabel(
                destinationCalendar?.name,
                destinationCalendar?.integrationTitle,
                destinationCalendar?.primaryEmail
              )}
            </span>
          )
        }
        options={options}
        styles={{
          placeholder: (styles) => Object.assign({}, styles, content(hidePlaceholder)),
          singleValue: (styles) => Object.assign({}, styles, content(hidePlaceholder)),
          control: (defaultStyles) =>
            Object.assign({}, defaultStyles, {
              "@media only screen and (min-width: 640px)": Object.assign(
                {},
                defaultStyles["@media only screen and (min-width: 640px)"] as object,
                { maxWidth }
              ),
            }),
        }}
        isSearchable={false}
        className={classNames(
          "border-default my-2 block w-full min-w-0 flex-1 rounded-none rounded-r-sm text-sm",
          customClassNames?.select
        )}
        innerClassNames={customClassNames?.innerClassNames}
        onChange={(newValue) => {
          setSelectedOption(newValue);
          if (!newValue) {
            return;
          }

          /* Split only the first `:`, since Apple uses the full URL as externalId */
          const [integration, externalId] = newValue.value.split(/:(.+)/);

          onChange({
            integration,
            externalId,
          });
        }}
        isLoading={isPending}
        value={selectedOption}
        components={{ SingleValue: SingleValueComponent, Option: OptionComponent }}
        isMulti={false}
      />
      {hideAdvancedText ? null : (
        <p className="text-sm leading-tight">{t("you_can_override_calendar_in_advanced_tab")}</p>
      )}
    </div>
  );
};

export default DestinationCalendarSelector;
