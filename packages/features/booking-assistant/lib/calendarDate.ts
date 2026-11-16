// Helpers for timezone-less YYYY-MM-DD calendar days. UTC arithmetic keeps them free of DST shifts.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const toUtcMs = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

export const addDays = (date: string, days: number) =>
  new Date(toUtcMs(date) + days * MS_PER_DAY).toISOString().slice(0, 10);

// 0 = Sunday, matching Date.prototype.getDay and the slot request schema.
export const weekdayOf = (date: string) => new Date(toUtcMs(date)).getUTCDay();
