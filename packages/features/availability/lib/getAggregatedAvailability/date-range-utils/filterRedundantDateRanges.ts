import type { DateRange } from "@calcom/features/schedules/lib/date-ranges";
import { ContainmentSearchAlgorithm, createIntervalNodes, IntervalTree } from "@calcom/lib/intervalTree";

/**
 * Filters out date ranges that are completely covered by other date ranges.
 * Uses an interval tree for O(n log n) worst-case complexity.
 * Unlike mergeOverlappingDateRanges, this doesn't merge overlapping ranges,
 * it only removes ranges that are completely contained within others.
 */
export function filterRedundantDateRanges(dateRanges: DateRange[]): DateRange[] {
  if (dateRanges.length <= 1) return dateRanges;

  const sortedRanges = [...dateRanges].sort((a, b) => a.start.valueOf() - b.start.valueOf());
  const intervalNodes = createIntervalNodes(
    sortedRanges,
    (range) => range.start.valueOf(),
    (range) => range.end.valueOf()
  );
  const intervalTree = new IntervalTree(intervalNodes);
  const searchAlgorithm = new ContainmentSearchAlgorithm(intervalTree);

  return sortedRanges.filter((range, index) => {
    if (range.end.valueOf() < range.start.valueOf()) {
      return true;
    }

    const containingIntervals = searchAlgorithm.findContainingIntervals(
      range.start.valueOf(),
      range.end.valueOf(),
      index
    );

    for (const containingNode of containingIntervals) {
      const otherRange = containingNode.item;
      const otherIndex = containingNode.index;

      const isIdentical =
        otherRange.start.valueOf() === range.start.valueOf() &&
        otherRange.end.valueOf() === range.end.valueOf();

      // Drop this range if strictly contained by another range,
      // or if an earlier identical range will be kept instead.
      if (!isIdentical || otherIndex < index) {
        return false;
      }
    }

    return true;
  });
}
