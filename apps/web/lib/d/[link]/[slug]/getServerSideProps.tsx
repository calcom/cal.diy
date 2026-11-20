import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import type { GetBookingType } from "@calcom/features/bookings/lib/get-booking";
import {
  doesBookingOrSeatUidExist,
  getBookingForReschedule,
  getMultipleDurationValue,
} from "@calcom/features/bookings/lib/get-booking";
import { EventRepository } from "@calcom/features/eventtypes/repositories/EventRepository";
import { HashedLinkService } from "@calcom/features/hashedLink/lib/service/HashedLinkService";
import {
  shouldHideBrandingForTeamEvent,
  shouldHideBrandingForUserEvent,
} from "@calcom/features/profile/lib/hideBranding";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import slugify from "@calcom/lib/slugify";
import prisma from "@calcom/prisma";
import { RedirectType } from "@calcom/prisma/enums";
import { getRedirectWithOriginAndSearchString } from "@lib/handleOrgRedirect";
import type { inferSSRProps } from "@lib/types/inferSSRProps";
import type { EmbedProps } from "app/WithEmbedSSR";
import type { GetServerSidePropsContext } from "next";
import { z } from "zod";

export type PageProps = inferSSRProps<typeof getServerSideProps> & EmbedProps;

async function getUserPageProps(context: GetServerSidePropsContext) {
  const session = await getServerSession({ req: context.req });
  const { link, slug } = paramsSchema.parse(context.params);
  const { rescheduleUid, duration: queryDuration } = context.query;
  const currentOrgDomain = null;
  const isValidOrgDomain = false;
  const org = isValidOrgDomain ? currentOrgDomain : null;

  let name: string;
  let hideBranding = false;

  const notFound = {
    notFound: true,
  } as const;

  // Use centralized validation logic to avoid duplication
  const hashedLinkService = new HashedLinkService();
  try {
    await hashedLinkService.validate(link);
  } catch (_error) {
    // Link is expired, invalid, or doesn't exist
    return notFound;
  }

  // If validation passes, fetch the complete data needed for rendering
  const hashedLink = await hashedLinkService.findLinkWithDetails(link);

  if (!hashedLink) {
    return notFound;
  }

  const username = hashedLink.eventType.users[0]?.username;
  const profileUsername = hashedLink.eventType.users[0]?.profiles[0]?.username;

  if (hashedLink.eventType.team) {
    name = hashedLink.eventType.team.slug || "";
    hideBranding = shouldHideBrandingForTeamEvent({
      eventTypeId: hashedLink.eventTypeId,
      team: hashedLink.eventType.team,
    });
  } else {
    if (!username) {
      return notFound;
    }

    // Get just the origin and searchString from the redirect to ensure that we don't redirect to a URL that exposes the real path to book the user for any other events \
    // This is important for a private booking link
    // e.g. http://app.cal.com/d/sgdthj8mu4nsLNTYi3fW2p/demo -> should redirect to -> http://acme.cal.com/d/sgdthj8mu4nsLNTYi3fW2p/demo and not to http://acme.cal.com/john/demo(which exposes the real path to book the user for any other events)
    const redirectWithOriginAndSearchString = await getRedirectWithOriginAndSearchString({
      slugs: [username],
      redirectType: RedirectType.User,
      context,
      currentOrgDomain: isValidOrgDomain ? currentOrgDomain : null,
    });

    if (redirectWithOriginAndSearchString) {
      return {
        redirect: {
          permanent: false,
          // App Router doesn't have access to the current path directly, so we build it manually
          destination: `${redirectWithOriginAndSearchString.origin ?? ""}/d/${link}/${slug}${
            redirectWithOriginAndSearchString.searchString
          }`,
        },
      };
    }

    name = profileUsername || username;

    const userRepo = new UserRepository(prisma);
    const [user] = await userRepo.findUsersByUsername({
      usernameList: [name],
      orgSlug: org,
    });

    if (!user) {
      return notFound;
    }

    hideBranding = shouldHideBrandingForUserEvent({
      eventTypeId: hashedLink.eventTypeId,
      owner: user,
    });
  }

  let booking: GetBookingType | null = null;
  if (rescheduleUid) {
    booking = await getBookingForReschedule(`${rescheduleUid}`, session?.user?.id);
    // A null booking either means that the rescheduleUid doesn't belong to any
    // booking or booking seat, or that the booking exists but the current visitor
    // isn't allowed to reschedule it (e.g. a seated event where only the organizer
    // or a host can reschedule). An unknown rescheduleUid must not open the
    // booking flow - return 404.
    if (!booking && !(await doesBookingOrSeatUidExist(`${rescheduleUid}`))) {
      return notFound;
    }
  }

  const isTeamEvent = !!hashedLink.eventType?.team?.id;

  const eventData = await EventRepository.getPublicEvent(
    {
      username: name,
      eventSlug: slug,
      isTeamEvent,
      org,
      fromRedirectOfNonOrgLink: context.query.orgRedirection === "true",
    },
    session?.user?.id
  );

  if (!eventData) {
    return notFound;
  }

  const useApiV2 = false;

  return {
    props: {
      useApiV2,
      eventData,
      entity: eventData.entity,
      duration: getMultipleDurationValue(
        eventData.metadata?.multipleDuration,
        queryDuration,
        eventData.length
      ),
      durationConfig: eventData.metadata?.multipleDuration ?? [],
      booking,
      user: name,
      slug,
      isBrandingHidden: hideBranding,
      // Sending the team event from the server, because this template file
      // is reused for both team and user events.
      isTeamEvent,
      hashedLink: hashedLink?.link,
    },
  };
}

const paramsSchema = z.object({ link: z.string(), slug: z.string().transform((s) => slugify(s)) });

// Booker page fetches a tiny bit of data server side, to determine early
// whether the page should show an away state or dynamic booking not allowed.
export const getServerSideProps = async (context: GetServerSidePropsContext) => {
  return await getUserPageProps(context);
};
