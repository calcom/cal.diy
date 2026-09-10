import { expect } from "@playwright/test";

import { bookTimeSlot, selectFirstAvailableTimeSlotNextMonth } from "@calcom/web/playwright/lib/testUtils";

import { test } from "./lib/fixtures";

test.describe.configure({ mode: "parallel" });

test.describe("Payment", () => {
  test.describe("user", () => {
    test.afterEach(async ({ users }) => {
      await users.deleteAll();
    });

    test("should create a mock payment for a user", async ({ context, users, page }) => {
      test.skip(process.env.MOCK_PAYMENT_APP_ENABLED === undefined, "Skipped as Stripe is not installed");

      const user = await users.create();
      await user.apiLogin();
      await page.goto("/apps");

      await page.getByPlaceholder("Search").click();
      await page.getByPlaceholder("Search").fill("mock");

      await page.getByTestId("install-app-button").click();

      await page.waitForURL((url) => url.pathname.endsWith("/apps/installed/payment"));

      await page.getByRole("link", { name: "Event Types" }).click();

      await page.getByRole("link", { name: /^30 min/ }).click();
      await page.getByTestId("vertical-tab-apps").click();
      await page.locator("#event-type-form").getByRole("switch").click();
      await page.getByPlaceholder("Price").click();
      await page.getByPlaceholder("Price").fill("1");

      await page.locator("#test-mock-payment-app-currency-id").click();
      await page.getByTestId("select-option-USD").click();

      await page.getByTestId("update-eventtype").click();

      await page.goto(`${user.username}/30-min`);

      await selectFirstAvailableTimeSlotNextMonth(page);
      await bookTimeSlot(page);
      await page.waitForURL((url) => url.pathname.includes("/payment/"));

      const dataNextJsRouter = await page.evaluate(() =>
        window.document.documentElement.getAttribute("data-nextjs-router")
      );

      expect(dataNextJsRouter).toEqual("app");

      await page.getByText("Payment", { exact: true }).waitFor();

      // The page must render the real payment and booking data, not placeholders
      await expect(page.getByText("$1.00").first()).toBeVisible();
      await expect(page.getByText(/30 min/).first()).toBeVisible();
    });
  });
});
