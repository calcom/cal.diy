import { getPublicEvent } from "@calcom/features/eventtypes/lib/getPublicEvent";
import prisma from "@calcom/prisma";

export type GetPublicEventInput = {
  username: string;
  eventSlug: string;
  isTeamEvent?: boolean;
  org: string | null;
  fromRedirectOfNonOrgLink: boolean;
};

export class EventRepository {
  static async getPublicEvent(input: GetPublicEventInput, userId?: number) {
    const event = await getPublicEvent({
      username: input.username,
      eventSlug: input.eventSlug,
      isTeamEvent: input.isTeamEvent,
      org: input.org,
      prisma: prisma,
      fromRedirectOfNonOrgLink: input.fromRedirectOfNonOrgLink,
      currentUserId: userId
    });
    return event;
  }
}
