import { describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  team: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@calcom/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("./repositories/PrismaCredentialRepository", () => ({
  PrismaCredentialRepository: vi.fn().mockImplementation(function PrismaCredentialRepository() {
    return {
      findNonDelegationCredentialsByAppCategories: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock("@calcom/app-store/delegationCredential", () => ({
  enrichUserWithDelegationConferencingCredentialsWithoutOrgId: vi.fn().mockResolvedValue({
    credentials: [],
  }),
}));

vi.mock("./locations", () => ({
  defaultLocations: [],
}));

const integrationsMock = vi.hoisted(() => vi.fn());
vi.mock("./_utils/getEnabledAppsFromCredentials", () => ({
  default: integrationsMock,
}));

import { getLocationGroupedOptions } from "./server";

const t = ((key: string) => key) as unknown as import("i18next").TFunction;

function makeVideoApp({
  slug,
  category,
  value,
  teamNames,
}: {
  slug: string;
  category: string;
  value: string;
  teamNames: (string | undefined)[];
}) {
  return {
    slug,
    logo: `${slug}-logo.png`,
    categories: [category],
    category,
    locationOption: { label: `${slug} label`, value },
    credentials: teamNames.map((name) => ({ team: name ? { name } : undefined })),
  };
}

describe("getLocationGroupedOptions", () => {
  it("de-duplicates options with the same value within a category instead of accumulating duplicates", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 1 });

    // Same app, same value, reached through three separate credentials (e.g. three
    // teams sharing one video integration) — this is the shape that made the old
    // `apps[groupByCategory].find(...)` scan grow quadratically with credential count.
    integrationsMock.mockResolvedValue([
      makeVideoApp({
        slug: "daily-video",
        category: "conferencing",
        value: "integrations:daily",
        teamNames: ["Team A", "Team B", "Team C"],
      }),
    ]);

    const result = await getLocationGroupedOptions({ userId: 1 }, t);

    const conferencingGroup = result.find((group) => group.label === "conferencing");
    expect(conferencingGroup).toBeDefined();
    const values = conferencingGroup!.options.map((o) => o.value);
    // All three credentials share the same option `value`, so only the first
    // encountered option should survive the de-dup pass.
    expect(values).toEqual(["integrations:daily"]);
  });

  it("keeps distinct option values within the same category", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 1 });

    integrationsMock.mockResolvedValue([
      makeVideoApp({
        slug: "daily-video",
        category: "conferencing",
        value: "integrations:daily",
        teamNames: [undefined],
      }),
      makeVideoApp({
        slug: "zoom",
        category: "conferencing",
        value: "integrations:zoom",
        teamNames: [undefined],
      }),
    ]);

    const result = await getLocationGroupedOptions({ userId: 1 }, t);

    const conferencingGroup = result.find((group) => group.label === "conferencing");
    const values = conferencingGroup!.options.map((o) => o.value);
    expect(values.sort()).toEqual(["integrations:daily", "integrations:zoom"]);
  });
});
