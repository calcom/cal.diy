import type { DateRange } from "@calcom/features/schedules/lib/date-ranges";
import { intersect } from "@calcom/features/schedules/lib/date-ranges";
import { DEFAULT_GROUP_ID } from "@calcom/lib/constants";
import { SchedulingType } from "@calcom/prisma/enums";

import { filterRedundantDateRanges } from "./date-range-utils/filterRedundantDateRanges";
import { mergeOverlappingDateRanges } from "./date-range-utils/mergeOverlappingDateRanges";

function uniqueAndSortedDateRanges(ranges: DateRange[]): DateRange[] {
  const seen = new Set<string>();

  return ranges
    .sort((a, b) => {
      const startDiff = a.start.valueOf() - b.start.valueOf();
      return startDiff !== 0 ? startDiff : a.end.valueOf() - b.end.valueOf();
    })
    .filter((range) => {
      const key = `${range.start.valueOf()}-${range.end.valueOf()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export const getAggregatedAvailability = (
  userAvailability: {
    dateRanges: DateRange[];
    oooExcludedDateRanges: DateRange[];
    user?: { isFixed?: boolean; groupId?: string | null };
  }[],
  schedulingType: SchedulingType | null
): DateRange[] => {
  const isTeamEvent =
    schedulingType === SchedulingType.COLLECTIVE ||
    schedulingType === SchedulingType.ROUND_ROBIN ||
    userAvailability.length > 1;

  const fixedHosts = userAvailability.filter(
    ({ user }) => !schedulingType || schedulingType === SchedulingType.COLLECTIVE || user?.isFixed
  );

  const fixedDateRanges = mergeOverlappingDateRanges(
    intersect(fixedHosts.map((s) => (!isTeamEvent ? s.dateRanges : s.oooExcludedDateRanges)))
  );
  // Empty fixed ranges mean the fixed hosts are busy, so no slot is free; checking the ranges would drop the constraint
  const dateRangesToIntersect = fixedHosts.length ? [fixedDateRanges] : [];
  const roundRobinHosts = userAvailability.filter(({ user }) => user?.isFixed !== true);
  if (roundRobinHosts.length) {
    // Group round robin hosts by their groupId
    const hostsByGroup = roundRobinHosts.reduce(
      (groups, host) => {
        const groupId = host.user?.groupId || DEFAULT_GROUP_ID;
        if (!groups[groupId]) {
          groups[groupId] = [];
        }
        groups[groupId].push(host);
        return groups;
      },
      {} as Record<string, typeof roundRobinHosts>
    );

    // at least one host from each group needs to be available
    Object.values(hostsByGroup).forEach((groupHosts) => {
      if (groupHosts.length > 0) {
        const groupDateRanges = groupHosts.flatMap((s) =>
          !isTeamEvent ? s.dateRanges : s.oooExcludedDateRanges
        );
        dateRangesToIntersect.push(groupDateRanges ?? []);
      }
    });
  }

  const availability = intersect(dateRangesToIntersect);

  const uniqueRanges = uniqueAndSortedDateRanges(availability);

  return filterRedundantDateRanges(uniqueRanges);
};
