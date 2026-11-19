import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { UserPermissionRole } from "@calcom/prisma/enums";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

/** Where a client (non-admin) lands instead of the Cal.diy admin */
export const CLIENT_HOME = "/moje-rezervace";

/**
 * Werk|0 rule: only ADMIN users (devx/Werk|0 staff) use the Cal.diy admin; logged-in clients are sent
 * to their Werk|0 bookings page. Logged-out visitors fall through to the page's own login redirect.
 */
export const keepClientsInPortal = async () => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (session?.user?.id && session.user.role !== UserPermissionRole.ADMIN) redirect(CLIENT_HOME);
};
