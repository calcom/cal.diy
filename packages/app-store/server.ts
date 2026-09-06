import type { TFunction } from "i18next";

import { enrichUserWithDelegationConferencingCredentialsWithoutOrgId } from "@calcom/app-store/delegationCredential";
import { defaultVideoAppCategories } from "@calcom/app-store/utils";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { AppCategories } from "@calcom/prisma/enums";
import { PrismaCredentialRepository } from "./repositories/PrismaCredentialRepository";

import getEnabledAppsFromCredentials from "./_utils/getEnabledAppsFromCredentials";
import { defaultLocations } from "./locations";

export async function getLocationGroupedOptions(
  userOrTeamId: { userId: number } | { teamId: number },
  t: TFunction
) {
  const apps: Record<
    string,
    {
      label: string;
      value: string;
      disabled?: boolean;
      icon?: string;
      slug?: string;
      credentialId?: number;
      supportsCustomLabel?: boolean;
    }[]
  > = {};
  const seenOptionsByCategory: Record<string, Set<string>> = {};

  // don't default to {}, when you do TS no longer determines the right types.
  let idToSearchObject: Prisma.CredentialWhereInput;
  let user = null;
  if ("teamId" in userOrTeamId) {
    const teamId = userOrTeamId.teamId;
    // See if the team event belongs to an org
    const org = await prisma.team.findFirst({
      where: {
        children: {
          some: {
            id: teamId,
          },
        },
      },
    });

    if (org) {
      idToSearchObject = {
        teamId: {
          in: [teamId, org.id],
        },
      };
    } else {
      idToSearchObject = { teamId };
    }
  } else {
    idToSearchObject = { userId: userOrTeamId.userId };
    user = await prisma.user.findUnique({
      where: {
        id: userOrTeamId.userId,
      },
    });
  }

  const credentialRepository = new PrismaCredentialRepository(prisma);  
  const nonDelegationCredentials = await credentialRepository.findNonDelegationCredentialsByAppCategories({  
    idToSearchObject,
    appCategories: defaultVideoAppCategories,  
  });

  let credentials;
  if (user) {
    // We only add delegationCredentials if the request for location options is for a user because DelegationCredential Credential is applicable to Users only.
    const { credentials: allCredentials } = await enrichUserWithDelegationConferencingCredentialsWithoutOrgId(
      {
        user: {
          ...user,
          credentials: nonDelegationCredentials,
        },
      }
    );
    credentials = allCredentials;
  } else {
    credentials = nonDelegationCredentials;  
  }

  const integrations = await getEnabledAppsFromCredentials(credentials, { filterOnCredentials: true });

  integrations.forEach((app) => {
    // All apps that are labeled as a locationOption are video apps.
    if (app.locationOption) {
      // All apps that are labeled as a locationOption are video apps. Extract the secondary category if available
      let groupByCategory =
        app.categories.length >= 2
          ? app.categories.find((groupByCategory) => !defaultVideoAppCategories.includes(groupByCategory))
          : app.categories[0] || app.category;
      if (!groupByCategory) groupByCategory = AppCategories.conferencing;

      for (const { teamName } of app.credentials.map((credential) => ({
        teamName: credential.team?.name,
      }))) {
        const label = `${app.locationOption.label} ${teamName ? `(${teamName})` : ""}`;
        const option = {
          ...app.locationOption,
          label,
          icon: app.logo,
          slug: app.slug,
          ...(app.credential
            ? { credentialId: app.credential.id, teamName: app.credential.team?.name ?? null }
            : {}),
        };
        if (!seenOptionsByCategory[groupByCategory]) {
          seenOptionsByCategory[groupByCategory] = new Set();
          apps[groupByCategory] = [];
        }
        if (!seenOptionsByCategory[groupByCategory].has(option.value)) {
          seenOptionsByCategory[groupByCategory].add(option.value);
          apps[groupByCategory].push(option);
        }
      }
    }
  });

  defaultLocations.forEach((l) => {
    const category = l.category;
    if (apps[category]) {
      apps[category] = [
        ...apps[category],
        {
          label: l.label,
          value: l.type,
          icon: l.iconUrl,
          supportsCustomLabel: l.supportsCustomLabel,
        },
      ];
    } else {
      apps[category] = [
        {
          label: l.label,
          value: l.type,
          icon: l.iconUrl,
          supportsCustomLabel: l.supportsCustomLabel,
        },
      ];
    }
  });
  const locations = [];

  // Translating labels and pushing into array
  for (const category in apps) {
    const tmp = {
      label: t(category),
      options: apps[category].map((l) => ({
        ...l,
        label: t(l.label),
      })),
    };

    locations.push(tmp);
  }

  return locations;
}
