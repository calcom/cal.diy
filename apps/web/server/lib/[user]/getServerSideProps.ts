import { encode } from "node:querystring";
import { getUsernameList } from "@calcom/features/eventtypes/lib/defaultEvents";
import { getEventTypesPublic } from "@calcom/features/eventtypes/lib/getEventTypesPublic";
import { getBrandingForUser } from "@calcom/features/profile/lib/getBranding";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { DEFAULT_DARK_BRAND_COLOR, DEFAULT_LIGHT_BRAND_COLOR } from "@calcom/lib/constants";
import { getUserAvatarUrl } from "@calcom/lib/getAvatarUrl";
import logger from "@calcom/lib/logger";
import { markdownToSafeHTML } from "@calcom/lib/markdownToSafeHTML";
import { safeStringify } from "@calcom/lib/safeStringify";
import { stripMarkdown } from "@calcom/lib/stripMarkdown";
import { prisma } from "@calcom/prisma";
import type { EventType, User } from "@calcom/prisma/client";
import { RedirectType } from "@calcom/prisma/enums";
import type { EventTypeMetaDataSchema } from "@calcom/prisma/zod-utils";
import type { UserProfile } from "@calcom/types/UserProfile";
import { handleOrgRedirect } from "@lib/handleOrgRedirect";
import type { EmbedProps } from "app/WithEmbedSSR";
import type { GetServerSideProps } from "next";
import type { z } from "zod";

const log: ReturnType<typeof logger.getSubLogger> = logger.getSubLogger({
  prefix: ["[[pages/[user]]]"],
});

type UserPageProps = {
  profile: {
    name: string;
    image: string;
    theme: string | null;
    brandColor: string;
    darkBrandColor: string;
    organization: {
      requestedSlug: string | null;
      slug: string | null;
      id: number | null;
      brandColor: string | null;
      darkBrandColor: string | null;
      theme: string | null;
    } | null;
    allowSEOIndexing: boolean;
    username: string | null;
  };
  users: (Pick<User, "name" | "username" | "bio" | "verified" | "avatarUrl"> & {
    profile: UserProfile;
  })[];
  themeBasis: string | null;
  markdownStrippedBio: string;
  safeBio: string;
  entity: {
    logoUrl?: string | null;
    considerUnpublished: boolean;
    orgSlug?: string | null;
    name?: string | null;
    teamSlug?: string | null;
  };
  eventTypes: ({
    descriptionAsSafeHTML: string;
    metadata: z.infer<typeof EventTypeMetaDataSchema>;
  } & Pick<
    EventType,
    | "id"
    | "title"
    | "slug"
    | "length"
    | "hidden"
    | "lockTimeZoneToggleOnBookingPage"
    | "lockedTimeZone"
    | "requiresConfirmation"
    | "canSendCalVideoTranscriptionEmails"
    | "requiresBookerEmailVerification"
    | "price"
    | "currency"
    | "recurringEvent"
    | "seatsPerTimeSlot"
    | "schedulingType"
  >)[];
  isOrgSEOIndexable: boolean | undefined;
} & EmbedProps;

const getQueryString = (query: GetServerSidePropsContext["query"]): string => {
  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => {
        searchParams.append(key, v);
      });
    } else if (value !== undefined && value !== null) {
      searchParams.append(key, value);
    }
  });
  const queryString = searchParams.toString();
  if (queryString) {
    return `?${queryString}`;
  }
  return "";
};

export const getServerSideProps: GetServerSideProps<UserPageProps> = async (context: GetServerSidePropsContext) => {
  const { currentOrgDomain, isValidOrgDomain } = orgDomainConfig(context.req, context.params?.orgSlug);
  const usernameList = getUsernameList(context.query.user as string);
  const isARedirectFromNonOrgLink = context.query.orgRedirection === "true";
  const dataFetchStart = Date.now();

  let orgDomain = null;
  if (isValidOrgDomain) {
    orgDomain = currentOrgDomain;
  }

  const redirect = await handleOrgRedirect({
    slugs: usernameList,
    redirectType: RedirectType.User,
    eventTypeSlug: null,
    context,
    currentOrgDomain: orgDomain,
  });

  if (redirect) {
    return redirect;
  }

  const usersInOrgContext = await getUsersInOrgContext(usernameList, orgDomain);

  const isDynamicGroup = usersInOrgContext.length > 1;
  log.debug(safeStringify({ usersInOrgContext, isValidOrgDomain, currentOrgDomain, isDynamicGroup }));

  if (isDynamicGroup) {
    const destinationUrl = encodeURI(`/${usernameList.join("+")}/dynamic`);
    const destinationWithQuery = `${destinationUrl}${getQueryString(context.query)}`;

    log.debug(`Dynamic group detected, redirecting to ${destinationUrl}`);
    return {
      redirect: {
        permanent: false,
        destination: destinationWithQuery,
      },
    } as const;
  }

  const isNonOrgUser = (user: { profile: UserProfile }): boolean => {
    return !user.profile?.organization;
  };

  const isThereAnyNonOrgUser = usersInOrgContext.some(isNonOrgUser);

  if (!usersInOrgContext.length || (!isValidOrgDomain && !isThereAnyNonOrgUser)) {
    return {
      notFound: true,
    } as const;
  }

  const [user] = usersInOrgContext;

  const branding = getBrandingForUser({ user });

  const profile = {
    name: user.name || user.username || "",
    image: getUserAvatarUrl({
      avatarUrl: user.avatarUrl,
    }),
    theme: branding.theme,
    brandColor: branding.brandColor ?? DEFAULT_LIGHT_BRAND_COLOR,
    avatarUrl: user.avatarUrl,
    darkBrandColor: branding.darkBrandColor ?? DEFAULT_DARK_BRAND_COLOR,
    allowSEOIndexing: user.allowSEOIndexing ?? true,
    username: user.username,
    organization: user.profile.organization
      ? {
          requestedSlug: null,
          slug: user.profile.organization.slug,
          id: user.profile.organization.id,
          brandColor: user.profile.organization.brandColor,
          darkBrandColor: user.profile.organization.darkBrandColor,
          theme: user.profile.organization.theme,
        }
      : null,
  };

  const dataFetchEnd = Date.now();
  if (context.query.log === "1") {
    context.res.setHeader("X-Data-Fetch-Time", `${dataFetchEnd - dataFetchStart}ms`);
  }

  const eventTypes = await getEventTypesPublic(user.id);

  if (eventTypes.length === 1 && context.query.redirect !== "false") {
    const urlDestination = `/${user.profile.username}/${eventTypes[0].slug}`;
    const urlQuery = getQueryString(context.query);

    return {
      redirect: {
        permanent: false,
        destination: `${encodeURI(urlDestination)}${urlQuery}`,
      },
    };
  }

  const safeBio = markdownToSafeHTML(user.bio) || "";
  const markdownStrippedBio = stripMarkdown(user?.bio || "");
  const org = usersInOrgContext[0].profile.organization;

  let logoUrlObj = {};
  if (org?.logoUrl) {
    logoUrlObj = { logoUrl: org.logoUrl };
  }

  return {
    props: {
      users: usersInOrgContext.map((user) => ({
        name: user.name,
        username: user.username,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        verified: user.verified,
        profile: user.profile,
      })),
      entity: {
        ...logoUrlObj,
        considerUnpublished: !isARedirectFromNonOrgLink && org?.slug === null,
        orgSlug: currentOrgDomain,
        name: org?.name ?? null,
      },
      eventTypes,
      safeBio,
      profile,
      themeBasis: user.username,
      markdownStrippedBio,
      isOrgSEOIndexable: org?.organizationSettings?.allowSEOIndexing ?? false,
    },
  };
};

export async function getUsersInOrgContext(
  usernameList: string[],
  orgSlug: string | null
): Promise<Awaited<ReturnType<UserRepository["findUsersByUsername"]>>> {
  const userRepo = new UserRepository(prisma);

  const usersInOrgContext = await userRepo.findUsersByUsername({
    usernameList,
    orgSlug,
  });

  if (usersInOrgContext.length) {
    return usersInOrgContext;
  }

  return await userRepo.findPlatformMembersByUsernames({
    usernameList,
  });
}