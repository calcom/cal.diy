import { expect } from "@playwright/test";
import { test } from "./lib/fixtures";
import { submitAndWaitForResponse } from "./lib/testUtils";

test.describe.configure({ mode: "parallel" });

const TESTING_USERNAMES = [
  {
    username: "demousernamex",
    description: "",
  },
  {
    username: "demo.username",
    description: " to include periods(or dots)",
  },
];

test.describe("Change username on settings", () => {
  test.afterEach(async ({ users }) => {
    await users.deleteAll();
  });

  TESTING_USERNAMES.forEach((item) => {
    test(`User can change username${item.description}`, async ({ page, users, prisma }) => {
      const user = await users.create();
      await user.apiLogin();
      // Try to go homepage
      await page.goto("/settings/my-account/profile");
      // Change username from normal to normal
      const usernameInput = page.locator("[data-testid=username-input]");

      await usernameInput.fill(item.username);
      await page.click("[data-testid=update-username-btn]");
      await submitAndWaitForResponse(page, "/api/trpc/me/updateProfile?batch=1", {
        action: () => page.click("[data-testid=save-username]"),
      });

      const newUpdatedUser = await prisma.user.findUniqueOrThrow({
        where: {
          id: user.id,
        },
      });

      expect(newUpdatedUser.username).toBe(item.username);
    });
  });
});
