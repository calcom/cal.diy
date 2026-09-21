import prisma from "@calcom/prisma";
import { unstable_cache } from "next/cache";
import { z } from "zod";

const computeInstallCountsFromDB = async (): Promise<Record<string, number>> => {
  const mostPopularApps = z.array(z.object({ appId: z.string(), installCount: z.number() })).parse(
    await prisma.$queryRaw`
    SELECT
      c."appId",
      COUNT(*)::integer AS "installCount"
    FROM
      "Credential" c
    WHERE
      c."appId" IS NOT NULL
    GROUP BY
      c."appId"
    ORDER BY
      "installCount" DESC
    `
  );
  return mostPopularApps.reduce(
    (acc, { appId, installCount }) => {
      acc[appId] = installCount;
      return acc;
    },
    {} as Record<string, number>
  );
};

const getInstallCountPerApp = async (): Promise<Record<string, number>> => {
  return unstable_cache(async () => computeInstallCountsFromDB(), ["app-install-counts"], {
    revalidate: 300,
    tags: ["app-install-counts"],
  })();
};

export default getInstallCountPerApp;
export { computeInstallCountsFromDB };
