import { FeaturesRepository } from "@calcom/features/flags/features.repository";
import { prisma } from "@calcom/prisma";
import { redirect } from "next/navigation";
import { keepClientsInPortal } from "../../(werko)/_lib/clientGuard";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await keepClientsInPortal();
  const featuresRepository = new FeaturesRepository(prisma);
  const isOnboardingV3Enabled = await featuresRepository.checkIfFeatureIsEnabledGlobally("onboarding-v3");

  if (!isOnboardingV3Enabled) {
    redirect("/getting-started");
  }

  return <>{children}</>;
}
