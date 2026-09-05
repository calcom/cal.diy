import { useFlagMap } from "@calcom/features/flags/context/provider";
import { CreationSource } from "@calcom/prisma/enums";
import { trpc } from "@calcom/trpc/react";
import { showToast } from "@calcom/ui/components/toast";
import { useState } from "react";
import type { OnboardingState } from "../store/onboarding-store";

export const useSubmitOnboarding = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flags = useFlagMap();

  const intentToCreateOrg = {
    mutate: () => {},
    mutateAsync: async (_input: Record<string, unknown>) => ({}) as { checkoutUrl?: string },
  };

  const submitOnboarding = async (
    store: OnboardingState,
    userEmail: string,
    invitesToSubmit: OnboardingState["invites"]
  ) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const {
        selectedPlan,
        organizationDetails,
        organizationBrand,
        teams,
        inviteRole,
        resetOnboarding,
        migratedMembers,
      } = store;

      if (selectedPlan !== "organization") {
        throw new Error("Only organization plan is currently supported");
      }

      const teamsData = teams
        .filter((team) => team.name.trim().length > 0)
        .map((team) => ({
          id: team.id,
          name: team.name,
          isBeingMigrated: team.isBeingMigrated,
          slug: team.slug,
        }));

      const invitedMembersData = invitesToSubmit
        .filter((invite) => invite.email.trim().length > 0)
        .map((invite) => {
          // If invite has a team name, try to find the team ID (for migrated teams)
          let teamId: number | undefined;
          let teamName: string | undefined;

          if (invite.team && invite.team.trim().length > 0) {
            const matchingTeam = teams.find((team) => team.name.toLowerCase() === invite.team.toLowerCase());
            if (matchingTeam?.isBeingMigrated && matchingTeam.id !== -1) {
              // Use team ID for migrated teams
              teamId = matchingTeam.id;
            } else {
              // Use team name for new teams (will be matched after creation)
              teamName = invite.team;
              teamId = -1;
            }
          }

          return {
            email: invite.email,
            teamName,
            teamId,
            role: inviteRole,
          };
        });

      const migratedMembersData = migratedMembers.map((member) => ({
        email: member.email,
        teamId: member.teamId,
        role: member.role,
      }));

      const allInvitedMembers = [...invitedMembersData, ...migratedMembersData];

      const result = await intentToCreateOrg.mutateAsync({
        name: organizationDetails.name,
        slug: organizationDetails.link,
        bio: organizationDetails.bio || null,
        logo: organizationBrand.logo,
        brandColor: organizationBrand.color,
        bannerUrl: organizationBrand.banner,
        orgOwnerEmail: userEmail,
        seats: null,
        pricePerSeat: null,
        isPlatform: false,
        creationSource: CreationSource.WEBAPP,
        teams: teamsData,
        invitedMembers: allInvitedMembers,
      });

      // If there's a checkout URL, redirect to Stripe (billing enabled flow)
      if (result?.checkoutUrl) {
        window.location.href = result?.checkoutUrl;
        return;
      }

      // No checkout URL means billing is disabled (self-hosted flow)
      // Organization has already been created by the backend
      showToast("Organization created successfully!", "success");
      // Set flag to show welcome modal after redirect

      // Check if this is a migration flow (user has already completed onboarding)
      const hasMigratedTeams = teams.some((team) => team.isBeingMigrated);
      if (hasMigratedTeams) {
        // Migration flow - user already completed onboarding, redirect to event-types
        resetOnboarding();
        window.location.href = "/event-types?newOrganizationModal=true";
      } else {
        // Regular flow - redirect to personal onboarding
        skipToPersonal(resetOnboarding);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create organization";
      setError(errorMessage);
      showToast(errorMessage, "error");
      console.error("Organization creation error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const skipToPersonal = (resetOnboarding: () => void) => {
    resetOnboarding();
    const gettingStartedPath = "/getting-started";
    // Use window.location.href for a full page reload to ensure JWT callback runs
    // without trigger="update", which will call autoMergeIdentities() and fetch org data
    window.location.href = gettingStartedPath;
  };

  return {
    submitOnboarding,
    skipToPersonal,
    isSubmitting,
    error,
  };
};
