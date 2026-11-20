import { revalidateAvailabilityList } from "app/(use-page-wrapper)/(main-nav)/availability/actions";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";

import { Dialog } from "@calcom/features/components/controlled-dialog";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { HttpError } from "@calcom/lib/http-error";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { DialogContent, DialogFooter, DialogTrigger, DialogClose } from "@calcom/ui/components/dialog";
import { Form, SelectField } from "@calcom/ui/components/form";
import { InputField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";

type SchedulePreset = "custom" | "morning" | "evening";

// Mon-Fri time ranges as UTC Date objects (minutes since midnight mapped to today's UTC date)
function buildWeekdayRanges(startHour: number, endHour: number) {
  const weekdays = Array(5).fill([
    {
      start: new Date(new Date().setUTCHours(startHour, 0, 0, 0)),
      end: new Date(new Date().setUTCHours(endHour, 0, 0, 0)),
    },
  ]);
  // [Sunday, Mon, Tue, Wed, Thu, Fri, Saturday]
  return [[], ...weekdays, []];
}

const SCHEDULE_PRESETS: Record<
  SchedulePreset,
  { label: string; schedule: { start: Date; end: Date }[][] | undefined }
> = {
  custom: { label: "custom_hours", schedule: undefined },
  morning: { label: "morning_hours", schedule: buildWeekdayRanges(6, 12) },
  evening: { label: "evening_hours", schedule: buildWeekdayRanges(17, 22) },
};

export function NewScheduleButton({
  name = "new-schedule",
  fromEventType,
}: {
  name?: string;
  fromEventType?: boolean;
}) {
  const router = useRouter();
  const { t } = useLocale();

  const form = useForm<{
    name: string;
    preset: SchedulePreset;
  }>({
    defaultValues: { preset: "custom" },
  });
  const { register } = form;
  const utils = trpc.useUtils();

  const createMutation = trpc.viewer.availability.schedule.create.useMutation({
    onSuccess: async ({ schedule }) => {
      await router.push(`/availability/${schedule.id}${fromEventType ? "?fromEventType=true" : ""}`);
      showToast(t("schedule_created_successfully", { scheduleName: schedule.name }), "success");
      revalidateAvailabilityList();
      utils.viewer.availability.list.setData(undefined, (data) => {
        const newSchedule = { ...schedule, isDefault: false, availability: [] };
        if (!data)
          return {
            schedules: [newSchedule],
          };
        return {
          ...data,
          schedules: [...data.schedules, newSchedule],
        };
      });
    },
    onError: (err) => {
      if (err instanceof HttpError) {
        const message = `${err.statusCode}: ${err.message}`;
        showToast(message, "error");
      }

      if (err.data?.code === "UNAUTHORIZED") {
        const message = `${err.data.code}: ${t("error_schedule_unauthorized_create")}`;
        showToast(message, "error");
      }
    },
  });

  return (
    <Dialog name={name} clearQueryParamsOnClose={["copy-schedule-id"]}>
      <DialogTrigger asChild>
        <Button variant="fab" data-testid={name} StartIcon="plus" size="sm">
          {t("new")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("add_new_schedule")}>
        <Form
          form={form}
          handleSubmit={(values) => {
            const { preset, ...rest } = values;
            createMutation.mutate({
              ...rest,
              schedule: SCHEDULE_PRESETS[preset]?.schedule,
            });
          }}>
          <InputField
            label={t("name")}
            type="text"
            id="name"
            required
            placeholder={t("default_schedule_name")}
            {...register("name", {
              setValueAs: (v) => (!v || v.trim() === "" ? null : v),
            })}
          />
          <Controller
            name="preset"
            control={form.control}
            render={({ field }) => (
              <SelectField
                label={t("starting_hours")}
                options={(["custom", "morning", "evening"] as SchedulePreset[]).map((key) => ({
                  value: key,
                  label: t(SCHEDULE_PRESETS[key].label),
                }))}
                value={{ value: field.value, label: t(SCHEDULE_PRESETS[field.value]?.label ?? "custom_hours") }}
                onChange={(opt) => field.onChange(opt?.value ?? "custom")}
              />
            )}
          />
          <DialogFooter>
            <DialogClose />
            <Button type="submit" loading={createMutation.isPending}>
              {t("continue")}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
