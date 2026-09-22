import dayjs from "@calcom/dayjs";
import { ErrorCode } from "@calcom/lib/errorCodes";

export type EventTypeForTimezone = {
  userId?: number | null;
  teamId?: number | null;
  hosts?: Array<{
    user: {
      timeZone: string | null;
    } | null;
  }> | null;
  owner?: {
    timeZone: string | null;
  } | null;
  team?: {
    members?: Array<{
      user?: {
        timeZone: string | null;
      } | null;
    }> | null;
  } | null;
};

export type HashedLinkData = {
  id: number;
  expiresAt: Date | null;
  maxUsageCount: number | null;
  usageCount: number;
  eventType: EventTypeForTimezone;
};

/**
 * Extracts the host timezone from event type data
 * @param eventType - Event type data with potential timezone information
 * @returns Host timezone string or null if not found
 */
export function extractHostTimezone(eventType: EventTypeForTimezone): string {
  if (eventType?.userId && eventType?.owner?.timeZone) {
    // Personal event type - use owner's timezone
    return eventType.owner.timeZone;
  } else if (eventType?.teamId) {
    // Team event type - try hosts first, then team members
    if (eventType.hosts && eventType.hosts.length > 0 && eventType.hosts[0]?.user?.timeZone) {
      return eventType.hosts[0].user.timeZone;
    } else if (
      eventType.team?.members &&
      eventType.team.members.length > 0 &&
      eventType.team.members[0]?.user?.timeZone
    ) {
      return eventType.team.members[0]?.user?.timeZone;
    }
  }
  return dayjs.tz.guess();
}

/**
 * Core time-based expiration logic
 * @param expiresAt - The expiration date
 * @param timezone - Optional timezone for comparison
 * @returns true if expired, false if valid
 */
function hasExpiryTimePassed(expiresAt: Date | string | null, timezone?: string | null): boolean {
  if (!expiresAt) return false;

  if (timezone) {
    const now = dayjs().tz(timezone);
    const expiration = dayjs(expiresAt).tz(timezone);
    return expiration.isBefore(now);
  } else {
    const now = dayjs();
    const expiration = dayjs(expiresAt);
    return expiration.isBefore(now);
  }
}

/**
 * Validates if a hashed link has expired based on time
 * @param expiresAt - The expiration date
 * @param eventType - Event type data for timezone extraction
 * @returns true if expired, false if valid
 */
export function isTimeBasedExpired(expiresAt: Date | null, eventType: EventTypeForTimezone): boolean {
  const hostTimezone = extractHostTimezone(eventType);
  return hasExpiryTimePassed(expiresAt, hostTimezone);
}

/**
 * Validates if a hashed link has exceeded its usage limit
 * @param usageCount - Current usage count
 * @param maxUsageCount - Maximum allowed usage count
 * @returns true if usage exceeded, false if valid
 */
export function isUsageBasedExpired(usageCount: number, maxUsageCount?: number | null): boolean {
  if (!maxUsageCount || maxUsageCount <= 0) return false;
  return usageCount >= maxUsageCount;
}

/**
 * Validates hashed link data for expiration
 * @param linkData - The hashed link data to validate
 * @throws Error with ErrorCode.PrivateLinkExpired if link is expired
 */
export function validateHashedLinkData(linkData: HashedLinkData): void {
  if (isTimeBasedExpired(linkData.expiresAt, linkData.eventType)) {
    throw new Error(ErrorCode.PrivateLinkExpired);
  }

  if (isUsageBasedExpired(linkData.usageCount, linkData.maxUsageCount)) {
    throw new Error(ErrorCode.PrivateLinkExpired);
  }
}

/**
 * Checks if a link has expired
 * @param link - Link object with expiration and usage data
 * @param timezone - Optional timezone for time-based expiration
 * @returns true if expired, false if valid
 */
export function isLinkExpired(
  link: {
    expiresAt?: Date | string | null;
    maxUsageCount?: number | null;
    usageCount?: number | null;
  },
  timezone?: string | null
): boolean {
  const isTimeExpired = link.expiresAt ? hasExpiryTimePassed(link.expiresAt, timezone) : false;
  const isUsageExpired = isUsageBasedExpired(link.usageCount || 0, link.maxUsageCount);
  return isTimeExpired || isUsageExpired;
}

/**
 * filters out expired links
 * @param links - Array of links to filter
 * @param timezone - Optional timezone for time-based expiration
 * @returns Array of active (non-expired) links
 */
export function filterActiveLinks<
  T extends {
    expiresAt?: Date | null;
    maxUsageCount?: number | null;
    usageCount?: number | null;
  },
>(links: T[], timezone?: string | null): T[] {
  return links.filter((link) => !isLinkExpired(link, timezone));
}
