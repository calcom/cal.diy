import dayjs from "@calcom/dayjs";

const MONTH_FORMAT = "YYYY-MM";
const DATE_FORMAT = "YYYY-MM-DD";

const parseMonth = (month: string | null | undefined) => {
  if (!month) return null;
  return dayjs(month, MONTH_FORMAT, true);
};

export const getValidMonth = (monthParam: string | null | undefined): string | null => {
  const month = parseMonth(monthParam);
  if (!month?.isValid()) return null;

  const currentMonth = dayjs().startOf("month");
  if (month.isBefore(currentMonth)) return currentMonth.format(MONTH_FORMAT);

  return month.format(MONTH_FORMAT);
};

export const getValidDate = (dateParam: string | null | undefined): string | null => {
  if (!dateParam) return null;

  const date = dayjs(dateParam, DATE_FORMAT, true);
  if (!date.isValid() || date.isBefore(dayjs().startOf("day"))) return null;

  return date.format(DATE_FORMAT);
};

export const getInitialBookerDateState = (
  monthParam: string | null | undefined,
  dateParam: string | null | undefined
): { month: string; selectedDate: string | null } => {
  const monthParamValue = parseMonth(monthParam);
  const currentMonth = dayjs().startOf("month");
  const selectedDate = getValidDate(dateParam);

  let month = currentMonth.format(MONTH_FORMAT);
  if (selectedDate) month = dayjs(selectedDate).format(MONTH_FORMAT);
  if (monthParamValue?.isValid() && !monthParamValue.isBefore(currentMonth)) {
    month = monthParamValue.format(MONTH_FORMAT);
  }

  return { month, selectedDate };
};
