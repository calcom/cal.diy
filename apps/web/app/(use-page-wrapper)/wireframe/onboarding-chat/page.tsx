import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { _generateMetadata } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { OnboardingChatView } from "~/wireframe/onboarding-chat/chat-components";

export const generateMetadata = async () => {
  return await _generateMetadata(
    (t) => t("onboarding_chat_page_title"),
    () => "",
    true,
    undefined,
    "/wireframe/onboarding-chat"
  );
};

const Page = async () => {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });

  if (!session?.user?.id) {
    return redirect("/auth/login");
  }

  return <OnboardingChatView userEmail={session.user.email ?? ""} />;
};

export default Page;
