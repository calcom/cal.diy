import prisma from "@calcom/prisma";
import { createLocalPath, requireAuthenticatedPage } from "app/_lib/pageAuthorization";
import type { PageProps } from "app/_types";
import type { Metadata } from "next";
import { copy } from "../_lib/copy";
import { BOOKING_EVENT_SLUG, SPACES, type SpaceSlug } from "../_lib/werko";
import BookingWizard, { type WizardSpace } from "./_components/BookingWizard";

const isSpaceSlug = (value: unknown): value is SpaceSlug =>
  typeof value === "string" && SPACES.some(({ slug }) => slug === value);

const Page = async ({ searchParams }: PageProps) => {
  const resolvedSearchParams = await searchParams;
  const session = await requireAuthenticatedPage(createLocalPath("/rezervace", resolvedSearchParams));

  // Each space is a Cal.diy user named after the space slug, with one hourly "rezervace" event type
  const rooms = await prisma.user.findMany({
    where: { username: { in: SPACES.map(({ slug }) => slug) } },
    select: {
      username: true,
      name: true,
      bio: true,
      eventTypes: { where: { slug: BOOKING_EVENT_SLUG }, select: { id: true } },
    },
  });

  const spaces: WizardSpace[] = SPACES.flatMap((space) => {
    const room = rooms.find(({ username }) => username === space.slug);
    const eventTypeId = room?.eventTypes[0]?.id;
    if (!room || !eventTypeId) return [];
    return [{ ...space, name: room.name ?? space.slug, description: room.bio ?? "", eventTypeId }];
  });

  const preselected = resolvedSearchParams.prostor;

  return (
    <BookingWizard
      spaces={spaces}
      initialSpace={isSpaceSlug(preselected) ? preselected : undefined}
      user={{ name: session.user.name ?? "", email: session.user.email ?? "" }}
    />
  );
};

export const metadata: Metadata = copy.metadata;

export default Page;
