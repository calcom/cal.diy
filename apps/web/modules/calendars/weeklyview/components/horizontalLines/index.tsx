import { useId } from "react";

import type dayjs from "@calcom/dayjs";
import { useTimePreferences } from "@calcom/features/bookings/lib";
import classNames from "@calcom/ui/classNames";

import type { BorderColor } from "@calcom/features/calendars/weeklyview/types/common";

export const HorizontalLines = ({
  hours,
  containerOffsetRef,
  borderColor,
}: {
  hours: dayjs.Dayjs[];
  numberOfGridStopsPerCell: number;
  containerOffsetRef: React.RefObject<HTMLDivElement>;
  borderColor: BorderColor;
}) => {
  const { timeFormat } = useTimePreferences();
  // We need to force the minute to zero, because otherwise in ex GMT+5.5, it would show :30 minute times (but at the positino of :00)
  const finalHour = hours[hours.length - 1].add(1, "hour").minute(0).format(timeFormat);
  const id = useId();

  return (
    <div
      className={classNames(
        "pointer-events-none relative z-60 col-start-1 col-end-2 row-start-1 grid divide-y",
        borderColor === "subtle" ? "divide-subtle" : "divide-default"
      )}
      style={{
        gridTemplateRows: `repeat(${hours.length}, minmax(var(--gridDefaultSize), 1fr))`,
      }}>
      <div className="row-end-1 h-(--calendar-offset-top) " ref={containerOffsetRef} />
      {hours.map((hour) => (
        <div key={`${id}-${hour.get("hour")}`}>
          <div className="text-muted sticky left-0 z-20 -ml-14 -mt-2.5 w-14 pr-2 text-right text-xs leading-5 rtl:-mr-14">
            {/* We need to force the minute to zero, because otherwise in ex GMT+5.5, it would show :30 minute times (but at the positino of :00) */}
            {hour.minute(0).format(timeFormat)}
          </div>
        </div>
      ))}
      <div key={`${id}-${finalHour}`}>
        <div className="text-muted sticky left-0 z-20 -ml-14 -mt-2.5 w-14 pr-2 text-right text-xs leading-5 rtl:-mr-14">
          {finalHour}
        </div>
      </div>
    </div>
  );
};
