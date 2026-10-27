import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ArrayPath,
  Control,
  ControllerRenderProps,
  FieldArrayWithId,
  FieldPath,
  FieldPathValue,
  FieldValues,
  UseFieldArrayRemove,
} from "react-hook-form";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { createFilter, type GroupBase, type Props } from "react-select";

import type { scheduleClassNames } from "@calcom/atoms/availability/types";
import type { ConfigType } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import { defaultDayRange as DEFAULT_DAY_RANGE } from "@calcom/lib/availability";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { weekdayNames } from "@calcom/lib/weekday";
import type { TimeRange } from "@calcom/types/schedule";
import cn from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import { Dropdown, DropdownMenuContent, DropdownMenuTrigger } from "@calcom/ui/components/dropdown";
import { Select } from "@calcom/ui/components/form";
import { CheckboxField } from "@calcom/ui/components/form";
import { Switch } from "@calcom/ui/components/form";
import { SkeletonText } from "@calcom/ui/components/skeleton";

export type { TimeRange };

export type ScheduleLabelsType = {
  addTime: string;
  copyTime: string;
  deleteTime: string;
};

export type SelectInnerClassNames = {
  control?: string;
  singleValue?: string;
  valueContainer?: string;
  input?: string;
  menu?: string;
};

export type FieldPathByValue<TFieldValues extends FieldValues, TValue> = {
  [Key in FieldPath<TFieldValues>]: FieldPathValue<TFieldValues, Key> extends TValue ? Key : never;
}[FieldPath<TFieldValues>];

export const ScheduleDay = <TFieldValues extends FieldValues>({
  name,
  weekday,
  control,
  CopyButton,
  disabled,
  labels,
  userTimeFormat,
  classNames,
}: {
  name: ArrayPath<TFieldValues>;
  weekday: string;
  control: Control<TFieldValues>;
  CopyButton: JSX.Element;
  disabled?: boolean;
  labels?: ScheduleLabelsType;
  userTimeFormat: number | null;
  classNames?: scheduleClassNames;
}) => {
  const { watch, setValue } = useFormContext();
  const watchDayRange = watch(name);
  const lastNonEmptyDayRangeRef = useRef<TimeRange[] | null>(null);

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-4 last:mb-0 sm:flex-row sm:gap-6 sm:px-0",
        classNames?.scheduleDay
      )}
      data-testid={weekday}>
      {/* Label & switch container */}
      <div
        className={cn(
          "flex h-[36px] items-center justify-between sm:w-32",
          classNames?.labelAndSwitchContainer
        )}>
        <div>
          <label className="text-default flex flex-row items-center space-x-2 rtl:space-x-reverse">
            <div>
              <Switch
                disabled={!watchDayRange || disabled}
                defaultChecked={watchDayRange && watchDayRange.length > 0}
                checked={watchDayRange && !!watchDayRange.length}
                data-testid={`${weekday}-switch`}
                onCheckedChange={(isChecked) => {
                  if (isChecked) {
                    const previousDayRange = lastNonEmptyDayRangeRef.current;
                    const newValue = (
                      previousDayRange && previousDayRange.length > 0 ? previousDayRange : [DEFAULT_DAY_RANGE]
                    ) as TFieldValues[typeof name];

                    setValue(name, newValue);
                  } else {
                    if (watchDayRange && watchDayRange.length > 0) {
                      lastNonEmptyDayRangeRef.current = watchDayRange as unknown as TimeRange[];
                    }
                    setValue(name, [] as TFieldValues[typeof name]);
                  }
                }}
              />
            </div>
            <span className="inline-block min-w-[88px] text-sm capitalize">{weekday}</span>
          </label>
        </div>
      </div>
      <>
        {!watchDayRange && <SkeletonText className="ml-1 mt-2.5 h-6 w-48" />}
        {watchDayRange.length > 0 && (
          <div className="flex sm:gap-2">
            <DayRanges
              weekday={weekday}
              userTimeFormat={userTimeFormat}
              labels={labels}
              control={control}
              name={name}
              disabled={disabled}
              copyButton={!disabled ? CopyButton : undefined}
              classNames={{
                dayRanges: classNames?.dayRanges,
                timeRangeField: classNames?.timeRangeField,
                timePicker: classNames?.timePicker,
              }}
            />
          </div>
        )}
      </>
    </div>
  );
};

const CopyButton = ({
  getValuesFromDayRange,
  weekStart,
  labels,
  weekday,
}: {
  weekday?: string;
  getValuesFromDayRange: string;
  weekStart: number;
  labels?: ScheduleLabelsType;
}) => {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const fieldArrayName = getValuesFromDayRange.substring(0, getValuesFromDayRange.lastIndexOf("."));
  const { setValue, getValues } = useFormContext();
  return (
    <Dropdown open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn(
            "text-default",
            open && "ring-brand-500 !bg-subtle outline-none ring-2 ring-offset-1"
          )}
          data-testid="copy-button"
          type="button"
          tooltip={labels?.copyTime ?? t("copy_times_to_tooltip")}
          aria-label={
            labels?.copyTime
              ? (weekday ? `${labels.copyTime} for ${weekday}` : labels.copyTime)
              : (weekday ? t("copy_times_to_from_weekday", { weekday }) : t("copy_times_to_tooltip"))
          }
          color="minimal"
          variant="icon"
          StartIcon="copy"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <CopyTimes
          weekStart={weekStart}
          disabled={parseInt(getValuesFromDayRange.replace(`${fieldArrayName}.`, ""), 10)}
          onClick={(selected) => {
            selected.forEach((day) => setValue(`${fieldArrayName}.${day}`, getValues(getValuesFromDayRange)));
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      </DropdownMenuContent>
    </Dropdown>
  );
};

export const ScheduleComponent = <
  TFieldValues extends FieldValues,
  TPath extends FieldPathByValue<TFieldValues, TimeRange[][]>,
>({
  name,
  control,
  disabled,
  weekStart = 0,
  labels,
  userTimeFormat,
  classNames,
}: {
  name: TPath;
  control: Control<TFieldValues>;
  weekStart?: number;
  disabled?: boolean;
  labels?: ScheduleLabelsType;
  userTimeFormat: number | null;
  classNames?: Omit<scheduleClassNames, "scheduleContainer">;
}) => {
  const { i18n } = useLocale();

  return (
    <div className={cn("flex flex-col gap-4 p-2 sm:p-4", classNames?.schedule)}>
      {/* First iterate for each day */}
      {weekdayNames(i18n.language, weekStart, "long").map((weekday, num) => {
        const weekdayIndex = (num + weekStart) % 7;
        const dayRangeName = `${name}.${weekdayIndex}` as ArrayPath<TFieldValues>;
        return (
          <ScheduleDay
            classNames={classNames}
            userTimeFormat={userTimeFormat}
            labels={labels}
            disabled={disabled}
            name={dayRangeName}
            key={weekday}
            weekday={weekday}
            control={control}
            CopyButton={
              <CopyButton weekStart={weekStart} labels={labels} getValuesFromDayRange={dayRangeName} weekday={weekday} />
            }
          />
        );
      })}
    </div>
  );
};

export const DayRanges = <TFieldValues extends FieldValues>({
  name,
  disabled,
  control,
  labels,
  userTimeFormat,
  classNames,
  copyButton,
  weekday,
}: {
  weekday?: string;
  name: ArrayPath<TFieldValues>;
  control?: Control<TFieldValues>;
  disabled?: boolean;
  labels?: ScheduleLabelsType;
  userTimeFormat: number | null;
  classNames?: Pick<scheduleClassNames, "dayRanges" | "timeRangeField" | "timePicker">;
  copyButton?: React.ReactNode;
}) => {
  const { t } = useLocale();
  const { getValues } = useFormContext();

  const { remove, fields, prepend, append } = useFieldArray({
    control,
    name,
  });

  if (!fields.length) return null;

  return (
    <div className={cn("flex flex-col gap-2", classNames?.dayRanges)}>
      {fields.map((field, index: number) => (
        <Fragment key={field.id}>
          <div className="flex gap-1 last:mb-0 sm:gap-2">
            <Controller
              name={`${name}.${index}`}
              render={({ field }) => (
                <TimeRangeField
                  className={classNames?.timeRangeField}
                  userTimeFormat={userTimeFormat}
                  timePickerClassNames={classNames?.timePicker}
                  weekday={weekday}
                  {...field}
                />
              )}
            />
            {index === 0 && (
              <Button
                disabled={disabled}
                data-testid="add-time-availability"
                tooltip={labels?.addTime ?? t("add_time_availability")}
                aria-label={
                  weekday
                    ? `${labels?.addTime ?? t("add_time_availability")} for ${weekday}`
                    : labels?.addTime ?? t("add_time_availability")
                }
                className="text-default"
                type="button"
                color="minimal"
                variant="icon"
                StartIcon="plus"
                onClick={() => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const slotRange: any = getDateSlotRange(
                    getValues(`${name}.${fields.length - 1}`),
                    getValues(`${name}.0`)
                  );

                  if (slotRange?.append) {
                    append(slotRange.append);
                  }

                  if (slotRange?.prepend) {
                    prepend(slotRange.prepend);
                  }
                }}
              />
            )}
            {index === 0 && copyButton && <div className="block">{copyButton}</div>}
            {fields.length > 1 && (
              <RemoveTimeButton index={index} remove={remove} weekday={weekday} className="text-default border-none" />
            )}
          </div>
        </Fragment>
      ))}
    </div>
  );
};

const RemoveTimeButton = ({
  index,
  remove,
  disabled,
  className,
  labels,
  weekday,
}: {
  weekday?: string;
  index: number | number[];
  remove: UseFieldArrayRemove;
  className?: string;
  disabled?: boolean;
  labels?: ScheduleLabelsType;
}) => {
  const { t } = useLocale();
  return (
    <Button
      disabled={disabled}
      type="button"
      variant="icon"
      color="destructive"
      StartIcon="trash"
      onClick={() => remove(index)}
      className={className}
      tooltip={labels?.deleteTime ?? t("delete")}
      aria-label={
        weekday
          ? `${labels?.deleteTime ?? t("delete")} for ${weekday}`
          : labels?.deleteTime ?? t("delete")
      }
    />
  );
};

const TimeRangeField = ({
  className,
  value,
  onChange,
  disabled,
  userTimeFormat,
  timePickerClassNames,
  weekday,
}: {
  weekday?: string;
  className?: string;
  disabled?: boolean;
  userTimeFormat: number | null;
  timePickerClassNames?: {
    container?: string;
    value?: string;
    valueContainer?: string;
    input?: string;
    dropdown?: string;
  };
} & ControllerRenderProps) => {
  const { t } = useLocale();
  const innerClassNames: SelectInnerClassNames = {
    control: timePickerClassNames?.container,
    singleValue: timePickerClassNames?.value,
    valueContainer: timePickerClassNames?.valueContainer,
    input: timePickerClassNames?.input,
    menu: timePickerClassNames?.dropdown,
  };

  // this is a controlled component anyway given it uses LazySelect, so keep it RHF agnostic.
  return (
    <div className={cn("flex flex-row gap-2 sm:gap-3", className)}>
      <LazySelect
        userTimeFormat={userTimeFormat}
        className="block w-[90px] sm:w-[100px]"
        isDisabled={disabled}
        aria-label={weekday ? `${weekday} ${t("start_time")}` : t("start_time")}
        value={value.start}
        menuPlacement="bottom"
        innerClassNames={innerClassNames}
        onChange={(option) => {
          const newStart = new Date(option?.value as number);
          if (newStart >= new Date(value.end)) {
            const newEnd = new Date(option?.value as number);
            newEnd.setMinutes(newEnd.getMinutes() + INCREMENT);
            onChange({ ...value, start: newStart, end: newEnd });
          } else {
            onChange({ ...value, start: newStart });
          }
        }}
      />
      <span className="text-default w-2 self-center"> - </span>
      <LazySelect
        userTimeFormat={userTimeFormat}
        className="block w-[90px] rounded-md sm:w-[100px]"
        isDisabled={disabled}
        aria-label={weekday ? `${weekday} ${t("end_time")}` : t("end_time")}
        value={value.end}
        min={value.start}
        innerClassNames={innerClassNames}
        menuPlacement="bottom"
        onChange={(option) => {
          onChange({ ...value, end: new Date(option?.value as number) });
        }}
      />
    </div>
  );
};

export function parseTimeString(input: string, timeFormat: number | null): Date | null {
  if (!input.trim()) return null;

  const formats = timeFormat === 12 ? ["h:mma", "HH:mm"] : ["HH:mm", "h:mma"];
  const parsed = dayjs(input, formats, true); // strict parsing

  if (!parsed.isValid()) return null;

  const hours = parsed.hour();
  const minutes = parsed.minute();

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return new Date(new Date().setUTCHours(hours, minutes, 0, 0));
}

const LazySelect = ({
  value,
  min,
  max,
  userTimeFormat,
  menuPlacement,
  innerClassNames,
  onChange,
  ...props
}: Omit<Props<IOption, false, GroupBase<IOption>>, "value"> & {
  value: ConfigType;
  min?: ConfigType;
  max?: ConfigType;
  userTimeFormat: number | null;
  innerClassNames?: SelectInnerClassNames;
}) => {
  // Lazy-loaded options, otherwise adding a field has a noticeable redraw delay.
  const { options, filter } = useOptions(userTimeFormat);

  useEffect(() => {
    filter({ current: value });
  }, [filter, value]);

  const [inputValue, setInputValue] = React.useState("");
  const [timeInputError, setTimeInputError] = React.useState(false);
  const defaultFilter = React.useMemo(() => createFilter(), []);

  const handleInputChange = React.useCallback(
    (newValue: string, actionMeta: { action: string }) => {
      setInputValue(newValue);

      if (actionMeta.action === "input-change" && newValue.trim()) {
        const trimmedValue = newValue.trim();

        const formats = userTimeFormat === 12 ? ["h:mma", "HH:mm"] : ["HH:mm", "h:mma"];
        const parsedTime = dayjs(trimmedValue, formats, true);
        const looksLikeTime = /^\d{1,2}:\d{2}(a|p|am|pm)?$/i.test(trimmedValue);

        if (looksLikeTime && !parsedTime.isValid()) {
          setTimeInputError(true);
        } else if (parsedTime.isValid()) {
          const parsedDate = parseTimeString(trimmedValue, userTimeFormat);
          if (parsedDate) {
            const parsedDayjs = dayjs(parsedDate);
            const violatesMin = min ? !parsedDayjs.isAfter(min) : false;
            const violatesMax = max ? !parsedDayjs.isBefore(max) : false;
            setTimeInputError(Boolean(violatesMin || violatesMax));
          } else {
            setTimeInputError(false);
          }
        } else {
          setTimeInputError(false);
        }
      } else {
        setTimeInputError(false);
      }
    },
    [userTimeFormat, min, max]
  );

  const filteredOptions = React.useMemo(() => {
    const dropdownOptions = options.filter((option) =>
      defaultFilter({ ...option, data: option.label, value: option.label }, inputValue)
    );

    const trimmedInput = inputValue.trim();
    if (trimmedInput) {
      const parsedTime = parseTimeString(trimmedInput, userTimeFormat);

      if (parsedTime) {
        const parsedDayjs = dayjs(parsedTime);
        // Validate against min/max bounds using same logic as filter function
        const withinBounds = (!min || parsedDayjs.isAfter(min)) && (!max || parsedDayjs.isBefore(max));

        if (withinBounds) {
          const parsedTimestamp = parsedTime.valueOf();
          const existsInOptions = options.some((option) => option.value === parsedTimestamp);

          if (!existsInOptions) {
            const manualOption: IOption = {
              label: dayjs(parsedTime)
                .utc()
                .format(userTimeFormat === 12 ? "h:mma" : "HH:mm"),
              value: parsedTimestamp,
            };
            return [manualOption, ...dropdownOptions];
          }
        }
      }
    }

    return dropdownOptions;
  }, [inputValue, options, defaultFilter, userTimeFormat, min, max]);

  const currentValue = dayjs(value).toDate().valueOf();
  const currentOption =
    options.find((option) => option.value === currentValue) ||
    (value
      ? {
          value: currentValue,
          label: dayjs(value)
            .utc()
            .format(userTimeFormat === 12 ? "h:mma" : "HH:mm"),
        }
      : null);

  const errorInnerClassNames: SelectInnerClassNames = {
    ...innerClassNames,
    control: cn(innerClassNames?.control, timeInputError && "!border-error"),
  };

  return (
    <Select
      options={filteredOptions}
      onMenuOpen={() => {
        if (min) filter({ offset: min });
        if (max) filter({ limit: max });
        if (!min && !max) filter({ offset: 0, limit: 0 });
      }}
      menuPlacement={menuPlacement}
      value={currentOption}
      onMenuClose={() => filter({ current: value })}
      components={{
        DropdownIndicator: () => null,
        IndicatorSeparator: () => null,
      }}
      onInputChange={handleInputChange}
      filterOption={() => true}
      innerClassNames={errorInnerClassNames}
      onChange={onChange}
      {...props}
    />
  );
};

interface IOption {
  readonly label: string;
  readonly value: number;
}

/**
 * Creates an array of times on a 15 minute interval from
 * 00:00:00 (Start of day) to
 * 23:45:00 (End of day with enough time for 15 min booking)
 */
/** Begin Time Increments For Select */
const INCREMENT = Number(process.env.NEXT_PUBLIC_AVAILABILITY_SCHEDULE_INTERVAL) || 15;
const useOptions = (timeFormat: number | null) => {
  const [filteredOptions, setFilteredOptions] = useState<IOption[]>([]);

  const options = useMemo(() => {
    const end = dayjs().utc().endOf("day");
    const options: IOption[] = [];
    for (
      let t = dayjs().utc().startOf("day");
      t.isBefore(end);
      t = t.add(INCREMENT + (!t.add(INCREMENT).isSame(t, "day") ? -1 : 0), "minutes")
    ) {
      options.push({
        value: t.toDate().valueOf(),
        label: dayjs(t)
          .utc()
          .format(timeFormat === 12 ? "h:mma" : "HH:mm"),
      });
    }
    // allow 23:59
    options.push({
      value: end.toDate().valueOf(),
      label: dayjs(end)
        .utc()
        .format(timeFormat === 12 ? "h:mma" : "HH:mm"),
    });
    return options;
  }, [timeFormat]);

  const filter = useCallback(
    ({ offset, limit, current }: { offset?: ConfigType; limit?: ConfigType; current?: ConfigType }) => {
      if (current) {
        const currentValue = dayjs(current).toDate().valueOf();
        const currentOption = options.find((option) => option.value === currentValue);
        if (currentOption) {
          setFilteredOptions([currentOption]);
        } else {
          // Create temporary option for custom time not in predefined options
          const customOption: IOption = {
            value: currentValue,
            label: dayjs(current)
              .utc()
              .format(timeFormat === 12 ? "h:mma" : "HH:mm"),
          };
          setFilteredOptions([customOption]);
        }
      } else
        setFilteredOptions(
          options.filter((option) => {
            const time = dayjs(option.value);
            return (!limit || time.isBefore(limit)) && (!offset || time.isAfter(offset));
          })
        );
    },
    [options, timeFormat]
  );

  return { options: filteredOptions, filter };
};

const getDateSlotRange = (endField?: FieldArrayWithId, startField?: FieldArrayWithId) => {
  const timezoneStartRange = dayjs((startField as unknown as TimeRange).start).utc();
  const nextRangeStart = dayjs((endField as unknown as TimeRange).end).utc();
  const nextRangeEnd =
    nextRangeStart.hour() === 23
      ? dayjs(nextRangeStart).add(59, "minutes").add(59, "seconds").add(999, "milliseconds")
      : dayjs(nextRangeStart).add(1, "hour");

  const endOfDay = nextRangeStart.endOf("day");

  if (!nextRangeStart.isSame(endOfDay)) {
    return {
      append: {
        start: nextRangeStart.toDate(),
        end: nextRangeEnd.isAfter(endOfDay) ? endOfDay.toDate() : nextRangeEnd.toDate(),
      },
    };
  }

  const previousRangeStart = dayjs((startField as unknown as TimeRange).start).subtract(1, "hour");
  const startOfDay = timezoneStartRange.startOf("day");

  if (!timezoneStartRange.isSame(startOfDay)) {
    return {
      prepend: {
        start: previousRangeStart.isBefore(startOfDay) ? startOfDay.toDate() : previousRangeStart.toDate(),
        end: timezoneStartRange.toDate(),
      },
    };
  }
};

const CopyTimes = ({
  disabled,
  onClick,
  onCancel,
  weekStart,
}: {
  disabled: number;
  onClick: (selected: number[]) => void;
  onCancel: () => void;
  weekStart: number;
}) => {
  const [selected, setSelected] = useState<number[]>([]);
  const { i18n, t } = useLocale();
  const itteratablesByKeyRef = useRef<(HTMLInputElement | HTMLButtonElement)[]>([]);
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
  const handleKeyDown = (event: KeyboardEvent) => {
    const itteratables = itteratablesByKeyRef.current;
    const isActionRequired =
      event.key === "Tab" || event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Enter";
    if (!isActionRequired || !itteratables.length) return;
    event.preventDefault();
    const currentFocused = document.activeElement as HTMLInputElement | HTMLButtonElement;
    let currentIndex = itteratables.findIndex((checkbox) => checkbox === currentFocused);
    if (event.key === "Enter") {
      if (currentIndex === -1) return;
      currentFocused.click();
      return;
    }
    if (currentIndex === -1) {
      itteratables[0].focus();
    } else {
      // Move focus based on the arrow key pressed
      if (event.key === "ArrowUp") {
        currentIndex = (currentIndex - 1 + itteratables.length) % itteratables.length;
      } else if (event.key === "ArrowDown" || event.key === "Tab") {
        currentIndex = (currentIndex + 1) % itteratables.length;
      }
      itteratables[currentIndex].focus();
    }
  };

  return (
    <div className="stack-y-2 py-2">
      <div className="p-2">
        <p className="h6 text-emphasis pb-3 pl-1 text-xs font-medium uppercase">{t("copy_times_to")}</p>
        <ol className="stack-y-2">
          <li key="select all">
            <CheckboxField
              description={t("select_all")}
              descriptionAsLabel
              value={t("select_all")}
              checked={selected.length === 7}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelected([0, 1, 2, 3, 4, 5, 6]);
                } else if (!e.target.checked) {
                  setSelected([]);
                }
              }}
              ref={(ref) => {
                if (ref) {
                  itteratablesByKeyRef.current.push(ref as HTMLInputElement);
                }
              }}
            />
          </li>
          {weekdayNames(i18n.language, weekStart).map((weekday, num) => {
            const weekdayIndex = (num + weekStart) % 7;
            return (
              <li key={weekday}>
                <CheckboxField
                  description={weekday}
                  descriptionAsLabel
                  value={weekdayIndex}
                  checked={selected.includes(weekdayIndex) || disabled === weekdayIndex}
                  disabled={disabled === weekdayIndex}
                  onChange={(e) => {
                    if (e.target.checked && !selected.includes(weekdayIndex)) {
                      setSelected(selected.concat([weekdayIndex]));
                    } else if (!e.target.checked && selected.includes(weekdayIndex)) {
                      setSelected(selected.filter((item) => item !== weekdayIndex));
                    }
                  }}
                  ref={(ref) => {
                    if (ref && disabled !== weekdayIndex) {
                      itteratablesByKeyRef.current.push(ref as HTMLInputElement);
                    }
                  }}
                />
              </li>
            );
          })}
        </ol>
      </div>
      <hr className="border-subtle" />
      <div className="flex justify-end space-x-2 px-2 rtl:space-x-reverse">
        <Button
          color="minimal"
          onClick={() => onCancel()}
          ref={(ref) => {
            if (ref) {
              itteratablesByKeyRef.current.push(ref as HTMLButtonElement);
            }
          }}>
          {t("cancel")}
        </Button>
        <Button
          color="primary"
          onClick={() => onClick(selected)}
          ref={(ref) => {
            if (ref) {
              itteratablesByKeyRef.current.push(ref as HTMLButtonElement);
            }
          }}>
          {t("apply")}
        </Button>
      </div>
    </div>
  );
};
