import { _generateMetadata } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { APP_NAME } from "@calcom/lib/constants";

import { buildLegacyRequest } from "@lib/buildLegacyCtx";

import { PersonalSettingsView } from "~/onboarding/personal/settings/personal-settings-view";

export const generateMetadata = async () => {
  return await _generateMetadata(
    (t) => `${APP_NAME} - ${t("personal_settings")}`,
    () => "",
    true,
    undefined,
    "/onboarding/personal/settings"
  );
};

const ServerPage = async () => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });

  if (!session?.user?.id) {
    return redirect("/auth/login");
  }

  const userEmail = session.user.email || "";
  const userName = session.user.name || "";
  return <PersonalSettingsView userEmail={userEmail} userName={userName} />;
};

export default ServerPage;
