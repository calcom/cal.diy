import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import type { GetBookingType } from "@calcom/features/bookings/lib/get-booking";
import {
  doesBookingOrSeatUidExist,
  getBookingForReschedule,
  getBookingForSeatedEvent,
} from "@calcom/features/bookings/lib/get-booking";
import { getUsernameList } from "@calcom/features/eventtypes/lib/defaultEvents";
import type { getPublicEvent } from "@calcom/features/eventtypes/lib/getPublicEvent";
import { EventRepository } from "@calcom/features/eventtypes/repositories/EventRepository";
import { shouldHideBrandingForUserEvent } from "@calcom/features/profile/lib/hideBranding";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import slugify from "@calcom/lib/slugify";
import { prisma } from "@calcom/prisma";
import { BookingStatus, RedirectType } from "@calcom/prisma/enums";
import { handleOrgRedirect } from "@lib/handleOrgRedirect";
import { getUsersInOrgContext } from "@server/lib/[user]/getServerSideProps";
import type { GetServerSidePropsContext } from "next";
import type { Session } from "next-auth";
import { z } from "zod";

type Props = {
  eventData: NonNullable<Awaited<ReturnType<typeof getPublicEvent>>>;
  booking?: GetBookingType;
  rescheduleUid: string | null;
  bookingUid: string | null;
  user: string;
  slug: string;
  isBrandingHidden: boolean;
  isSEOIndexable: boolean | null;
  themeBasis: null | string;
  orgBannerUrl: null;
};

async function processReschedule({
  props,
  rescheduleUid,
  session,
  allowRescheduleForCancelledBooking,
}: {
  props: Props;
  session: Session | null;
  rescheduleUid: string | string[] | undefined;
  allowRescheduleForCancelledBooking?: boolean;
}) {
  if (!rescheduleUid) return;

  const booking = await getBookingForReschedule(`${rescheduleUid}`, session?.user?.id);

  if (booking?.eventType?.disableRescheduling) {
    return {
      redirect: {
        destination: `/booking/${rescheduleUid}`,
        permanent: false,
      },
    };
  }

  // A null booking either means that the rescheduleUid doesn't belong to any
  // booking or booking seat, or that the booking exists but the current visitor
  // isn't allowed to reschedule it (e.g. a seated event where only the organizer
  // or a host can reschedule). Only the former must not open the booking flow.
  if (booking === null && !(await doesBookingOrSeatUidExist(`${rescheduleUid}`))) {
    return {
      notFound: true,
    } as const;
  }

  // if no booking found, no eventTypeId (dynamic) or it matches this eventData - return void (success).
  if (
    booking === null ||
    !booking.eventTypeId ||
    (booking?.eventTypeId === props.eventData?.id &&
      (booking.status !== BookingStatus.CANCELLED ||
        allowRescheduleForCancelledBooking ||
        !!(props.eventData as any)?.allowReschedulingCancelledBookings))
  ) {
    props.booking = booking;
    props.rescheduleUid = Array.isArray(rescheduleUid) ? rescheduleUid[0] : rescheduleUid;
    return;
  }
  // handle redirect response
  const redirectEventTypeTarget = await prisma.eventType.findUnique({
    where: {
      id: booking.eventTypeId,
    },
    select: {
      slug: true,
    },
  });
  if (!redirectEventTypeTarget) {
    return {
      notFound: true,
    } as const;
  }
  return {
    redirect: {
      permanent: false,
      destination: redirectEventTypeTarget.slug,
    },
  };
}

async function processSeatedEvent({
  props,
  bookingUid,
  allowRescheduleForCancelledBooking,
}: {
  props: Props;
  bookingUid: string | string[] | undefined;
  allowRescheduleForCancelledBooking?: boolean;
}) {
  if (!bookingUid) return;
  const booking = await getBookingForSeatedEvent(`${bookingUid}`);
  if (booking?.status === BookingStatus.CANCELLED && !allowRescheduleForCancelledBooking) {
    return {
      redirect: {
        permanent: false,
        destination: `${props.slug}`,
      },
    };
  } else {
    props.booking = booking;
    props.bookingUid = Array.isArray(bookingUid) ? bookingUid[0] : bookingUid;
  }
}

async function getDynamicGroupPageProps(context: GetServerSidePropsContext) {
  const session = await getServerSession({ req: context.req });
  const { user: usernames, type: slug } = paramsSchema.parse(context.params);
  const { rescheduleUid, bookingUid } = context.query;
  const allowRescheduleForCancelledBooking = context.query.allowRescheduleForCancelledBooking === "true";
  const currentOrgDomain = null;
  const isValidOrgDomain = false;
  const org = isValidOrgDomain ? currentOrgDomain : null;

  const redirect = await handleOrgRedirect({
    slugs: usernames,
    redirectType: RedirectType.User,
    eventTypeSlug: slug,
    context,
    currentOrgDomain: org,
  });

  if (redirect) {
    return redirect;
  }

  const userRepo = new UserRepository(prisma);
  const usersInOrgContext = await userRepo.findUsersByUsername({
    usernameList: usernames,
    orgSlug: isValidOrgDomain ? currentOrgDomain : null,
  });

  const users = usersInOrgContext;

  if (!users.length) {
    return {
      notFound: true,
    } as const;
  }

  // We use this to both prefetch the query on the server,
  // as well as to check if the event exist, so we c an show a 404 otherwise.

  const eventData = await EventRepository.getPublicEvent(
    {
      username: usernames.join("+"),
      eventSlug: slug,
      org,
      fromRedirectOfNonOrgLink: context.query.orgRedirection === "true",
    },
    session?.user?.id
  );

  if (!eventData) {
    return {
      notFound: true,
    } as const;
  }

  const props: Props = {
    eventData: {
      ...eventData,
      metadata: {
        ...eventData.metadata,
        multipleDuration: [15, 30, 45, 60, 90],
      },
    },
    user: usernames.join("+"),
    slug,
    isBrandingHidden: false,
    isSEOIndexable: true,
    themeBasis: null,
    bookingUid: bookingUid ? `${bookingUid}` : null,
    rescheduleUid: null,
    orgBannerUrl: null,
  };

  if (rescheduleUid) {
    const processRescheduleResult = await processReschedule({
      props,
      rescheduleUid,
      session,
      allowRescheduleForCancelledBooking,
    });
    if (processRescheduleResult) {
      return processRescheduleResult;
    }
  } else if (bookingUid) {
    const processSeatResult = await processSeatedEvent({
      props,
      bookingUid,
      allowRescheduleForCancelledBooking,
    });
    if (processSeatResult) {
      return processSeatResult;
    }
  }

  return {
    props,
  };
}

async function getUserPageProps(context: GetServerSidePropsContext) {
  const session = await getServerSession({ req: context.req });
  const { user: usernames, type: slug } = paramsSchema.parse(context.params);
  const username = usernames[0];
  const { rescheduleUid, bookingUid } = context.query;
  const allowRescheduleForCancelledBooking = context.query.allowRescheduleForCancelledBooking === "true";
  const currentOrgDomain = null;
  const isValidOrgDomain = false;

  const redirect = await handleOrgRedirect({
    slugs: usernames,
    redirectType: RedirectType.User,
    eventTypeSlug: slug,
    context,
    currentOrgDomain: isValidOrgDomain ? currentOrgDomain : null,
  });

  if (redirect) {
    return redirect;
  }

  const [user] = await getUsersInOrgContext([username], isValidOrgDomain ? currentOrgDomain : null);

  if (!user) {
    return {
      notFound: true,
    } as const;
  }

  const org = isValidOrgDomain ? currentOrgDomain : null;

  // We use this to both prefetch the query on the server,
  // as well as to check if the event exist, so we can show a 404 otherwise.
  const eventData = await EventRepository.getPublicEvent(
    {
      username,
      eventSlug: slug,
      org,
      fromRedirectOfNonOrgLink: context.query.orgRedirection === "true",
    },
    session?.user?.id
  );

  if (!eventData) {
    return {
      notFound: true,
    } as const;
  }

  const allowSEOIndexing = org
    ? user?.profile?.organization?.organizationSettings?.allowSEOIndexing
      ? user?.allowSEOIndexing
      : false
    : user?.allowSEOIndexing;

  const props: Props = {
    eventData: eventData,
    user: username,
    slug,
    isBrandingHidden: shouldHideBrandingForUserEvent({
      eventTypeId: eventData.id,
      owner: user,
    }),
    isSEOIndexable: allowSEOIndexing,
    themeBasis: username,
    bookingUid: bookingUid ? `${bookingUid}` : null,
    rescheduleUid: null,
    orgBannerUrl: eventData?.owner?.profile?.organization?.bannerUrl ?? null,
  };
  if (rescheduleUid) {
    const processRescheduleResult = await processReschedule({
      props,
      rescheduleUid,
      session,
      allowRescheduleForCancelledBooking,
    });
    if (processRescheduleResult) {
      return processRescheduleResult;
    }
  } else if (bookingUid) {
    const processSeatResult = await processSeatedEvent({
      props,
      bookingUid,
      allowRescheduleForCancelledBooking,
    });
    if (processSeatResult) {
      return processSeatResult;
    }
  }

  return {
    props,
  };
}

const paramsSchema = z.object({
  type: z.string().transform((s) => slugify(s)),
  user: z.string().transform((s) => getUsernameList(s)),
});

// Booker page fetches a tiny bit of data server side, to determine early
// whether the page should show an away state or dynamic booking not allowed.
export const getServerSideProps = async (context: GetServerSidePropsContext) => {
  const { user } = paramsSchema.parse(context.params);
  const isDynamicGroup = user.length > 1;

  return isDynamicGroup ? await getDynamicGroupPageProps(context) : await getUserPageProps(context);
};
