import { IdentityProvider } from "@calcom/prisma/enums";
import { expect } from "@playwright/test";
import { test } from "./lib/fixtures";

test.describe.configure({ mode: "parallel" });

test.afterEach(({ users }) => users.deleteAll());

test.describe("Onboarding", () => {
  const testOnboarding = (identityProvider: IdentityProvider) => {
    test(`Onboarding Flow (v3) - ${identityProvider} user`, async ({ page, users }) => {
      const user = await users.create({
        completedOnboarding: false,
        name: null,
        identityProvider,
      });
      await user.apiLogin();
      await page.goto("/onboarding/getting-started");
      await page.waitForURL(/.*\/onboarding\/personal\/settings/);

      await test.step("step 1 - Personal Settings", async () => {
        const nameInput = page.locator('input[name="name"]');
        await nameInput.fill("new user 2");
        await page.locator('button[type="submit"]').click();
        await page.waitForURL(/.*\/onboarding\/personal\/calendar/);

        const userComplete = await user.self();
        expect(userComplete.name).toBe("new user 2");
      });

      await test.step("step 2 - Calendar Connection", async () => {
        await expect(page.getByTestId("onboarding-continue-btn")).toBeVisible();
        await page.getByTestId("onboarding-continue-btn").click();
        await page.waitForURL("/event-types**");

        const userComplete = await user.self();
        expect(userComplete.completedOnboarding).toBe(true);
      });
    });
  };

  testOnboarding(IdentityProvider.GOOGLE);
  testOnboarding(IdentityProvider.CAL);
  testOnboarding(IdentityProvider.SAML);
  testOnboarding(IdentityProvider.AZUREAD);
});
