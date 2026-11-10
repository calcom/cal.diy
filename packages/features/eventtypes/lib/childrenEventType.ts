import type { MembershipRole } from "@calcom/prisma/enums";
import type { UserProfile } from "@calcom/types/UserProfile";

export type ChildrenEventType = {
  value: string;
  label: string;
  created: boolean;
  owner: {
    avatar: string;
    id: number;
    email: string;
    name: string;
    username: string;
    membership: MembershipRole;
    eventTypeSlugs: string[];
    profile: UserProfile;
  };
  slug: string;
  hidden?: boolean;
};

/**
 * Extracts only the fields needed by the server from a ChildrenEventType array.
 * Display-only fields (avatar, profile, username, membership) are stripped to
 * avoid bloating the request payload — with many assigned users (~85+),
 * sending full objects can push the request body over the 1MB server limit.
 */
export function stripChildrenForPayload(children: ChildrenEventType[]) {
  return children.map((child) => ({
    ...(child.hidden !== undefined ? { hidden: child.hidden } : {}),
    owner: {
      id: child.owner.id,
      name: child.owner.name,
      email: child.owner.email,
      eventTypeSlugs: child.owner.eventTypeSlugs,
    },
  }));
}
