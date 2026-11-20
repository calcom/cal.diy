import dayjs from "@calcom/dayjs";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import * as Popover from "@radix-ui/react-popover";
import { format } from "date-fns";
import { Button } from "../../button/Button";
import { Calendar } from "../date-range-picker/Calendar";

type Props = {
  date: Date;
  onDatesChange?: ((date: Date) => void) | undefined;
  className?: string;
  disabled?: boolean;
  minDate?: Date | null;
  maxDate?: Date | null;
  label?: string;
  /**
   * Adds month and year selects to the caption, for dates far from today such as a date of birth.
   * react-day-picker only renders them when both minDate and maxDate are set.
   */
  withMonthYearSelect?: boolean;
};

// The selects replace the caption label; the label left inside each select is only the
// react-day-picker overlay of its unstyled mode, hence hidden.
const MONTH_YEAR_SELECT_CLASS_NAMES = {
  caption_dropdowns: "flex items-center gap-2 px-2",
  dropdown: "bg-default text-emphasis border-default rounded-md border px-2 py-1 text-sm font-medium",
  caption_label: "hidden",
  vhidden: "sr-only",
};

const DatePicker = ({
  minDate,
  maxDate,
  disabled,
  date,
  onDatesChange,
  className,
  label,
  withMonthYearSelect,
}: Props) => {
  const { t } = useLocale();
  function handleDayClick(newDate: Date) {
    onDatesChange?.(newDate ?? new Date());
  }
  const fromDate = minDate ?? new Date();
  const monthYearSelect = withMonthYearSelect && !!minDate && !!maxDate;
  const calendar = (
    <Calendar
      initialFocus
      fromDate={minDate === null ? undefined : fromDate}
      toDate={maxDate ?? undefined}
      {...(monthYearSelect && {
        captionLayout: "dropdown-buttons" as const,
        classNames: MONTH_YEAR_SELECT_CLASS_NAMES,
        formatters: { formatMonthCaption: (month: Date) => dayjs(month).format("MMMM") },
        labels: { labelMonthDropdown: () => t("month"), labelYearDropdown: () => t("year") },
      })}
      mode="single"
      defaultMonth={date}
      selected={date}
      onDayClick={(day) => handleDayClick(day)}
      numberOfMonths={1}
      disabled={disabled}
    />
  );

  return (
    <div className={classNames("grid gap-2", className)}>
      {/* modal prop required for iOS compatibility when nested inside Dialog modals */}
      <Popover.Root modal>
        <Popover.Trigger asChild>
          <Button
            data-testid="pick-date"
            color="secondary"
            EndIcon="calendar"
            className={classNames("justify-between text-left font-normal", !date && "text-subtle")}>
            {label ?? (date ? <>{format(date, "LLL dd, y")}</> : <span>Pick a date</span>)}
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="bg-default text-emphasis z-50 w-auto rounded-md border p-0 outline-none"
            align="start"
            sideOffset={4}>
            {calendar}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
};

export default DatePicker;
