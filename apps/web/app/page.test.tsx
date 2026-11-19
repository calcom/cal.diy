import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { checkOnboardingRedirect } from "@calcom/features/auth/lib/onboardingUtils";
import { getTranslation } from "@calcom/i18n/server";
import { UserPermissionRole } from "@calcom/prisma/enums";
import { cleanup, render, screen } from "@testing-library/react";
import { getPublicEventCatalog } from "app/_lib/getPublicEventCatalog";
import { getTranslate } from "app/_utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";

vi.mock("@calcom/features/auth/lib/onboardingUtils", () => ({
  checkOnboardingRedirect: vi.fn(),
}));

vi.mock("@calcom/features/auth/lib/getServerSession", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@lib/buildLegacyCtx", () => ({
  buildLegacyRequest: vi.fn(() => ({ req: {} })),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({})),
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("app/_lib/getPublicEventCatalog", () => ({
  getPublicEventCatalog: vi.fn(),
}));

vi.mock("next/font/google", () => {
  const font = () => ({ className: "", variable: "", style: { fontFamily: "" } });
  return { Archivo: font, Archivo_Narrow: font };
});

vi.mock("app/_utils", () => ({
  getTranslate: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(getServerSession).mockResolvedValue(null);
  vi.mocked(checkOnboardingRedirect).mockResolvedValue(null);
});

describe("HomePage", () => {
  it("redirects signed-in users to the app after onboarding checks", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: 42, role: UserPermissionRole.ADMIN, profile: { organizationId: null } },
    } as Awaited<ReturnType<typeof getServerSession>>);
    vi.mocked(checkOnboardingRedirect).mockResolvedValue(null);

    await expect(HomePage()).rejects.toThrow("REDIRECT:/event-types");

    expect(checkOnboardingRedirect).toHaveBeenCalledWith(42, {
      checkEmailVerification: true,
      organizationId: null,
    });
    expect(getPublicEventCatalog).not.toHaveBeenCalled();
  });

  it("sends signed-in users to onboarding when required", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: 42, role: UserPermissionRole.USER, profile: { organizationId: null } },
    } as Awaited<ReturnType<typeof getServerSession>>);
    vi.mocked(checkOnboardingRedirect).mockResolvedValue("/onboarding/getting-started");

    await expect(HomePage()).rejects.toThrow("REDIRECT:/onboarding/getting-started");

    expect(getPublicEventCatalog).not.toHaveBeenCalled();
  });

  it("keeps the public catalog available to signed-in users", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: 42, role: UserPermissionRole.USER, profile: { organizationId: null } },
    } as Awaited<ReturnType<typeof getServerSession>>);
    vi.mocked(getPublicEventCatalog).mockResolvedValue([]);
    vi.mocked(getTranslate).mockResolvedValue(await getTranslation("en", "common"));

    render(await HomePage());

    expect(screen.getByRole("link", { name: "Sign out" })).toHaveAttribute(
      "href",
      "/api/authentik-logout?callbackUrl=%2F"
    );
    expect(getPublicEventCatalog).toHaveBeenCalled();
  });

  it("shows public booking links to visitors", async () => {
    vi.mocked(getPublicEventCatalog).mockResolvedValue([
      {
        title: "Consultation",
        description: "Talk with our team",
        length: 30,
        href: "/jane/consultation",
        host: "Jane Doe (@jane)",
      },
    ]);
    vi.mocked(getTranslate).mockResolvedValue(await getTranslation("en", "common"));

    render(await HomePage());

    expect(screen.getByRole("heading", { name: "Available events" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/login");
    expect(screen.getByRole("link", { name: "Consultation" })).toHaveAttribute("href", "/jane/consultation");
    expect(screen.getByText("Host: Jane Doe (@jane)")).toBeInTheDocument();
    expect(screen.getByText("Talk with our team")).toBeInTheDocument();
  });

  it("shows the localized empty state when no public event exists", async () => {
    vi.mocked(getPublicEventCatalog).mockResolvedValue([]);
    vi.mocked(getTranslate).mockResolvedValue(await getTranslation("cs", "common"));

    render(await HomePage());

    expect(screen.getByRole("heading", { name: "Dostupné události" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Přihlásit se" })).toHaveAttribute("href", "/auth/login");
    expect(screen.getByText("Momentálně nejsou k dispozici žádné veřejné události.")).toBeInTheDocument();
  });
});
