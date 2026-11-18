"use client";

import type { SetStateAction, Dispatch } from "react";
import React from "react";
import {
  useMemo,
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useRef,
  useCallback,
} from "react";
import { Controller, useFieldArray, useForm, useFormContext, useWatch } from "react-hook-form";

import dayjs from "@calcom/dayjs";
import { BookerStoreProvider } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import { Dialog } from "@calcom/features/components/controlled-dialog";
import { TimezoneSelect as WebTimezoneSelect } from "@calcom/web/modules/timezone/components/TimezoneSelect";
import type {
  BulkUpdatParams,
  EventTypes,
} from "@calcom/features/eventtypes/components/BulkEditDefaultForEventsModal";
import { BulkEditDefaultForEventsModal } from "@calcom/features/eventtypes/components/BulkEditDefaultForEventsModal";
import DateOverrideInputDialog from "@calcom/features/schedules/components/DateOverrideInputDialog";
import DateOverrideList from "@calcom/features/schedules/components/DateOverrideList";
import {
  ScheduleComponent as PlatformSchedule,
} from "@calcom/features/schedules/components/ScheduleComponent";
import WebSchedule from "@calcom/web/modules/schedules/components/Schedule";
import { availabilityAsString } from "@calcom/lib/availability";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { sortAvailabilityStrings } from "@calcom/lib/weekstart";
import type { TravelScheduleRepository } from "@calcom/features/travelSchedule/repositories/TravelScheduleRepository";
import type { TimeRange, WorkingHours } from "@calcom/types/schedule";
import classNames from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";
import { DialogTrigger, ConfirmationDialogContent } from "@calcom/ui/components/dialog";
import { VerticalDivider } from "@calcom/ui/components/divider";
import { EditableHeading } from "@calcom/ui/components/editable-heading";
import { Form } from "@calcom/ui/components/form";
import { Label } from "@calcom/ui/components/form";
import { Switch } from "@calcom/ui/components/form";
import { Icon } from "@calcom/ui/components/icon";
import { SkeletonText, SelectSkeletonLoader, Skeleton } from "@calcom/ui/components/skeleton";
import { Tooltip } from "@calcom/ui/components/tooltip";
import WebShell from "@calcom/web/modules/shell/Shell";

import { Shell as PlatformShell } from "../src/components/ui/shell";
import { cn } from "../src/lib/utils";
import { Timezone as PlatformTimzoneSelect } from "../timezone/index";
import type { AvailabilityFormValues, scheduleClassNames, AvailabilitySettingsFormRef } from "./types";

export type Schedule = {
  id: number;
  startTime: Date;
  endTime: Date;
  userId: number | null;
  eventTypeId: number | null;
  date: Date | null;
  scheduleId: number | null;
  days: number[];
};

export type CustomClassNames = {
  containerClassName?: string;
  ctaClassName?: string;
  editableHeadingClassName?: string;
  formClassName?: string;
  timezoneSelectClassName?: string;
  subtitlesClassName?: string;
  scheduleClassNames?: scheduleClassNames;
  overridesModalClassNames?: string;
  dateOverrideClassNames?: {
    container?: string;
    title?: string;
    description?: string;
    button?: string;
  };
  hiddenSwitchClassname?: {
    container?: string;
    thumb?: string;
  };
  deleteButtonClassname?: string;
};

export type Availability = Pick<Schedule, "days" | "startTime" | "endTime">;

export type AvailabilitySettingsScheduleType = {
  name: string;
  id: number;
  availability: TimeRange[][];
  isLastSchedule: boolean;
  isDefault: boolean;
  workingHours: WorkingHours[];
  dateOverrides: { ranges: TimeRange[] }[];
  timeZone: string;
  schedule: Availability[];
};

type AvailabilitySettingsProps = {
  skeletonLabel?: string;
  schedule: AvailabilitySettingsScheduleType;
  travelSchedules?: Awaited<ReturnType<typeof TravelScheduleRepository.findTravelSchedulesByUserId>>;
  handleDelete: () => void;
  allowDelete?: boolean;
  allowSetToDefault?: boolean;
  isDeleting: boolean;
  isSaving: boolean;
  isLoading: boolean;
  timeFormat: number | null;
  weekStart: string;
  backPath: string | boolean;
  handleSubmit: (data: AvailabilityFormValues) => Promise<"saved" | "skipped">;
  isPlatform?: boolean;
  customClassNames?: CustomClassNames;
  disableEditableHeading?: boolean;
  enableOverrides?: boolean;
  onFormStateChange?: (formState: AvailabilityFormValues) => void;
  bulkUpdateModalProps?: {
    isOpen: boolean;
    setIsOpen: Dispatch<SetStateAction<boolean>>;
    save: (params: BulkUpdatParams) => void;
    isSaving: boolean;
    eventTypes?: EventTypes;
    isEventTypesFetching?: boolean;
    handleBulkEditDialogToggle: () => void;
  };
  isDryRun?: boolean;
};

const DeleteDialogButton = ({
  disabled,
  buttonClassName,
  isPending,
  onDeleteConfirmed,
  handleDelete,
}: {
  disabled?: boolean;
  onDeleteConfirmed?: () => void;
  buttonClassName: string;
  handleDelete: () => void;
  isPending: boolean;
}) => {
  const { t } = useLocale();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          StartIcon="trash"
          variant="icon"
          color="destructive"
          aria-label={t("delete")}
          className={buttonClassName}
          disabled={disabled}
          tooltip={disabled ? t("requires_at_least_one_schedule") : t("delete")}
          tooltipSide="bottom"
        />
      </DialogTrigger>

      <ConfirmationDialogContent
        isPending={isPending}
        variety="danger"
        title={t("delete_schedule")}
        confirmBtnText={t("delete")}
        loadingText={t("delete")}
        onConfirm={() => {
          handleDelete();
          onDeleteConfirmed?.();
        }}>
        {t("delete_schedule_description")}
      </ConfirmationDialogContent>
    </Dialog>
  );
};

const useExcludedDates = () => {
  const watchValues = useWatch<AvailabilityFormValues>({ name: "dateOverrides" }) as {
    ranges: TimeRange[];
  }[];
  return useMemo(() => {
    return watchValues?.map((field) => dayjs(field.ranges[0].start).utc().format("YYYY-MM-DD"));
  }, [watchValues]);
};

const DateOverride = ({
  workingHours,
  userTimeFormat,
  travelSchedules,
  weekStart,
  overridesModalClassNames,
  classNames,
  handleSubmit,
  isDryRun = false,
}: {
  workingHours: WorkingHours[];
  userTimeFormat: number | null;
  travelSchedules?: Awaited<ReturnType<typeof TravelScheduleRepository.findTravelSchedulesByUserId>>;
  weekStart: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  overridesModalClassNames?: string;
  classNames?: {
    container?: string;
    title?: string;
    description?: string;
    button?: string;
  };
  handleSubmit: (data: AvailabilityFormValues) => Promise<"saved" | "skipped">;
  isDryRun?: boolean;
}) => {
  const { append, replace, fields } = useFieldArray<AvailabilityFormValues, "dateOverrides">({
    name: "dateOverrides",
  });
  const { getValues, reset } = useFormContext();
  const excludedDates = useExcludedDates();
  const { t } = useLocale();

  const handleAvailabilityUpdate = async () => {
    const updatedValues = getValues() as AvailabilityFormValues;
    if (!isDryRun) {
      try {
        const result = await handleSubmit(updatedValues);
        if (result === "saved") {
          reset(updatedValues);
        }
      } catch {
        // error already handled by mutation's onError callback
      }
    }
  };

  return (
    <div className={cn("p-6", classNames?.container)}>
      <h3 className={cn("text-emphasis font-medium leading-6", classNames?.title)}>
        {t("date_overrides")}{" "}
        <Tooltip content={t("date_overrides_info")}>
          <span className="inline-block align-middle">
            <Icon name="info" className="h-4 w-4" />
          </span>
        </Tooltip>
      </h3>
      <p className={cn("text-subtle mb-4 text-sm", classNames?.description)}>
        {t("date_overrides_subtitle")}
      </p>
      <div className="stack-y-2">
        <DateOverrideList
          excludedDates={excludedDates}
          replace={replace}
          fields={fields}
          weekStart={weekStart}
          workingHours={workingHours}
          userTimeFormat={userTimeFormat}
          hour12={Boolean(userTimeFormat === 12)}
          travelSchedules={travelSchedules}
          handleAvailabilityUpdate={handleAvailabilityUpdate}
          isDryRun={isDryRun}
        />
        <DateOverrideInputDialog
          className={overridesModalClassNames}
          workingHours={workingHours}
          excludedDates={excludedDates}
          onChange={(ranges) => {
            ranges.forEach((range) => append({ ranges: [range] }));
            handleAvailabilityUpdate();
          }}
          userTimeFormat={userTimeFormat}
          weekStart={weekStart}
          isDryRun={isDryRun}
          Trigger={
            <Button
              className={classNames?.button}
              color="secondary"
              StartIcon="plus"
              data-testid="add-override">
              {t("add_an_override")}
            </Button>
          }
        />
      </div>
    </div>
  );
};

// Simplify logic by assuming this will never be opened on a large screen
const SmallScreenSideBar = ({ open, children }: { open: boolean; children: JSX.Element }) => {
  return (
    <div
      className={classNames(
        open ? "fadeIn fixed inset-0 z-50 bg-neutral-800/70 transition-opacity sm:hidden" : ""
      )}>
      <div
        className={classNames(
          "bg-default stack-y-2 fixed right-0 z-20 flex h-screen w-80 flex-col overflow-x-hidden rounded-md px-2 pb-3 transition-transform",
          open ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
        )}>
        {open ? children : null}
      </div>
    </div>
  );
};

export const AvailabilitySettings = forwardRef<AvailabilitySettingsFormRef, AvailabilitySettingsProps>(
  function AvailabilitySettings(props, ref) {
    const {
      schedule,
      travelSchedules,
      handleDelete,
      isDeleting,
      isLoading,
      isSaving,
      timeFormat,
      weekStart,
      backPath,
      handleSubmit,
      isPlatform = false,
      customClassNames,
      disableEditableHeading = false,
      enableOverrides = false,
      onFormStateChange,
      bulkUpdateModalProps,
      allowSetToDefault = true,
      allowDelete = true,
      isDryRun,
    } = props;
    const [openSidebar, setOpenSidebar] = useState(false);
    const { t, i18n } = useLocale();

    const form = useForm<AvailabilityFormValues>({
      defaultValues: {
        name: schedule.name,
        timeZone: schedule.timeZone,
        isDefault: schedule.isDefault,
        dateOverrides: schedule.dateOverrides,
        schedule: schedule.availability || [],
      },
    });

    const watchedValues = useWatch({
      control: form.control,
    });

    const { isDirty } = form.formState;

    // Trigger callback whenever the form state changes
    useEffect(() => {
      if (onFormStateChange && watchedValues) {
        onFormStateChange(watchedValues as AvailabilityFormValues);
      }
    }, [watchedValues, onFormStateChange]);

    const [Shell, Schedule, TimezoneSelect] = useMemo(() => {
      return isPlatform
        ? [PlatformShell, PlatformSchedule, PlatformTimzoneSelect]
        : [WebShell, WebSchedule, WebTimezoneSelect];
    }, [isPlatform]);

    const saveButtonRef = useRef<HTMLButtonElement>(null);
    const callbacksRef = useRef<{ onSuccess?: () => void; onError?: (error: Error) => void }>({});

    const handleFormSubmit = useCallback(
      (customCallbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
        callbacksRef.current = customCallbacks || {};

        if (saveButtonRef.current && !saveButtonRef.current.disabled) {
          saveButtonRef.current.click();
        } else {
          form.handleSubmit(async (data) => {
            try {
              const result = await handleSubmit(data);
              if (result === "saved") {
                form.reset(data);
                callbacksRef.current?.onSuccess?.();
              }
            } catch (error) {
              callbacksRef.current?.onError?.(error as Error);
            } finally {
              callbacksRef.current = {};
            }
          })();
        }
      },
      [form, handleSubmit]
    );

    const validateForm = useCallback(async () => {
      const isValid = await form.trigger();
      return {
        isValid,
        errors: form.formState.errors,
      };
    }, [form]);

    useImperativeHandle(
      ref,
      () => ({
        validateForm,
        handleFormSubmit,
      }),
      [validateForm, handleFormSubmit]
    );

    return (
      <Shell
        headerClassName={cn(customClassNames?.containerClassName)}
        backPath={backPath}
        title={schedule.name ? `${schedule.name} | ${t("availability")}` : t("availability")}
        heading={
          <Controller
            control={form.control}
            name="name"
            render={({ field }) => (
              <EditableHeading
                className={cn(customClassNames?.editableHeadingClassName)}
                isReady={!isLoading}
                disabled={disableEditableHeading}
                {...field}
                data-testid="availability-title"
              />
            )}
          />
        }
        subtitle={
          schedule ? (
            schedule.schedule
              .filter((availability) => !!availability.days.length)
              .map((availability) =>
                availabilityAsString(availability, {
                  locale: i18n.language,
                  hour12: timeFormat === 12,
                })
              )
              // sort the availability strings as per user's weekstart (settings)
              .sort(sortAvailabilityStrings(i18n.language, weekStart))
              .map((availabilityString, index) => (
                <span key={index} className={cn(customClassNames?.subtitlesClassName)}>
                  {availabilityString}
                  <br />
                </span>
              ))
          ) : (
            <SkeletonText className="h-4 w-48" />
          )
        }
        CTA={
          <div className={cn(customClassNames?.ctaClassName, "flex items-center justify-end")}>
            <div className="sm:hover:bg-cal-muted hidden items-center rounded-md px-2 transition sm:flex">
              {!openSidebar && allowSetToDefault ? (
                <>
                  <Skeleton
                    as={Label}
                    htmlFor="hiddenSwitch"
                    className="pe-2 mt-2 cursor-pointer self-center"
                    loadingClassName="me-4"
                    waitForTranslation={!isPlatform}>
                    {t("set_to_default")}
                  </Skeleton>
                  <Controller
                    control={form.control}
                    name="isDefault"
                    render={({ field: { value, onChange } }) => (
                      <Switch
                        id="hiddenSwitch"
                        classNames={{
                          container: cn(customClassNames?.hiddenSwitchClassname?.container),
                          thumb: cn(customClassNames?.hiddenSwitchClassname?.thumb),
                        }}
                        disabled={isSaving || schedule.isDefault}
                        checked={value}
                        onCheckedChange={(checked) => {
                          onChange(checked);
                          bulkUpdateModalProps?.setIsOpen(checked);
                        }}
                      />
                    )}
                  />
                </>
              ) : null}
            </div>

            {bulkUpdateModalProps && bulkUpdateModalProps?.isOpen && (
              <BulkEditDefaultForEventsModal
                isPending={bulkUpdateModalProps?.isSaving}
                open={bulkUpdateModalProps?.isOpen}
                setOpen={bulkUpdateModalProps.setIsOpen}
                bulkUpdateFunction={bulkUpdateModalProps?.save}
                description={t("default_schedules_bulk_description")}
                eventTypes={bulkUpdateModalProps?.eventTypes}
                isEventTypesFetching={bulkUpdateModalProps?.isEventTypesFetching}
                handleBulkEditDialogToggle={bulkUpdateModalProps.handleBulkEditDialogToggle}
              />
            )}

            {allowDelete && (
              <>
                <VerticalDivider className="hidden sm:inline" />
                <DeleteDialogButton
                  buttonClassName={cn("hidden me-2 sm:inline", customClassNames?.deleteButtonClassname)}
                  disabled={schedule.isLastSchedule}
                  isPending={isDeleting}
                  handleDelete={handleDelete}
                />
                <VerticalDivider className="hidden sm:inline" />
              </>
            )}
            <SmallScreenSideBar open={openSidebar}>
              <>
                <div
                  className={classNames(
                    openSidebar
                      ? "fadeIn fixed inset-0 z-50 bg-neutral-800/70 transition-opacity sm:hidden"
                      : ""
                  )}>
                  <div
                    className={classNames(
                      "bg-default stack-y-2 fixed right-0 z-20 flex h-screen w-80 flex-col overflow-x-hidden rounded-md px-2 pb-3 transition-transform",
                      openSidebar ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
                    )}>
                    <div className="flex flex-row items-center pt-16">
                      <Button StartIcon="arrow-left" color="minimal" onClick={() => setOpenSidebar(false)} />
                      <p className="-ml-2">{t("availability_settings")}</p>
                      {allowDelete && (
                        <DeleteDialogButton
                          buttonClassName={cn("ml-16 inline", customClassNames?.deleteButtonClassname)}
                          disabled={schedule.isLastSchedule}
                          isPending={isDeleting}
                          handleDelete={handleDelete}
                          onDeleteConfirmed={() => {
                            setOpenSidebar(false);
                          }}
                        />
                      )}
                    </div>
                    <div className="flex flex-col px-2 py-2">
                      <Skeleton as={Label} waitForTranslation={!isPlatform}>
                        {t("name")}
                      </Skeleton>
                      <Controller
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <input
                            className="hover:border-emphasis dark:focus:border-emphasis border-default bg-default placeholder:text-muted text-emphasis focus:ring-brand-default disabled:bg-subtle disabled:hover:border-subtle focus:border-subtle mb-2 block h-9 w-full rounded-md border px-3 py-2 text-sm leading-4 focus:outline-none focus:ring-2 disabled:cursor-not-allowed"
                            {...field}
                          />
                        )}
                      />
                    </div>
                    <div className="flex h-9 flex-row-reverse items-center justify-end gap-3 px-2">
                      {allowSetToDefault && (
                        <>
                          <Skeleton
                            as={Label}
                            htmlFor="hiddenSwitch"
                            className="mt-2 cursor-pointer self-center pr-2 sm:inline"
                            waitForTranslation={!isPlatform}>
                            {t("set_to_default")}
                          </Skeleton>
                          <Controller
                            control={form.control}
                            name="isDefault"
                            render={({ field: { value, onChange } }) => (
                              <Switch
                                classNames={{
                                  container: cn(customClassNames?.hiddenSwitchClassname?.container),
                                  thumb: cn(customClassNames?.hiddenSwitchClassname?.thumb),
                                }}
                                id="hiddenSwitch"
                                disabled={isSaving || value}
                                checked={value}
                                onCheckedChange={onChange}
                              />
                            )}
                          />
                        </>
                      )}
                    </div>

                    <div className="min-w-40 stack-y-2 col-span-3 px-2 py-4 lg:col-span-1">
                      <div className="xl:max-w-80 w-full pr-4 sm:ml-0 sm:mr-36 sm:p-0">
                        <div>
                          <Skeleton
                            as={Label}
                            htmlFor="timeZone-sm-viewport"
                            className="mb-0 inline-block leading-none"
                            waitForTranslation={!isPlatform}>
                            {t("timezone")}
                          </Skeleton>
                          <Controller
                            control={form.control}
                            name="timeZone"
                            render={({ field: { onChange, value } }) =>
                              value ? (
                                <TimezoneSelect
                                  inputId="timeZone-sm-viewport"
                                  value={value}
                                  className={cn(
                                    "focus:border-brand-default border-default mt-1 block w-72 rounded-md text-sm",
                                    customClassNames?.timezoneSelectClassName
                                  )}
                                  onChange={(timezone) => onChange(timezone.value)}
                                />
                              ) : (
                                <SelectSkeletonLoader className="mt-1 w-72" />
                              )
                            }
                          />
                        </div>
                        {!isPlatform && (
                          <>
                            <hr className="border-subtle my-8" />
                            <div className="border-subtle rounded-md border p-4 md:block">
                              <Skeleton
                                as="h3"
                                className="mb-0 inline-block text-sm font-medium"
                                waitForTranslation={!isPlatform}>
                                {t("something_doesnt_look_right")}
                              </Skeleton>
                              <div className="mt-3 flex">
                                <Skeleton
                                  as={Button}
                                  href="/availability/troubleshoot"
                                  color="secondary"
                                  waitForTranslation={!isPlatform}>
                                  {t("launch_troubleshooter")}
                                </Skeleton>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            </SmallScreenSideBar>
            <div className="border-default border-l-2" />
            <Button
              ref={saveButtonRef}
              className="ml-4 lg:ml-0"
              type="submit"
              form="availability-form"
              loading={isSaving}
              disabled={isLoading || !isDirty}
            >
              {t("save")}
            </Button>
            <Button
              className="ml-3 sm:hidden"
              StartIcon="ellipsis-vertical"
              variant="icon"
              color="secondary"
              onClick={() => setOpenSidebar(true)}
            />
          </div>
        }>
        <div className="mt-4 w-full md:mt-0">
          <Form
            form={form}
            id="availability-form"
            handleSubmit={async (props) => {
              try {
                const result = await handleSubmit(props);
                if (result === "saved") {
                  form.reset(props);
                  callbacksRef.current?.onSuccess?.();
                }
              } catch (error) {
                callbacksRef.current?.onError?.(error as Error);
              } finally {
                callbacksRef.current = {};
              }
            }}
            className={cn(customClassNames?.formClassName, "flex flex-col sm:mx-0 xl:flex-row xl:space-x-6")}>
            <div className="flex-1">
              <div
                className={cn(
                  "border-subtle mb-6 rounded-md border",
                  customClassNames?.scheduleClassNames?.scheduleContainer
                )}>
                <div>
                  {typeof weekStart === "string" && (
                    <Schedule
                      labels={{
                        addTime: t("add_time_availability"),
                        copyTime: t("copy_times_to"),
                        deleteTime: t("delete"),
                      }}
                      classNames={
                        customClassNames?.scheduleClassNames ? { ...customClassNames.scheduleClassNames } : {}
                      }
                      control={form.control}
                      name="schedule"
                      userTimeFormat={timeFormat}
                      weekStart={
                        [
                          "Sunday",
                          "Monday",
                          "Tuesday",
                          "Wednesday",
                          "Thursday",
                          "Friday",
                          "Saturday",
                        ].indexOf(weekStart) as 0 | 1 | 2 | 3 | 4 | 5 | 6
                      }
                    />
                  )}
                </div>
              </div>
              {enableOverrides && (
                <div className="border-subtle rounded-md border mb-6">
                  <BookerStoreProvider>
                    <DateOverride
                      isDryRun={isDryRun}
                      workingHours={schedule.workingHours}
                      userTimeFormat={timeFormat}
                      handleSubmit={handleSubmit}
                      travelSchedules={travelSchedules}
                      weekStart={
                        [
                          "Sunday",
                          "Monday",
                          "Tuesday",
                          "Wednesday",
                          "Thursday",
                          "Friday",
                          "Saturday",
                        ].indexOf(weekStart) as 0 | 1 | 2 | 3 | 4 | 5 | 6
                      }
                      overridesModalClassNames={customClassNames?.overridesModalClassNames}
                      classNames={customClassNames?.dateOverrideClassNames}
                    />
                  </BookerStoreProvider>
                </div>
              )}
            </div>
            <div className="min-w-40 stack-y-2 col-span-3 hidden md:block lg:col-span-1">
              <div className="xl:max-w-80 w-full pr-4 sm:ml-0 sm:mr-36 sm:p-0">
                <div>
                  <Skeleton
                    as={Label}
                    htmlFor="timeZone-lg-viewport"
                    className="mb-0 inline-block leading-none"
                    waitForTranslation={!isPlatform}>
                    {t("timezone")}
                  </Skeleton>
                  <Controller
                    name="timeZone"
                    render={({ field: { onChange, value } }) =>
                      value ? (
                        <TimezoneSelect
                          inputId="timeZone-lg-viewport"
                          value={value}
                          className="focus:border-brand-default border-default mt-1 block w-72 rounded-md text-sm"
                          onChange={(timezone) => onChange(timezone.value)}
                        />
                      ) : (
                        <SelectSkeletonLoader className="mt-1 w-72" />
                      )
                    }
                  />
                </div>
                {isPlatform ? (
                  <></>
                ) : (
                  <>
                    <hr className="border-subtle my-8 mr-8" />
                    <div className="border-subtle rounded-md border p-4">
                      <Skeleton
                        as="h3"
                        className="mb-0 inline-block text-sm font-medium"
                        waitForTranslation={!isPlatform}>
                        {t("something_doesnt_look_right")}
                      </Skeleton>
                      <div className="mt-3 flex">
                        <Skeleton
                          as={Button}
                          href="/availability/troubleshoot"
                          color="secondary"
                          waitForTranslation={!isPlatform}>
                          {t("launch_troubleshooter")}
                        </Skeleton>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </Form>
        </div>
      </Shell>
    );
  }
);
