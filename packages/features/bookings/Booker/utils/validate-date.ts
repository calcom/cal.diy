import dayjs from "@calcom/dayjs";

export function getValidMonth(monthParam: string | null | undefined): string | null {
  if (!monthParam) return null;
  const parsed = dayjs(monthParam, "YYYY-MM", true);
  if (!parsed.isValid()) return null;

  const currentMonth = dayjs().startOf("month");
  if (parsed.isBefore(currentMonth)) {
    return currentMonth.format("YYYY-MM");
  }

  return parsed.format("YYYY-MM");
}

export function getValidDate(dateParam: string | null | undefined): string | null {
  if (!dateParam) return null;
  const parsed = dayjs(dateParam, "YYYY-MM-DD", true);
  if (!parsed.isValid()) return null;

  const today = dayjs().startOf("day");
  if (parsed.isBefore(today)) {
    // If the date is in the past, we should ignore the date selection.
    // The month will fall back to the current month because of getValidMonth.
    // Alternatively, we could return today.format("YYYY-MM-DD"). But returning null is probably safer
    // so no past date is selected.

    return null;
  }

  return parsed.format("YYYY-MM-DD");
}
