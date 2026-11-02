import type { Page } from "@playwright/test";
import { fakeHolidayDate } from "./support/fake-servers";
import { hasFakes, signUp } from "./support/helpers";
import { expect, newClientContext, test } from "./support/test";

/** The first bookable time shown next month, in the visitor's time zone. */
async function firstSlotNextMonth(page: Page, username: string): Promise<string> {
  await page.goto(`/${username}/30min`);
  await page.getByRole("button", { name: "View next month" }).click();
  await page.locator("td button:not([disabled])").first().click();
  return page.locator("ul li button").first().innerText();
}

function nextMonthRange(): { start: string; end: string } {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0));
  return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) };
}

/**
 * A trip covering all of next month. It starts a week early because the host's hours on the day
 * before the 1st can already fall on the 1st in the guest's time zone, the first day the guest sees.
 */
function tripCoveringNextMonth(): { start: string; end: string } {
  const { end } = nextMonthRange();
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1 - 7));
  return { start: start.toISOString().slice(0, 10), end };
}

test("general settings reach the dashboard and the public booking page", async ({ page, browser }) => {
  const { username } = await signUp(page);
  await page.goto("/settings/my-account/general");
  await page.getByLabel("Time format").selectOption({ label: "24-hour" });
  await page.getByLabel("Start of week").selectOption({ label: "Monday" });
  await page.getByText("Allow search engine indexing").click();
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByRole("status")).toHaveText("Settings updated successfully");

  await page.goto("/availability");
  await expect(page.getByText(/09:00 - 17:00/).first()).toBeVisible();

  const guest = await (await newClientContext(browser, { locale: "en-US" })).newPage();
  await guest.goto(`/${username}/30min`);
  await expect(guest.locator("thead th").first()).toHaveText(/mon/i);
  await expect(guest.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
});

test("guests can switch the booking page between 12- and 24-hour times", async ({ page, browser }) => {
  const { username } = await signUp(page);
  const guest = await (await newClientContext(browser, { locale: "en-US" })).newPage();
  const twelveHour = await firstSlotNextMonth(guest, username);
  expect(twelveHour).toMatch(/AM|PM/);
  await guest.getByRole("button", { name: "24h" }).click();
  await expect(guest.locator("ul li button").first()).not.toContainText(/AM|PM/);
  // The choice is remembered for the next visit.
  expect(await firstSlotNextMonth(guest, username)).not.toMatch(/AM|PM/);
});

test("a trip moves the host's working hours into the travel time zone", async ({ browser }) => {
  const host = await (await newClientContext(browser, { timezoneId: "Europe/London" })).newPage();
  const { username } = await signUp(host);
  const guestContext = await newClientContext(browser, { timezoneId: "Asia/Tokyo", locale: "en-US" });
  const guest = await guestContext.newPage();
  expect(await firstSlotNextMonth(guest, username)).not.toBe("9:00 AM");

  const { start, end } = tripCoveringNextMonth();
  await host.goto("/settings/my-account/general");
  await host.getByRole("button", { name: "Schedule timezone change" }).click();
  await host.getByLabel("Date", { exact: true }).fill(start);
  await host.getByLabel("To", { exact: true }).fill(end);
  await host.getByLabel("Timezone", { exact: true }).selectOption("Asia/Tokyo");
  await host.getByRole("button", { name: "Add" }).click();
  await expect(host.getByTestId("travel-schedules")).toContainText("Asia/Tokyo");

  expect(await firstSlotNextMonth(guest, username)).toBe("9:00 AM");

  await host.getByTestId("travel-schedules").getByRole("button", { name: "Delete" }).click();
  await expect(host.getByTestId("travel-schedules")).toBeHidden();
});

test("appearance settings theme the dashboard and brand the booking page", async ({ page, browser }) => {
  const { username } = await signUp(page);
  const guest = await (await newClientContext(browser)).newPage();
  await guest.goto(`/${username}/30min`);
  await expect(guest.getByText("powered by")).toBeVisible();

  await page.goto("/settings/my-account/appearance");
  await page.getByRole("group", { name: "Dashboard theme" }).getByLabel("Dark").check();
  await page.getByRole("group", { name: "Booking page theme" }).getByLabel("Light").check();
  await page.getByLabel("Brand color (light theme) (hex)").fill("#1d4ed8");
  await page.getByText("Disable Cal.diy branding").click();
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByRole("status")).toHaveText("Settings updated successfully");
  await expect(page.locator("div.dark").first()).toBeVisible();

  await guest.goto(`/${username}/30min`);
  await expect(guest.getByText("powered by")).toHaveCount(0);
  await guest.getByRole("button", { name: "View next month" }).click();
  const day = guest.locator("td button:not([disabled])").first();
  await day.click();
  await expect(day).toHaveCSS("background-color", "rgb(29, 78, 216)");
  await expect(guest.locator("div.dark")).toHaveCount(0);
});

test("a low-contrast brand color gets Cal's warning", async ({ page }) => {
  await signUp(page);
  await page.goto("/settings/my-account/appearance");
  await page.getByLabel("Brand color (light theme) (hex)").fill("#fde047");
  await expect(page.getByText("Light theme color doesn't pass contrast check")).toBeVisible();
});

test("out of office days show the host's reason and note instead of times", async ({ page, browser }) => {
  const { username } = await signUp(page);
  const { start, end } = nextMonthRange();
  await page.goto("/settings/my-account/out-of-office");
  await page.getByRole("button", { name: "Go Out of Office" }).click();
  await page.getByLabel("Date", { exact: true }).fill(start);
  await page.getByLabel("To", { exact: true }).fill(end);
  await page.getByLabel("Reason").selectOption({ label: "🏝️ Vacation" });
  await page.getByLabel("Notes").fill("Hiking in the Alps");
  await page.getByText("Show note on public booking page").click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Successfully created a new entry");
  await expect(page.getByTestId("ooo-entries")).toContainText("Hiking in the Alps");

  const guest = await (await newClientContext(browser, { timezoneId: "UTC" })).newPage();
  await guest.goto(`/${username}/30min`);
  await guest.getByRole("button", { name: "View next month" }).click();
  await guest.locator("td button:not([disabled])").first().click();
  await expect(guest.getByText(/is OOO$/)).toBeVisible();
  await expect(guest.getByText("Vacation")).toBeVisible();
  await expect(guest.getByText("Hiking in the Alps")).toBeVisible();
  await expect(guest.locator("ul li button")).toHaveCount(0);

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status")).toHaveText("Successfully deleted entry");
  await guest.reload();
  await guest.getByRole("button", { name: "View next month" }).click();
  await guest.locator("td button:not([disabled])").first().click();
  await expect(guest.locator("ul li button").first()).toBeVisible();
});

test("holidays the host takes off can't be booked, and can be switched back on", async ({
  page,
  browser,
}) => {
  test.skip(!hasFakes, "needs the fake Google holiday calendar");
  const { username } = await signUp(page);
  await page.goto("/settings/my-account/out-of-office");
  await page.getByLabel("Select country").selectOption({ label: "United Kingdom" });
  await expect(page.getByTestId("holidays")).toContainText("Founders Day");

  const holiday = fakeHolidayDate();
  const guest = await (await newClientContext(browser, { timezoneId: "UTC" })).newPage();
  await guest.goto(`/${username}/30min`);
  await guest.getByRole("button", { name: "View next month" }).click();
  await guest.getByRole("button", { name: holiday }).click();
  await expect(guest.getByText("Founders Day")).toBeVisible();
  await expect(guest.getByText("No availability on this holiday")).toBeVisible();

  await page.getByTestId("holidays").getByRole("switch").click();
  await expect(page.getByTestId("holidays").getByRole("switch")).not.toBeChecked();
  await guest.reload();
  await guest.getByRole("button", { name: "View next month" }).click();
  await guest.getByRole("button", { name: holiday }).click();
  await expect(guest.locator("ul li button").first()).toBeVisible();
});

test("API keys are shown once in Cal's format, listed by hint, and can be deleted", async ({ page }) => {
  await signUp(page);
  await page.goto("/settings/developer/api-keys");
  await expect(page.getByText("Create your first API key")).toBeVisible();
  await page.getByRole("button", { name: "Create an API key" }).click();
  await page.getByLabel("Name this key").fill("Zapier");
  await page.getByLabel("Expiration date").selectOption({ label: "Never expires" });
  await page.getByRole("button", { name: "Create", exact: true }).click();

  const key = (await page.getByTestId("new-api-key").textContent()) ?? "";
  expect(key).toMatch(/^cal_[0-9a-f]{32}$/);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("new-api-key")).toBeHidden();
  await expect(page.getByTestId("api-keys")).toContainText("Zapier");
  await expect(page.getByTestId("api-keys")).toContainText(`${key.slice(0, 10)}…`);
  await expect(page.getByTestId("api-keys")).not.toContainText(key);

  await page.getByTestId("api-keys").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Create your first API key")).toBeVisible();
});
