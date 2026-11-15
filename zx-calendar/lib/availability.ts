import { MINUTE } from "./dates.ts";

export interface Interval {
  start: number;
  end: number;
}

export const BOOKING_DURATIONS = [15, 30, 45, 60] as const;
export const SLOT_STEP_MINUTES = 15;
/** Nobody should be able to book a call that starts in the next few minutes. */
export const MIN_NOTICE_MINUTES = 30;

/** Sorts and merges touching/overlapping intervals. O(n log n). */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last && current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/** Removes `busy` from `free`. Both inputs may be unsorted; output is sorted. Two-pointer, O(n log n). */
export function subtractIntervals(free: Interval[], busy: Interval[]): Interval[] {
  const freeMerged = mergeIntervals(free);
  const busyMerged = mergeIntervals(busy);
  const result: Interval[] = [];
  let b = 0;
  for (const window of freeMerged) {
    let cursor = window.start;
    while (b < busyMerged.length && busyMerged[b].end <= cursor) b++;
    let k = b;
    while (k < busyMerged.length && busyMerged[k].start < window.end) {
      const busyItem = busyMerged[k];
      if (busyItem.start > cursor) result.push({ start: cursor, end: busyItem.start });
      cursor = Math.max(cursor, busyItem.end);
      if (busyItem.end > window.end) break;
      k++;
    }
    if (cursor < window.end) result.push({ start: cursor, end: window.end });
  }
  return result;
}

/** Open windows the team can book, trimmed to `notBefore`. */
export function openWindows(free: Interval[], booked: Interval[], notBefore: number): Interval[] {
  return subtractIntervals(free, booked)
    .map((w) => ({ start: Math.max(w.start, notBefore), end: w.end }))
    .filter((w) => w.end > w.start);
}

/** Start times (ms) inside `window` for a meeting of `durationMin`, aligned to the slot step. */
export function slotStarts(window: Interval, durationMin: number, step = SLOT_STEP_MINUTES): number[] {
  const stepMs = step * MINUTE;
  const first = Math.ceil(window.start / stepMs) * stepMs;
  const starts: number[] = [];
  for (let t = first; t + durationMin * MINUTE <= window.end; t += stepMs) starts.push(t);
  return starts;
}

/** True when [start, end) fits entirely inside one open window. */
export function isBookable(
  start: number,
  end: number,
  free: Interval[],
  booked: Interval[],
  notBefore: number
): boolean {
  if (end <= start) return false;
  return openWindows(free, booked, notBefore).some((w) => start >= w.start && end <= w.end);
}
