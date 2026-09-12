import { getFeatureRepository } from "@calcom/features/di/containers/FeatureRepository";
import { getFeaturesRepository } from "@calcom/features/di/containers/FeaturesRepository";
import type { AppFlags } from "@calcom/features/flags/config";
import publicProcedure from "@calcom/trpc/server/procedures/publicProcedure";
import { router } from "@calcom/trpc/server/trpc";
import { z } from "zod";
import { map } from "./map";

export const featureFlagRouter = router({
  list: publicProcedure.query(async () => {
    const featureRepository = getFeatureRepository();
    return featureRepository.findAll();
  }),
  checkTeamFeature: publicProcedure
    .input(
      z.object({
        teamId: z.number(),
        feature: z.string(),
      })
    )
    .query(async ({ input }) => {
      const featuresRepository = getFeaturesRepository();
      return featuresRepository.checkIfTeamHasFeature(input.teamId, input.feature as keyof AppFlags);
    }),
  map,
});
