import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { DEFAULT_SCHEDULE } from "@calcom/lib/availability";
import { availabilityRouter } from "@calcom/trpc/server/routers/viewer/availability/_router";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { createRouterCaller } from "app/_trpc/context";
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

  const availabilityCaller = await createRouterCaller(availabilityRouter);

  let scheduleId: number | null = null;
  let initialAvailability = DEFAULT_SCHEDULE;

  try {
    const schedule = await availabilityCaller.schedule.get({});
    scheduleId = schedule.id;
    initialAvailability = schedule.availability;
  } catch {
    // New accounts may not have a default schedule provisioned yet - fall back to the
    // standard Mon-Fri 9-5 starter schedule; the chat flow creates one on save.
  }

  return (
    <OnboardingChatView
      userEmail={session.user.email ?? ""}
      scheduleId={scheduleId}
      initialAvailability={initialAvailability}
    />
  );
};

export default Page;
