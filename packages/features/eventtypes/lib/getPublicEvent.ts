import process from "node:process";
import type { LocationObject } from "@calcom/app-store/locations";
import { privacyFilteredLocations } from "@calcom/app-store/locations";
import { getAppFromSlug } from "@calcom/app-store/utils";
import { eventTypeMetaDataSchemaWithTypedApps } from "@calcom/app-store/zod-utils";
import dayjs from "@calcom/dayjs";
import { getBookingFieldsWithSystemFields } from "@calcom/features/bookings/lib/getBookingFields";
import { getDefaultEvent, getUsernameList } from "@calcom/features/eventtypes/lib/defaultEvents";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { getOrgOrTeamAvatar, getPlaceholderAvatar } from "@calcom/lib/defaultAvatarImage";
import { getUserAvatarUrl } from "@calcom/lib/getAvatarUrl";
import { isRecurringEvent, parseRecurringEvent } from "@calcom/lib/isRecurringEvent";
import { markdownToSafeHTML } from "@calcom/lib/markdownToSafeHTML";
import type { PrismaClient } from "@calcom/prisma";
import type { Prisma, Team, User as UserType } from "@calcom/prisma/client";
import { MembershipRole } from "@calcom/prisma/enums";
import type { BookerLayoutSettings } from "@calcom/prisma/zod-utils";
import {
  BookerLayouts,
  bookerLayoutOptions,
  bookerLayouts as bookerLayoutsSchema,
  customInputSchema,
  teamMetadataSchema,
  userMetadata as userMetadataSchema,
} from "@calcom/prisma/zod-utils";
import type { UserProfile } from "@calcom/types/UserProfile";

class PermissionCheckService {
  constructor(_prisma?: unknown) {}
  async checkPermission(..._args: unknown[]) {
    return true;
  }
  async hasPermission(..._args: unknown[]) {
    return true;
  }
  async getTeamIdsWithPermission(..._args: unknown[]): Promise<number[]> {
    return [];
  }
}
const getSlugOrRequestedSlug = (slug: string) => ({ slug });
const getBookerBaseUrlSync = (_orgSlug?: string | number | null): string =>
  process.env.NEXT_PUBLIC_WEBAPP_URL || "https://app.cal.com";

const userSelect = {
  id: true,
  avatarUrl: true,
  username: true,
  name: true,
  weekStart: true,
  brandColor: true,
  darkBrandColor: true,
  theme: true,
  metadata: true,
  organization: {
    select: {
      id: true,
      name: true,
      slug: true,
      bannerUrl: true,
      organizationSettings: {
        select: {
          disableAutofillOnBookingPage: true,
        },
      },
    },
  },
  defaultScheduleId: true,
} satisfies Prisma.UserSelect;

export const getPublicEventSelect = (fetchAllUsers: boolean) => {
  return {
    id: true,
    title: true,
    description: true,
    interfaceLanguage: true,
    eventName: true,
    slug: true,
    isInstantEvent: true,
    instantMeetingParameters: true,
    schedulingType: true,
    length: true,
    locations: true,
    enablePerHostLocations: true,
    customInputs: true,
    disableGuests: true,
    metadata: true,
    lockTimeZoneToggleOnBookingPage: true,
    lockedTimeZone: true,
    requiresConfirmation: true,
    autoTranslateDescriptionEnabled: true,
    fieldTranslations: {
      select: {
        translatedText: true,
        targetLocale: true,
        field: true,
      },
    },
    requiresBookerEmailVerification: true,
    recurringEvent: true,
    price: true,
    currency: true,
    seatsPerTimeSlot: true,
    disableCancelling: true,
    disableRescheduling: true,
    minimumRescheduleNotice: true,
    allowReschedulingCancelledBookings: true,
    seatsShowAvailabilityCount: true,
    bookingFields: true,
    teamId: true,
    team: {
      select: {
        parentId: true,
        metadata: true,
        brandColor: true,
        darkBrandColor: true,
        slug: true,
        name: true,
        logoUrl: true,
        theme: true,
        hideTeamProfileLink: true,
        parent: {
          select: {
            slug: true,
            name: true,
            bannerUrl: true,
            logoUrl: true,
            organizationSettings: {
              select: {
                disableAutofillOnBookingPage: true,
              },
            },
          },
        },
        isPrivate: true,
        organizationSettings: {
          select: {
            disableAutofillOnBookingPage: true,
          },
        },
      },
    },
    successRedirectUrl: true,
    forwardParamsSuccessRedirect: true,
    hosts: {
      select: {
        user: {
          select: userSelect,
        },
      },
      ...(fetchAllUsers ? {} : { take: 3 }),
    },
    owner: {
      select: userSelect,
    },
    schedule: {
      select: {
        id: true,
        timeZone: true,
      },
    },
    instantMeetingSchedule: {
      select: {
        id: true,
        timeZone: true,
      },
    },
    periodType: true,
    periodDays: true, // days if limiting future bookings
    periodEndDate: true, //end date limit by range
    periodStartDate: true, //start date limit by range
    periodCountCalendarDays: true, // count calendar days? Or only business days based on periodDays
    hidden: true,
    assignAllTeamMembers: true,
    rescheduleWithSameRoundRobinHost: true,
    parent: {
      select: {
        team: {
          select: {
            theme: true,
            brandColor: true,
            darkBrandColor: true,
          },
        },
      },
    },
  } satisfies Prisma.EventTypeSelect;
};

export async function isCurrentlyAvailable({
  prisma,
  instantMeetingScheduleId,
  availabilityTimezone,
  length,
}: {
  prisma: PrismaClient;
  instantMeetingScheduleId: number;
  availabilityTimezone: string;
  length: number;
}): Promise<boolean> {
  const now = dayjs().tz(availabilityTimezone);
  const currentDay = now.day();
  const meetingEndTime = now.add(length, "minute");

  const res = await prisma.schedule.findUniqueOrThrow({
    where: {
      id: instantMeetingScheduleId,
    },
    select: {
      availability: true,
    },
  });

  const dateOverride = res.availability.find((a) => a.date && dayjs(a.date).isSame(now, "day"));

  if (dateOverride) {
    return !isAvailableInTimeSlot(dateOverride, now, meetingEndTime);
  }

  for (const availability of res.availability) {
    if (!availability.date && availability.days.includes(currentDay)) {
      const isAvailable = isAvailableInTimeSlot(availability, now, meetingEndTime);
      if (isAvailable) {
        return true;
      }
    }
  }

  return false;
}

function isAvailableInTimeSlot(
  availability: { startTime: Date; endTime: Date; days: number[] },
  now: dayjs.Dayjs,
  meetingEndTime: dayjs.Dayjs
): boolean {
  const startTime = dayjs(availability.startTime).utc().format("HH:mm");
  const endTime = dayjs(availability.endTime).utc().format("HH:mm");

  const periodStart = now
    .startOf("day")
    .hour(parseInt(startTime.split(":")[0], 10))
    .minute(parseInt(startTime.split(":")[1], 10));
  const periodEnd = now
    .startOf("day")
    .hour(parseInt(endTime.split(":")[0], 10))
    .minute(parseInt(endTime.split(":")[1], 10));

  const isWithinPeriod =
    now.isBetween(periodStart, periodEnd, null, "[)") &&
    meetingEndTime.isBetween(periodStart, periodEnd, null, "(]");

  return isWithinPeriod;
}

export type PublicEventType = Awaited<ReturnType<typeof getPublicEvent>>;

export async function getEventTypeHosts({
  hosts,
  fetchAllUsers = false,
  prisma,
}: {
  hosts: Prisma.EventTypeGetPayload<{ select: ReturnType<typeof getPublicEventSelect> }>["hosts"];
  fetchAllUsers?: boolean;
  prisma: PrismaClient;
}) {
  const usersAsHosts = hosts.map((host) => host.user);

  // Enrich users in a single batch call
  const enrichedUsers = await new UserRepository(prisma).enrichUsersWithTheirProfiles(usersAsHosts);

  // Map enriched users back to the hosts
  const enrichedHosts = hosts.map((host, index) => ({
    ...host,
    user: enrichedUsers[index],
  }));

  return {
    subsetOfHosts: enrichedHosts,
    hosts: fetchAllUsers ? enrichedHosts : undefined,
  };
}

export type GetPublicEventParams = {
  username: string,
  eventSlug: string,
  isTeamEvent: boolean | undefined,
  org: string | null,
  prisma: PrismaClient,
  fromRedirectOfNonOrgLink: boolean,
  currentUserId?: number,
  fetchAllUsers?: boolean
}

export const getPublicEvent = async (
  params: GetPublicEventParams
) => {
  const {
    username,
    eventSlug,
    isTeamEvent,
    org,
    prisma,
    fromRedirectOfNonOrgLink,
    currentUserId,
    fetchAllUsers = false
  } = params

  const usernameList = getUsernameList(username);
  const orgQuery = org ? getSlugOrRequestedSlug(org) : null;
  // In case of dynamic group event, we fetch user's data and use the default event.
  if (usernameList.length > 1) {
    const usersInOrgContext = await new UserRepository(prisma).findUsersByUsername({
      usernameList,
      orgSlug: org,
    });
    const users = usersInOrgContext;

    const defaultEvent = getDefaultEvent(eventSlug);
    let locations = defaultEvent.locations ? (defaultEvent.locations as LocationObject[]) : [];

    // Get the preferred location type from the first user
    const firstUsersMetadata = userMetadataSchema.parse(users[0].metadata || {});
    const preferedLocationType = firstUsersMetadata?.defaultConferencingApp;

    if (preferedLocationType?.appSlug) {
      const foundApp = getAppFromSlug(preferedLocationType.appSlug);
      const appType = foundApp?.appData?.location?.type;
      if (appType) {
        // Replace the location with the preferred location type
        // This will still be default to daily if the app is not found
        locations = [{ type: appType, link: preferedLocationType.appLink }] as LocationObject[];
      }
    }

    const defaultEventBookerLayouts = {
      enabledLayouts: [...bookerLayoutOptions],
      defaultLayout: BookerLayouts.MONTH_VIEW,
    } as BookerLayoutSettings;
    const disableBookingTitle = !defaultEvent.isDynamic;
    const unPublishedOrgUser = users.find((user) => user.profile?.organization?.slug === null);

    let orgDetails: Pick<Team, "logoUrl" | "name"> | undefined;
    if (org) {
      orgDetails = await prisma.team.findFirstOrThrow({
        where: {
          slug: org,
        },
        select: {
          logoUrl: true,
          name: true,
        },
      });
    }

    return {
      ...defaultEvent,
      bookingFields: getBookingFieldsWithSystemFields({ ...defaultEvent, disableBookingTitle }),
      // Only return fields consumed by the booker.
      subsetOfUsers: users.map((user) => ({
        name: user.name,
        username: user.username,
        avatarUrl: user.avatarUrl,
        weekStart: user.weekStart,
        brandColor: user.brandColor,
        darkBrandColor: user.darkBrandColor,
        profile: user.profile,
        bookerUrl: getBookerBaseUrlSync(user.profile?.organization?.slug ?? null),
      })),
      users: fetchAllUsers
        ? users.map((user) => ({
            name: user.name,
            username: user.username,
            avatarUrl: user.avatarUrl,
            weekStart: user.weekStart,
            brandColor: user.brandColor,
            darkBrandColor: user.darkBrandColor,
            profile: user.profile,
            bookerUrl: getBookerBaseUrlSync(user.profile?.organization?.slug ?? null),
          }))
        : undefined,
      locations: privacyFilteredLocations(locations),
      profile: {
        weekStart: users[0].weekStart,
        brandColor: users[0].brandColor,
        darkBrandColor: users[0].darkBrandColor,
        theme: null,
        bookerLayouts: bookerLayoutsSchema.parse(
          firstUsersMetadata?.defaultBookerLayouts || defaultEventBookerLayouts
        ),
        ...(orgDetails
          ? {
              image: getPlaceholderAvatar(orgDetails?.logoUrl, orgDetails?.name),
              name: orgDetails?.name,
              username: org,
            }
          : {}),
      },
      entity: {
        considerUnpublished: !fromRedirectOfNonOrgLink && unPublishedOrgUser !== undefined,
        fromRedirectOfNonOrgLink,
        orgSlug: org,
        name: unPublishedOrgUser?.profile?.organization?.name ?? null,
        teamSlug: null,
        logoUrl: null,
        hideProfileLink: false,
      },
      isInstantEvent: false,
      instantMeetingParameters: [],
      showInstantEventConnectNowModal: false,
      autoTranslateDescriptionEnabled: false,
      fieldTranslations: [],
    };
  }

  const usersOrTeamQuery = isTeamEvent
    ? {
        team: {
          ...getSlugOrRequestedSlug(username),
          parent: orgQuery,
        },
      }
    : {
        users: {
          some: {
            ...(orgQuery
              ? {
                  profiles: {
                    some: {
                      organization: orgQuery,
                      username: username,
                    },
                  },
                }
              : {
                  username,
                  profiles: { none: {} },
                }),
          },
        },
        team: null,
      };

  // In case it's not a group event, it's either a single user or a team, and we query that data.
  let event = await prisma.eventType.findFirst({
    where: {
      slug: eventSlug,
      ...usersOrTeamQuery,
    },
    select: getPublicEventSelect(fetchAllUsers),
  });

  // If no event was found, check for platform org user event
  if (!event && !orgQuery) {
    event = await prisma.eventType.findFirst({
      where: {
        slug: eventSlug,
        users: {
          some: {
            username,
            isPlatformManaged: false,
            profiles: {
              some: {
                organization: {
                  isPlatform: true,
                },
              },
            },
          },
        },
      },
      select: getPublicEventSelect(fetchAllUsers),
    });
  }

  if (!event) return null;

  const eventMetaData = eventTypeMetaDataSchemaWithTypedApps.parse(event.metadata || {});
  const teamMetadata = teamMetadataSchema.parse(event.team?.metadata || {});
  const usersAsHosts = event.hosts.map((host) => host.user);

  // Enrich users in a single batch call
  const enrichedUsers = await new UserRepository(prisma).enrichUsersWithTheirProfiles(usersAsHosts);

  // Map enriched users back to the hosts
  const hosts = event.hosts.map((host, index) => ({
    ...host,
    user: enrichedUsers[index],
  }));

  const eventWithUserProfiles = {
    ...event,
    owner: event.owner
      ? await new UserRepository(prisma).enrichUserWithItsProfile({
          user: event.owner,
        })
      : null,
    subsetOfHosts: hosts,
    hosts: fetchAllUsers ? hosts : undefined,
  };

  let users =
    (await getUsersFromEvent(eventWithUserProfiles, prisma)) ||
    (await getOwnerFromUsersArray(prisma, event.id));

  if (users === null) {
    throw new Error(`EventType ${event.id} has no owner or users.`);
  }
  //In case the event schedule is not defined ,use the event owner's default schedule
  if (!eventWithUserProfiles.schedule && eventWithUserProfiles.owner?.defaultScheduleId) {
    const eventOwnerDefaultSchedule = await prisma.schedule.findUnique({
      where: {
        id: eventWithUserProfiles.owner?.defaultScheduleId,
      },
      select: {
        id: true,
        timeZone: true,
      },
    });
    eventWithUserProfiles.schedule = eventOwnerDefaultSchedule;
  }

  let orgDetails: Pick<Team, "logoUrl" | "name"> | undefined | null;
  if (org) {
    orgDetails = await prisma.team.findFirst({
      where: {
        slug: org,
        parentId: null,
      },
      select: {
        logoUrl: true,
        name: true,
      },
    });
  }

  let showInstantEventConnectNowModal = eventWithUserProfiles.isInstantEvent;

  if (eventWithUserProfiles.isInstantEvent && eventWithUserProfiles.instantMeetingSchedule?.id) {
    const { id, timeZone } = eventWithUserProfiles.instantMeetingSchedule;

    showInstantEventConnectNowModal = await isCurrentlyAvailable({
      prisma,
      instantMeetingScheduleId: id,
      availabilityTimezone: timeZone ?? "Europe/London",
      length: eventWithUserProfiles.length,
    });
  }
  let canViewPrivateTeamMembers = false;
  if (currentUserId && event.teamId) {
    const permissionCheckService = new PermissionCheckService();
    canViewPrivateTeamMembers = await permissionCheckService.checkPermission({
      userId: currentUserId,
      teamId: event.teamId,
      permission: "team.read",
      fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
    });

    if (!canViewPrivateTeamMembers && event.team?.parentId) {
      canViewPrivateTeamMembers = await permissionCheckService.checkPermission({
        userId: currentUserId,
        teamId: event.team.parentId,
        permission: "team.read",
        fallbackRoles: [MembershipRole.ADMIN, MembershipRole.OWNER],
      });
    }
  }

  if (event.team?.isPrivate && !canViewPrivateTeamMembers) {
    users = [];
  }

  return {
    ...eventWithUserProfiles,
    bookerLayouts: bookerLayoutsSchema.parse(eventMetaData?.bookerLayouts || null),
    description: markdownToSafeHTML(eventWithUserProfiles.description),
    metadata: eventMetaData,
    customInputs: customInputSchema.array().parse(event.customInputs || []),
    locations: privacyFilteredLocations((eventWithUserProfiles.locations || []) as LocationObject[]),
    bookingFields: getBookingFieldsWithSystemFields(event),
    recurringEvent: isRecurringEvent(eventWithUserProfiles.recurringEvent)
      ? parseRecurringEvent(event.recurringEvent)
      : null,
    // Sets user data on profile object for easier access
    profile: getProfileFromEvent(eventWithUserProfiles),
    subsetOfUsers: users,
    users: fetchAllUsers ? users : undefined,
    entity: {
      fromRedirectOfNonOrgLink,
      considerUnpublished:
        !fromRedirectOfNonOrgLink &&
        (eventWithUserProfiles.team?.slug === null ||
          eventWithUserProfiles.owner?.profile?.organization?.slug === null ||
          eventWithUserProfiles.team?.parent?.slug === null),
      orgSlug: org,
      teamSlug: (eventWithUserProfiles.team?.slug || teamMetadata?.requestedSlug) ?? null,
      name:
        (eventWithUserProfiles.owner?.profile?.organization?.name ||
          eventWithUserProfiles.team?.parent?.name ||
          eventWithUserProfiles.team?.name) ??
        null,
      hideProfileLink: eventWithUserProfiles.team?.hideTeamProfileLink ?? false,
      ...(orgDetails
        ? {
            logoUrl: getPlaceholderAvatar(orgDetails?.logoUrl, orgDetails?.name),
            name: orgDetails?.name,
          }
        : {}),
    },
    isDynamic: false,
    isInstantEvent: eventWithUserProfiles.isInstantEvent,
    showInstantEventConnectNowModal,
    instantMeetingParameters: eventWithUserProfiles.instantMeetingParameters,
    assignAllTeamMembers: event.assignAllTeamMembers,
    disableCancelling: event.disableCancelling,
    disableRescheduling: event.disableRescheduling,
    allowReschedulingCancelledBookings: event.allowReschedulingCancelledBookings,
    interfaceLanguage: event.interfaceLanguage,
  };
};

const eventData = getPublicEventSelect(true);

type Event = Prisma.EventTypeGetPayload<{ select: typeof eventData }>;

type GetProfileFromEventInput = Omit<Event, "hosts"> & {
  hosts?: Event["hosts"];
  subsetOfHosts: Event["hosts"];
};

export function getProfileFromEvent(event: GetProfileFromEventInput) {
  const { team, subsetOfHosts: hosts, owner } = event;
  const nonTeamProfile = hosts?.[0]?.user || owner;
  const profile = team || nonTeamProfile;
  if (!profile) throw new Error("Event has no owner");

  const styleProfile = team || event.parent?.team || nonTeamProfile;
  const username = "username" in profile ? profile.username : team?.slug;
  const weekStart = hosts?.[0]?.user?.weekStart || owner?.weekStart || "Monday";
  const eventMetaData = eventTypeMetaDataSchemaWithTypedApps.parse(event.metadata || {});
  const userMetaData = userMetadataSchema.parse(profile.metadata || {});

  return {
    username,
    name: profile.name,
    weekStart,
    image: team
      ? getOrgOrTeamAvatar(team)
      : getUserAvatarUrl({
          avatarUrl: nonTeamProfile?.avatarUrl,
        }),
    brandColor: styleProfile.brandColor,
    darkBrandColor: styleProfile.darkBrandColor,
    theme: styleProfile.theme,
    bookerLayouts: bookerLayoutsSchema.parse(
      eventMetaData?.bookerLayouts ||
        (userMetaData && "defaultBookerLayouts" in userMetaData ? userMetaData.defaultBookerLayouts : null)
    ),
  };
}

export async function getUsersFromEvent(
  event: Omit<Event, "owner" | "hosts"> & {
    owner:
      | (Event["owner"] & {
          profile: UserProfile;
        })
      | null;
    hosts?: (Omit<Event["hosts"][number], "user"> & {
      user: Event["hosts"][number]["user"] & {
        profile: UserProfile;
      };
    })[];
    subsetOfHosts: (Omit<Event["hosts"][number], "user"> & {
      user: Event["hosts"][number]["user"] & {
        profile: UserProfile;
      };
    })[];
  },
  prisma: PrismaClient
) {
  const { team, hosts, subsetOfHosts, owner, id } = event;
  if (team) {
    const eventHosts = hosts?.length ? hosts : subsetOfHosts;
    // getOwnerFromUsersArray is used here for backward compatibility when team event type has users[] but not hosts[]
    return eventHosts.length
      ? eventHosts.filter((host) => host.user.username).map(mapHostsToUsers)
      : ((await getOwnerFromUsersArray(prisma, id)) ?? []);
  }
  if (!owner) {
    return null;
  }
  const { username, name, weekStart, profile, avatarUrl } = owner;
  const organizationId = profile?.organization?.id ?? null;
  return [
    {
      username,
      name,
      weekStart,
      organizationId,
      avatarUrl,
      profile,
      bookerUrl: getBookerBaseUrlSync(owner.profile?.organization?.slug ?? null),
    },
  ];
}

async function getOwnerFromUsersArray(prisma: PrismaClient, eventTypeId: number) {
  const { users } = await prisma.eventType.findUniqueOrThrow({
    where: { id: eventTypeId },
    select: {
      users: {
        select: {
          avatarUrl: true,
          username: true,
          name: true,
          weekStart: true,
          id: true,
        },
      },
    },
  });
  if (!users.length) return null;

  // Batch enrich users in a single call
  const enrichedUsers = await new UserRepository(prisma).enrichUsersWithTheirProfiles(users);

  // Map the enriched users back to include the organization info
  const usersWithUserProfile = enrichedUsers.map((user) => ({
    ...user,
    organizationId: user.profile?.organization?.id ?? null,
    organization: user.profile?.organization,
    profile: user.profile,
  }));

  return [
    {
      ...usersWithUserProfile[0],
      bookerUrl: getBookerBaseUrlSync(usersWithUserProfile[0].organization?.slug ?? null),
    },
  ];
}

function mapHostsToUsers(host: {
  user: Pick<UserType, "username" | "name" | "weekStart" | "avatarUrl"> & {
    profile: UserProfile;
  };
}) {
  return {
    username: host.user.username,
    name: host.user.name,
    avatarUrl: host.user.avatarUrl,
    weekStart: host.user.weekStart,
    organizationId: host.user.profile?.organizationId ?? null,
    bookerUrl: getBookerBaseUrlSync(host.user.profile?.organization?.slug ?? null),
    profile: host.user.profile,
  };
}

export const processEventDataShared = async ({
  eventData,
  metadata,
  prisma,
}: {
  eventData: Prisma.EventTypeGetPayload<{ select: ReturnType<typeof getPublicEventSelect> }>;
  metadata: ReturnType<typeof eventTypeMetaDataSchemaWithTypedApps.parse>;
  prisma: PrismaClient;
}) => {
  let showInstantEventConnectNowModal = eventData.isInstantEvent ?? false;
  if (eventData.isInstantEvent && eventData.instantMeetingSchedule?.id) {
    const { id, timeZone } = eventData.instantMeetingSchedule;
    showInstantEventConnectNowModal = await isCurrentlyAvailable({
      prisma,
      instantMeetingScheduleId: id,
      availabilityTimezone: timeZone ?? "Europe/London",
      length: eventData.length,
    });
  }

  return {
    ...eventData,
    bookerLayouts: bookerLayoutsSchema.parse(metadata?.bookerLayouts || null),
    description: markdownToSafeHTML(eventData.description),
    metadata,
    customInputs: customInputSchema.array().parse(eventData.customInputs || []),
    locations: privacyFilteredLocations((eventData.locations || []) as LocationObject[]),
    bookingFields: getBookingFieldsWithSystemFields(eventData),
    recurringEvent: isRecurringEvent(eventData.recurringEvent)
      ? parseRecurringEvent(eventData.recurringEvent)
      : null,
    isDynamic: false,
    showInstantEventConnectNowModal,
  };
};
