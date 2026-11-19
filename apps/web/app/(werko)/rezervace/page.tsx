import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import prisma from "@calcom/prisma";
import { UserPermissionRole } from "@calcom/prisma/enums";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { createLocalPath } from "app/_lib/pageAuthorization";
import type { PageProps } from "app/_types";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { copy } from "../_lib/copy";
import { roomPath } from "../_lib/werko";
import RoomPicker from "./_components/RoomPicker";

const Page = async ({ searchParams }: PageProps) => {
  const resolvedSearchParams = await searchParams;
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id)
    redirect(
      `/prihlaseni?callbackUrl=${encodeURIComponent(createLocalPath("/rezervace", resolvedSearchParams))}`
    );

  const rooms = await prisma.user.findMany({
    where: { role: UserPermissionRole.ADMIN, username: { not: null }, locked: false },
    select: { username: true, name: true, bio: true, avatarUrl: true },
    orderBy: { id: "asc" },
  });

  const preselected = rooms.find(({ username }) => username === resolvedSearchParams.prostor);
  if (preselected?.username) redirect(roomPath(preselected.username));

  const spaces = rooms.flatMap(({ username, name, bio, avatarUrl }) =>
    username
      ? [{ username, name: name ?? username, description: bio ?? "", image: avatarUrl ?? undefined }]
      : []
  );

  return <RoomPicker spaces={spaces} />;
};

export const metadata: Metadata = copy.metadata;

export default Page;
