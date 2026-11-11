import { throwIfNotHaveAdminAccessToTeam } from "@calcom/app-store/_utils/throwIfNotHaveAdminAccessToTeam";
import { HttpError } from "@calcom/lib/http-error";

/** Check whether a user may configure TOAB Jitsi for an event type (owner or team admin). */
export async function canConfigureEventType({
  sessionUserId,
  eventType,
}: {
  sessionUserId: number;
  eventType: { userId: number | null; teamId: number | null };
}): Promise<boolean> {
  if (!eventType.teamId) return eventType.userId === sessionUserId;

  // The shared helper signals "not an admin" with a 401 HttpError; translate it so callers can
  // answer 403 like the personal event type branch, while real failures still propagate.
  try {
    await throwIfNotHaveAdminAccessToTeam({ teamId: eventType.teamId, userId: sessionUserId });
    return true;
  } catch (error: unknown) {
    if (error instanceof HttpError && error.statusCode === 401) return false;
    throw error;
  }
}
