import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";

/** Logged-in user for the Werk|0 header's profile menu (layouts pass it to PortalHeaderView) */
export const getPortalUser = async () => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  return session?.user ?? null;
};
