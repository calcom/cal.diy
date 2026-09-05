import React from "react";

type Props = {
  offsetHeight: number | undefined;
  gridStopsPerDay: number;
  children: React.ReactNode;
};

export const SchedulerColumns = React.forwardRef<HTMLOListElement, Props>(function SchedulerColumns(
  { offsetHeight, gridStopsPerDay, children },
  ref
) {
  return (
    <ol
      ref={ref}
      className="scheduler-grid-row-template col-start-1 col-end-2 row-start-1 grid auto-cols-auto text-[0px] scheduler-wrapper"
      style={{ marginTop: offsetHeight || "var(--gridDefaultSize)" }}
      data-gridstopsperday={gridStopsPerDay}>
      {children}
    </ol>
  );
});
