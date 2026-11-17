import { AppOnboardingSteps } from "@calcom/lib/apps/appOnboardingSteps";
import { getAppOnboardingUrl } from "./getAppOnboardingUrl";

export const getAppOnboardingRedirectUrl = (slug: string, teamId?: number) => {
  const url = getAppOnboardingUrl({ slug, teamId, step: AppOnboardingSteps.EVENT_TYPES_STEP });
  return encodeURIComponent(url);
};
