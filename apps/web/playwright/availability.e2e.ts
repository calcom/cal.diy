import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import dayjs from "@calcom/dayjs";

import { test } from "./lib/fixtures";
import { localize } from "./lib/localize";
import { submitAndWaitForResponse } from "./lib/testUtils";

const SCHEDULE_UPDATE_URL = "/api/trpc/availability/schedule.update?batch=1";

/** Wait for a date override auto-save and assert the response status. */
async function waitForAutoSave(page: Page, trigger: () => Promise<void>) {
  const responsePromise = page.waitForResponse(SCHEDULE_UPDATE_URL);
  await trigger();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
}

test.describe.configure({ mode: "parallel" });

test.describe("Availability", () => {
  test.beforeEach(async ({ page, users }) => {
    const user = await users.create();
    await user.apiLogin();
    await page.goto("/availability");
    // We wait until loading is finished
    await page.waitForSelector('[data-testid="schedules"]');
  });

  test.afterEach(async ({ users }) => {
    await users.deleteAll();
  });

  test("Date Overrides", async ({ page }) => {
    await page.getByTestId("schedules").first().click();
    await page.locator('[data-testid="Sunday-switch"]').first().click();
    await page.locator('[data-testid="Saturday-switch"]').first().click();

    // Date overrides auto-save when added, so we wait for the API response
    // instead of clicking the Save button (which is disabled after auto-save)
    await waitForAutoSave(page, async () => {
      await page.getByTestId("add-override").click();
      await page.locator('[id="modal-title"]').waitFor();
      await page.getByTestId("incrementMonth").click();
      await page.locator('[data-testid="day"][data-disabled="false"]').first().click();
      await page.getByTestId("date-override-mark-unavailable").click();
      await page.getByTestId("add-override-submit-btn").click();
      await page.getByTestId("dialog-rejection").click();
      await expect(page.locator('[data-testid="date-overrides-list"] > li')).toHaveCount(1);
    });
    const nextMonth = dayjs().add(1, "month").startOf("month");
    const troubleshooterURL = `/availability/troubleshoot?date=${nextMonth.format("YYYY-MM-DD")}`;
    await page.goto(troubleshooterURL);
    await expect(page.locator('[data-testid="troubleshooter-busy-time"]')).toHaveCount(1);
  });

  test("it can delete date overrides", async ({ page }) => {
    await page.getByTestId("schedules").first().click();

    // Add first batch of overrides (auto-saves)
    await waitForAutoSave(page, async () => {
      await page.getByTestId("add-override").click();
      await page.locator('[id="modal-title"]').waitFor();
      // always go to the next month so there's enough slots regardless of current time.
      await page.getByTestId("incrementMonth").click();

      await page.locator('[data-testid="day"][data-disabled="false"]').first().click();
      await page.locator('[data-testid="day"][data-disabled="false"]').nth(4).click();
      await page.locator('[data-testid="day"][data-disabled="false"]').nth(12).click();
      await page.getByTestId("date-override-mark-unavailable").click();
      await page.getByTestId("add-override-submit-btn").click();
      await page.getByTestId("dialog-rejection").click();
      await expect(page.locator('[data-testid="date-overrides-list"] > li')).toHaveCount(3);
    });

    // Add another override (auto-saves)
    await waitForAutoSave(page, async () => {
      await page.getByTestId("add-override").click();
      await page.locator('[id="modal-title"]').waitFor();

      // always go to the next month so there's enough slots regardless of current time.
      await page.getByTestId("incrementMonth").click();

      await page.locator('[data-testid="day"][data-disabled="false"]').nth(2).click();
      await page.getByTestId("date-override-mark-unavailable").click();
      await page.getByTestId("add-override-submit-btn").click();
      await page.getByTestId("dialog-rejection").click();

      const dateOverrideList = page.locator('[data-testid="date-overrides-list"] > li');

      await expect(dateOverrideList).toHaveCount(4);
    });

    const dateOverrideList = page.locator('[data-testid="date-overrides-list"] > li');
    const deleteButton = dateOverrideList.nth(1).getByTestId("delete-button");
    // we cannot easily predict the title, as this changes throughout the year.
    const deleteButtonTitle = (await deleteButton.getAttribute("title")) as string;
    // press the delete button (should remove the .nth 1 element & trigger reorder)
    // Deleting a date override auto-saves
    await waitForAutoSave(page, async () => {
      await deleteButton.click();
    });

    await expect(dateOverrideList).toHaveCount(3);
    await expect(page.getByTitle(deleteButtonTitle)).toBeHidden();
  });

  test("Can create date override on current day in a negative timezone", async ({ page }) => {
    await page.getByTestId("schedules").first().click();
    // set time zone to New York
    await page
      .locator("#availability-form div")
      .filter({ hasText: "TimezoneEurope/London" })
      .locator("svg")
      .click();
    await page.locator("[id=timeZone-lg-viewport]").fill("New");
    await page.getByTestId("select-option-America/New_York").click();

    // Add override for today (auto-saves)
    await waitForAutoSave(page, async () => {
      await page.getByTestId("add-override").click();
      await page.locator('[id="modal-title"]').waitFor();
      await page.locator('[data-testid="day"][data-disabled="false"]').first().click();
      await page.getByTestId("add-override-submit-btn").click();
      await page.getByTestId("dialog-rejection").click();
    });

    await page.reload();
    await expect(page.locator('[data-testid="date-overrides-list"] > li')).toHaveCount(1);
  });

  test("Schedule listing", async ({ page }) => {
    await test.step("Can add a new schedule", async () => {
      await page.getByTestId("new-schedule").first().click();
      await page.locator('[id="name"]').fill("More working hours");
      page.locator('[type="submit"]').click();
      await expect(page.getByTestId("availability-title")).toHaveValue("More working hours");
    });
    await test.step("Can delete a schedule", async () => {
      await page.getByTestId("go-back-button").click();
      await page.locator('[data-testid="schedules"] > li').nth(1).getByTestId("schedule-more").click();
      await page.locator('[data-testid="delete-schedule"]').click();
      await submitAndWaitForResponse(page, "/api/trpc/availability/schedule.delete?batch=1", {
        action: () => page.locator('[data-testid="dialog-confirmation"]').click(),
      });
      await expect(page.locator('[data-testid="schedules"] > li').nth(1)).toHaveCount(0, { timeout: 0 });
    });
    await test.step("Cannot delete the last schedule", async () => {
      await page.locator('[data-testid="schedules"] > li').nth(0).getByTestId("schedule-more").click();
      await page.locator('[data-testid="delete-schedule"]').click();
      // FIXME: Check on toast to be present causes flakiness, cannot check for response since it's client side validated as well
      const toast = await page.waitForSelector('[data-testid="toast-error"]');
      expect(toast).toBeTruthy();
      await expect(page.locator('[data-testid="schedules"] > li').nth(0)).toHaveCount(1);
    });
  });

  test("Can manage single schedule", async ({ page }) => {
    await page.getByTestId("schedules").first().click();

    const sunday = (await localize("en"))("sunday");
    const monday = (await localize("en"))("monday");
    const wednesday = (await localize("en"))("wednesday");
    const saturday = (await localize("en"))("saturday");
    const save = (await localize("en"))("save");
    const copyTimesTo = (await localize("en"))("copy_times_to");

    const availTitle = page.getByTestId("availability-title");
    await availTitle.locator("xpath=..").locator("span.whitespace-pre").first().click();
    await expect(availTitle).toBeEditable();
    // change availability name
    await page.getByTestId("availability-title").fill("Working Hours test");
    await expect(page.getByTestId("subtitle").first()).toBeVisible();
    await page.getByTestId(sunday).getByRole("switch").click();
    await page.getByTestId(monday).first().click();
    await page.getByTestId(wednesday).getByRole("switch").click();
    await page.getByTestId(saturday).getByRole("switch").click();
    await page
      .locator("div")
      .filter({ hasText: "Sunday9:00am - 5:00pm" })
      .getByTestId("add-time-availability")
      .first()
      .click();
    await expect(page.locator("div").filter({ hasText: "6:00pm" }).nth(1)).toBeVisible();
    await page.getByRole("button", { name: save }).click();
    await expect(page.getByText("Sun - Tue, Thu - Sat, 9:00 AM - 5:00 PM")).toBeVisible();
    await expect(page.getByText("Sun, 5:00 PM - 6:00 PM")).toBeVisible();
    await page
      .locator("div")
      .filter({ hasText: "Sunday9:00am - 5:00pm" })
      .getByTestId("copy-button")
      .first()
      .click();
    await expect(page.getByText(copyTimesTo)).toBeVisible();
    await page.getByRole("checkbox", { name: monday }).check();
    await page.getByRole("button", { name: "Apply" }).click();
    await page.getByRole("button", { name: save }).click();
    await page
      .locator("#availability-form div")
      .filter({ hasText: "TimezoneEurope/London" })
      .locator("svg")
      .click();

    await page.locator("[id=timeZone-lg-viewport]").fill("Braz");
    await page.getByTestId("select-option-America/Sao_Paulo").click();
    await submitAndWaitForResponse(page, "/api/trpc/availability/schedule.update?batch=1");

    // Date overrides auto-save, so we wait for the API response directly
    await waitForAutoSave(page, async () => {
      await page.getByTestId("add-override").click();
      await page.getByTestId("incrementMonth").click();
      await page.getByRole("button", { name: "20" }).click();
      await page.getByTestId("date-override-mark-unavailable").click();
      await page.getByTestId("add-override-submit-btn").click();
      await page.getByTestId("dialog-rejection").click();
    });

    // Deleting a date override also auto-saves
    await waitForAutoSave(page, async () => {
      await page.getByTestId("date-overrides-list").getByRole("button").nth(1).click();
    });
  });
});
