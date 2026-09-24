"use client";

import type { Timezones } from "@calcom/lib/timezone";
import { addTimezonesToDropdown, filterBySearchText, handleOptionLabel } from "@calcom/lib/timezone";
import classNames from "@calcom/ui/classNames";
import { getReactSelectProps, inputStyles } from "@calcom/ui/components/form";
import { useCallback, useMemo, useState } from "react";
import type { ITimezone, ITimezoneOption, Props as SelectProps } from "react-timezone-select";
import BaseSelect from "react-timezone-select";

export type TimezoneSelectComponentProps = SelectProps & {
  variant?: "default" | "minimal";
  isPending: boolean;
  data?: Timezones;
  timezoneSelectCustomClassname?: string;
  size?: "sm" | "md";
  grow?: boolean;
  isWebTimezoneSelect?: boolean;
};

// TODO: I wonder if we move this to ui package, and keep the TRPC version in features
export function TimezoneSelectComponent({
  className,
  classNames: timezoneClassNames,
  timezoneSelectCustomClassname,
  components,
  variant: _variant = "default",
  isPending,
  value,
  size = "md",
  grow = false,
  isWebTimezoneSelect = true,
  ...props
}: TimezoneSelectComponentProps) {
  const data = useMemo(() => props.data || [], [props.data]);

  /*
   * we support multiple timezones for the different labels
   * e.g. 'Sao Paulo' and 'Brazil Time' both being 'America/Sao_Paulo'
   * but react-timezone-select does not.
   *
   * We make sure to be able to search through both options, and flip the key/value on final display.
   */
  const [additionalTimezones, setAdditionalTimezones] = useState<Timezones>([]);

  const handleInputChange = useCallback(
    (searchText: string) => {
      if (data) setAdditionalTimezones(filterBySearchText(searchText, data));
    },
    [data]
  );

  const reactSelectProps = useMemo(() => getReactSelectProps({ components: components || {} }), [components]);

  const timezones = useMemo(
    () => ({
      ...(data.length > 0 ? addTimezonesToDropdown(data) : {}),
      ...(isWebTimezoneSelect ? addTimezonesToDropdown(additionalTimezones) : {}),
    }),
    [data, isWebTimezoneSelect, additionalTimezones]
  );

  const handleChange = useCallback(
    (selectedOption: ITimezoneOption | null) => {
      if (!props.onChange) return;

      if (!selectedOption) {
        props.onChange(selectedOption as unknown as ITimezoneOption);
        return;
      }

      const corrections: Record<string, string> = {
        "America/Port_Of_Spain": "America/Port_of_Spain",
        "Africa/Porto-novo": "Africa/Porto-Novo",
        "Africa/Dar_Es_Salaam": "Africa/Dar_es_Salaam",
      };

      const correctedValue = corrections[selectedOption.value] || selectedOption.value;
      props.onChange({ ...selectedOption, value: correctedValue });
    },
    [props.onChange]
  );

  const formatOption = useCallback(
    (option: unknown) => <p className="truncate">{(option as ITimezoneOption).value.replace(/_/g, " ")}</p>,
    []
  );

  const getLabel = useCallback(
    (option: unknown) => handleOptionLabel(option as ITimezoneOption, additionalTimezones),
    [additionalTimezones]
  );

  return (
    <BaseSelect
      value={value}
      className={`${className} ${timezoneSelectCustomClassname}`}
      aria-label="Timezone Select"
      isLoading={isPending}
      data-testid="timezone-select"
      isDisabled={isPending}
      {...reactSelectProps}
      timezones={timezones}
      styles={{
        control: (base) =>
          Object.assign({}, base, {
            minHeight: size === "sm" ? "28px" : "36px",
            height: grow ? "h-auto " : size === "sm" ? "28px" : "36px",
          }),
        menuList: (base) =>
          Object.assign({}, base, {
            height: grow ? "h-auto " : size === "sm" ? "200px" : "180px",
          }),
      }}
      onInputChange={handleInputChange}
      {...props}
      onChange={handleChange}
      formatOptionLabel={formatOption}
      getOptionLabel={getLabel}
      classNames={{
        ...timezoneClassNames,
        input: (state) =>
          classNames(
            "text-emphasis h-6 md:max-w-[145px] max-w-[250px]",
            timezoneClassNames?.input && timezoneClassNames.input(state)
          ),
        option: (state) =>
          classNames(
            "bg-default py-2.5 px-3 rounded-md text-default cursor-pointer",
            state.isFocused && "bg-subtle",
            state.isDisabled && "bg-cal-muted !cursor-not-allowed",
            state.isSelected && "bg-emphasis text-default",
            timezoneClassNames?.option && timezoneClassNames.option(state)
          ),
        placeholder: (state) => classNames("text-muted", state.isFocused && "hidden"),
        dropdownIndicator: () => "text-default",
        control: (state) =>
          classNames(
            inputStyles({ size }),
            state.isMulti
              ? state.hasValue
                ? "p-1 h-fit"
                : "px-3 h-fit"
              : size === "sm"
                ? "h-7 px-2"
                : "h-9 py-0 px-3",
            props.isDisabled ? "bg-subtle !cursor-not-allowed" : "cursor-pointer",
            "rounded-[10px]",
            timezoneClassNames?.control && timezoneClassNames.control(state)
          ),
        singleValue: (state) =>
          classNames(
            "text-emphasis placeholder:text-muted",
            timezoneClassNames?.singleValue && timezoneClassNames.singleValue(state)
          ),
        valueContainer: (state) =>
          classNames(
            "text-emphasis placeholder:text-muted flex gap-1",
            timezoneClassNames?.valueContainer && timezoneClassNames.valueContainer(state)
          ),
        multiValue: (state) =>
          classNames(
            "bg-subtle text-default rounded-md py-1.5 px-2 flex items-center text-sm leading-none",
            timezoneClassNames?.multiValue && timezoneClassNames.multiValue(state)
          ),
        menu: (state) =>
          classNames(
            "rounded-md bg-default text-sm leading-4 text-default mt-1 p-1 border border-subtle",
            state.selectProps.menuIsOpen && "shadow-dropdown", // Add box-shadow when menu is open
            timezoneClassNames?.menu && timezoneClassNames.menu(state)
          ),
        groupHeading: () => "leading-none text-xs uppercase text-default pl-2.5 pt-4 pb-2",
        menuList: (state) =>
          classNames(
            "scroll-bar scrollbar-track-w-20 rounded-md flex flex-col space-y-1",
            timezoneClassNames?.menuList && timezoneClassNames.menuList(state)
          ),
        indicatorsContainer: (state) =>
          classNames(
            state.selectProps.menuIsOpen
              ? state.isMulti
                ? "[&>*:last-child]:rotate-180 [&>*:last-child]:transition-transform"
                : "rotate-180 transition-transform"
              : "text-default", // Woo it adds another SVG here on multi for some reason
            timezoneClassNames?.indicatorsContainer && timezoneClassNames.indicatorsContainer(state)
          ),
        multiValueRemove: () => "text-default py-auto ml-2",
        noOptionsMessage: () => "h-12 py-2 flex items-center justify-center",
      }}
    />
  );
}

export type { ITimezone, ITimezoneOption };
