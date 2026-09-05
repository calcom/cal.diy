import React from "react";
import type { Control, FieldValues } from "react-hook-form";

import {
  ScheduleComponent,
  type FieldPathByValue,
  type ScheduleLabelsType,
} from "@calcom/features/schedules/components/ScheduleComponent";
import useMeQuery from "@calcom/trpc/react/hooks/useMeQuery";
import type { TimeRange } from "@calcom/types/schedule";

const Schedule = <
  TFieldValues extends FieldValues,
  TPath extends FieldPathByValue<TFieldValues, TimeRange[][]>,
>(props: {
  name: TPath;
  control: Control<TFieldValues>;
  weekStart?: number;
}) => {
  const query = useMeQuery();
  const { timeFormat } = query.data || { timeFormat: null };

  return <ScheduleComponent userTimeFormat={timeFormat} {...props} />;
};

export default Schedule;
