import dayjs from "@calcom/dayjs";

const MONTH_FORMAT = "YYYY-MM";
const DATE_FORMAT = "YYYY-MM-DD";

type BookerQueryParams = {
  month: string;
  date: string | null;
};

const parseStrict = (value: string | null | undefined, format: string): ReturnType<typeof dayjs> | null => {
  if (!value) return null;

  const parsed = dayjs(value, format, true);
  if (!parsed.isValid()) return null;
  return parsed;
};

export const normalizeBookerQueryParams = ({
  month,
  date,
}: {
  month?: string | null;
  date?: string | null;
}): BookerQueryParams => {
  const validDate = parseStrict(date, DATE_FORMAT);
  const validMonth = parseStrict(month, MONTH_FORMAT);
  const today = dayjs();
  let nonPastDate = validDate;
  let nonPastMonth = validMonth;
  if (nonPastDate?.isBefore(today, "day")) nonPastDate = null;
  if (nonPastMonth?.isBefore(today, "month")) nonPastMonth = null;

  return {
    date: nonPastDate?.format(DATE_FORMAT) ?? null,
    month:
      nonPastMonth?.format(MONTH_FORMAT) ??
      nonPastDate?.format(MONTH_FORMAT) ??
      today.format(MONTH_FORMAT),
  };
};
