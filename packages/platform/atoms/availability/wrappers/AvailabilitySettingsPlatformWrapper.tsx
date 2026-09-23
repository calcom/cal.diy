import type { ReactNode } from "react";
import { forwardRef } from "react";

import type { ScheduleLabelsType } from "@calcom/features/schedules/components/ScheduleComponent";
import type { UpdateScheduleResponse } from "@calcom/features/schedules/services/ScheduleService";
import type { ApiErrorResponse, ApiResponse, UpdateScheduleInput_2024_06_11 } from "@calcom/platform-types";

import { useAtomSchedule } from "../../hooks/schedules/useAtomSchedule";
import { useAtomUpdateSchedule } from "../../hooks/schedules/useAtomUpdateSchedule";
import useDeleteSchedule from "../../hooks/schedules/useDeleteSchedule";
import { useMe } from "../../hooks/useMe";
import { AtomsWrapper } from "../../src/components/atoms-wrapper";
import { useToast } from "../../src/components/ui/use-toast";
import type { Availability } from "../AvailabilitySettings";
import type { CustomClassNames } from "../AvailabilitySettings";
import { AvailabilitySettings } from "../AvailabilitySettings";
import type { AvailabilityFormValues, AvailabilitySettingsFormRef } from "../types";

export type AvailabilitySettingsPlatformWrapperProps = {
  id?: string;
  labels?: {
    tooltips: Partial<ScheduleLabelsType>;
  };
  customClassNames?: Partial<CustomClassNames>;
  onUpdateSuccess?: (res: ApiResponse<UpdateScheduleResponse>) => void;
  onUpdateError?: (err: ApiErrorResponse) => void;
  onDeleteSuccess?: (res: ApiResponse) => void;
  onDeleteError?: (err: ApiErrorResponse) => void;
  disableEditableHeading?: boolean;
  enableOverrides?: boolean;
  onBeforeUpdate?: (updateBody: UpdateScheduleInput_2024_06_11) => boolean | Promise<boolean>;
  onFormStateChange?: (formState: AvailabilityFormValues) => void;
  allowDelete?: boolean;
  allowSetToDefault?: boolean;
  disableToasts?: boolean;
  isDryRun?: boolean;
  noScheduleChildren?: ReactNode;
  loadingStateChildren?: ReactNode;
};

export const AvailabilitySettingsPlatformWrapper = forwardRef<
  AvailabilitySettingsFormRef,
  AvailabilitySettingsPlatformWrapperProps
>(function AvailabilitySettingsPlatformWrapper(props, ref) {
  const {
    id,
    customClassNames,
    onDeleteError,
    onDeleteSuccess,
    onUpdateError,
    onUpdateSuccess,
    disableEditableHeading = false,
    enableOverrides = false,
    onBeforeUpdate,
    onFormStateChange,
    allowDelete,
    allowSetToDefault,
    disableToasts,
    isDryRun = false,
    noScheduleChildren,
    loadingStateChildren,
  } = props;
  const { isLoading, data: atomSchedule } = useAtomSchedule(id);
  const { data: me } = useMe();
  const { timeFormat } = me?.data || { timeFormat: null };
  const { toast } = useToast();

  const { mutate: deleteSchedule, isPending: isDeletionInProgress } = useDeleteSchedule({
    onSuccess: (res) => {
      onDeleteSuccess?.(res);
      if (!disableToasts) {
        toast({
          description: "Schedule deleted successfully",
        });
      }
    },
    onError: (err) => {
      onDeleteError?.(err);
      if (!disableToasts) {
        toast({
          description: "Could not delete schedule",
        });
      }
    },
  });

  const { mutateAsync: updateSchedule, isPending: isSavingInProgress } = useAtomUpdateSchedule({
    onSuccess: (res) => {
      onUpdateSuccess?.(res);
      if (!disableToasts) {
        toast({
          description: "Schedule updated successfully",
        });
      }
    },
    onError: (err) => {
      onUpdateError?.(err);
      if (!disableToasts) {
        toast({
          description: "Could not update schedule",
        });
      }
    },
  });

  const handleDelete = async (id: number) => {
    await deleteSchedule({ id });
  };

  const handleUpdate = async (id: number, body: AvailabilityFormValues): Promise<"saved" | "skipped"> => {
    let canUpdate = true;

    if (onBeforeUpdate) {
      canUpdate = await onBeforeUpdate(body);
    }

    if (!canUpdate) {
      return "skipped";
    }

    await updateSchedule({
      scheduleId: id,
      body: {
        ...body,
        dateOverrides: body.dateOverrides.flatMap((override) => override.ranges),
      },
    });
    return "saved";
  };

  if (isLoading) {
    return (
      <>
        {loadingStateChildren ? loadingStateChildren : <div className="px-10 py-4 text-xl">Loading...</div>}
      </>
    );
  }

  if (!atomSchedule) {
    return noScheduleChildren ? (
      <>{noScheduleChildren}</>
    ) : (
      <div className="px-10 py-4 text-xl">No user schedule present</div>
    );
  }

  return (
    <AtomsWrapper>
      <AvailabilitySettings
        ref={ref}
        disableEditableHeading={disableEditableHeading}
        handleDelete={() => {
          if (isDryRun) {
            toast({
              description: "Schedule deleted successfully",
            });
          }

          if (!isDryRun && atomSchedule.id) {
            handleDelete(atomSchedule.id);
          }
        }}
        handleSubmit={async (data) => {
          if (isDryRun) {
            toast({
              description: "Schedule updated successfully",
            });
            return "saved";
          }

          if (!isDryRun && atomSchedule.id) {
            return await handleUpdate(atomSchedule.id, data);
          }
          return "skipped";
        }}
        weekStart={me?.data?.weekStart || "Sunday"}
        timeFormat={timeFormat}
        enableOverrides={enableOverrides}
        isLoading={isLoading}
        schedule={{
          name: atomSchedule.name,
          id: atomSchedule.id,
          isLastSchedule: atomSchedule.isLastSchedule,
          isDefault: atomSchedule.isDefault,
          workingHours: atomSchedule.workingHours,
          dateOverrides: atomSchedule.dateOverrides,
          timeZone: atomSchedule.timeZone,
          availability: atomSchedule.availability,
          schedule:
            atomSchedule.schedule.reduce(
              (acc: Availability[], avail: Availability) => [
                ...acc,
                { days: avail.days, startTime: new Date(avail.startTime), endTime: new Date(avail.endTime) },
              ],
              []
            ) || [],
        }}
        isDeleting={isDeletionInProgress}
        isSaving={isSavingInProgress}
        backPath=""
        isPlatform={true}
        customClassNames={customClassNames}
        allowDelete={allowDelete}
        allowSetToDefault={allowSetToDefault}
        onFormStateChange={onFormStateChange}
        isDryRun={isDryRun}
      />
    </AtomsWrapper>
  );
});
