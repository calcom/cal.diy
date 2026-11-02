import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { AIM_ONBOARDING_START } from "@calcom/features/auth/lib/onboardingUtils";
import { APP_NAME } from "@calcom/lib/constants";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { _generateMetadata } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export const generateMetadata = async () => {
  return await _generateMetadata(
    (t) => `${APP_NAME} - ${t("getting_started")}`,
    () => "",
    true,
    undefined,
    "/onboarding/getting-started"
  );
};

const ServerPage = async () => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });

  if (!session?.user?.id) {
    return redirect("/auth/login");
  }

  // AIM: the plan picker ("personal or team", pricing) never applies to advisors. Anyone who lands
  // here (old link, back button) goes to the calendar step instead.
  return redirect(AIM_ONBOARDING_START);
};

export default ServerPage;
