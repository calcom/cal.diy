import { WEBAPP_URL } from "@calcom/lib/constants";
import { randomString } from "@calcom/lib/random";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { test } from "./lib/fixtures";
import {
  bookTimeSlot,
  createNewUserEventType,
  gotoBookingPage,
  gotoFirstEventType,
  saveEventType,
  selectFirstAvailableTimeSlotNextMonth,
  submitAndWaitForResponse,
} from "./lib/testUtils";

test.describe.configure({ mode: "parallel" });

test.describe("Event Types tests", () => {
  test("should render the /event-types page", async ({ page, users }) => {
    const user = await users.create();

    await user.apiLogin();

    await page.goto("/event-types");

    const locator = page.getByRole("heading", { name: "Event Types" });

    await expect(locator).toBeVisible();
  });
});

test.describe("Event Types tests", () => {
  test.describe("user", () => {
    test.beforeEach(async ({ page, users }) => {
      const user = await users.create();
      await user.apiLogin();
      await page.goto("/event-types");

      // We wait until loading is finished
      await page.waitForSelector('[data-testid="event-types"]');
    });

    test.afterEach(async ({ users }) => {
      await users.deleteAll();
    });

    test("has at least 2 events", async ({ page }) => {
      const $eventTypes = page.locator("[data-testid=event-types] > li a");
      const count = await $eventTypes.count();
      expect(count).toBeGreaterThanOrEqual(2);
    });

    test("can add new event type", async ({ page }) => {
      const nonce = randomString(3);
      const eventTitle = `hello ${nonce}`;
      await createNewUserEventType(page, { eventTitle });
      await page.goto("/event-types");
      await expect(page.locator(`text='${eventTitle}'`)).toBeVisible();
    });

    test("new event type appears first in the list", async ({ page }) => {
      const nonce = randomString(3);
      const eventTitle = `hello ${nonce}`;
      await createNewUserEventType(page, { eventTitle });
      await page.goto("/event-types");
      const firstEvent = page.locator("[data-testid=event-types] > li a").first();
      const firstEventTitle = await firstEvent.getAttribute("title");
      await expect(firstEventTitle).toBe(eventTitle);
    });

    test("enabling recurring event comes with default options", async ({ page }) => {
      const nonce = randomString(3);
      const eventTitle = `my recurring event ${nonce}`;
      await createNewUserEventType(page, { eventTitle });

      // fix the race condition
      await page.waitForSelector('[data-testid="event-title"]');
      await expect(page.getByTestId("vertical-tab-basics")).toHaveAttribute("aria-current", "page");

      await page.click("[data-testid=vertical-tab-recurring]");
      await expect(page.locator("[data-testid=recurring-event-collapsible]")).toBeHidden();
      await page.click("[data-testid=recurring-event-check]");
      await expect(page.locator("[data-testid=recurring-event-collapsible]")).toBeVisible();

      expect(
        await page
          .locator("[data-testid=recurring-event-collapsible] input[type=number]")
          .nth(0)
          .getAttribute("value")
      ).toBe("1");
      expect(
        await page.locator("[data-testid=recurring-event-collapsible] div[class$=singleValue]").textContent()
      ).toBe("week");
      expect(
        await page
          .locator("[data-testid=recurring-event-collapsible] input[type=number]")
          .nth(1)
          .getAttribute("value")
      ).toBe("12");
    });

    test("can duplicate an existing event type", async ({ page }) => {
      const firstElement = await page.waitForSelector(
        '[data-testid="event-types"] a[href^="/event-types/"] >> nth=0'
      );
      const href = await firstElement.getAttribute("href");
      expect(href).not.toBeNull();
      const [eventTypeId] = new URL(WEBAPP_URL + href).pathname.split("/").reverse();
      const firstTitle = await page.locator(`[data-testid=event-type-title-${eventTypeId}]`).innerText();
      const firstFullSlug = await page.locator(`[data-testid=event-type-slug-${eventTypeId}]`).innerText();
      const firstSlug = firstFullSlug.split("/")[2];

      await expect(page.locator("[data-testid=readonly-badge]")).toBeHidden();

      await page.click(`[data-testid=event-type-options-${eventTypeId}]`);
      await page.click(`[data-testid=event-type-duplicate-${eventTypeId}]`);
      // Wait for the dialog to appear so we can get the URL
      await page.waitForSelector('[data-testid="dialog-title"]');

      const url = page.url();
      const params = new URLSearchParams(url);

      expect(params.get("title")).toBe(firstTitle);
      expect(params.get("slug")).toContain(firstSlug);

      const formTitle = await page.inputValue("[name=title]");
      const formSlug = await page.inputValue("[name=slug]");

      expect(formTitle).toBe(firstTitle);
      expect(formSlug).toContain(firstSlug);

      const submitPromise = page.waitForResponse("/api/trpc/eventTypesHeavy/duplicate?batch=1");
      await page.getByTestId("continue").click();
      const response = await submitPromise;
      expect(response.status()).toBe(200);
    });

    test("edit first event", async ({ page }) => {
      const $eventTypes = page.locator("[data-testid=event-types] > li a");
      const firstEventTypeElement = $eventTypes.first();
      await firstEventTypeElement.click();
      await page.waitForURL((url) => {
        return !!url.pathname.match(/\/event-types\/.+/);
      });
      await submitAndWaitForResponse(page, "/api/trpc/eventTypesHeavy/update?batch=1", {
        action: () => page.locator("[data-testid=update-eventtype]").click(),
      });
    });

    test("update toast shows the newly saved title", async ({ page }) => {
      await gotoFirstEventType(page);

      const newTitle = `Renamed ${randomString(6)}`;
      await page.locator("[data-testid=event-title]").fill(newTitle);
      await saveEventType(page);

      await expect(page.locator("[data-testid=toast-success]")).toContainText(
        `${newTitle} event type updated successfully`
      );
    });

    test("can add multiple organizer address", async ({ page }) => {
      const $eventTypes = page.locator("[data-testid=event-types] > li a");
      const firstEventTypeElement = $eventTypes.first();
      await firstEventTypeElement.click();
      await page.waitForURL((url) => {
        return !!url.pathname.match(/\/event-types\/.+/);
      });

      const locationData = ["location 1", "location 2", "location 3"];

      await fillLocation(page, locationData[0], 0);

      await page.locator("[data-testid=add-location]").click();
      await fillLocation(page, locationData[1], 1);

      await page.locator("[data-testid=add-location]").click();
      await fillLocation(page, locationData[2], 2);

      await submitAndWaitForResponse(page, "/api/trpc/eventTypesHeavy/update?batch=1", {
        action: () => page.locator("[data-testid=update-eventtype]").click(),
      });

      await page.goto("/event-types");

      const previewLink = await page
        .locator("[data-testid=preview-link-button]")
        .first()
        .getAttribute("href");

      /**
       * Verify first organizer address
       */
      await page.goto(previewLink ?? "");
      await page.waitForURL((url) => {
        return url.searchParams.get("overlayCalendar") === "true";
      });
      await selectFirstAvailableTimeSlotNextMonth(page);
      await page.locator(`span:has-text("${locationData[0]}")`).click();
      await bookTimeSlot(page);
      await expect(page.locator("[data-testid=success-page]")).toBeVisible();
      await expect(page.locator(`[data-testid="where"]`)).toHaveText(locationData[0]);

      /**
       * Verify second organizer address
       */
      await page.goto(previewLink ?? "");
      await selectFirstAvailableTimeSlotNextMonth(page);
      await page.locator(`span:has-text("${locationData[1]}")`).click();
      await bookTimeSlot(page);
      await expect(page.locator("[data-testid=success-page]")).toBeVisible();
      await expect(page.locator(`[data-testid="where"]`)).toHaveText(locationData[1]);
    });

    test.describe("Different Locations Tests", () => {
      test("can add Attendee Phone Number location and book with it", async ({ page }) => {
        await gotoFirstEventType(page);
        await selectAttendeePhoneNumber(page);
        await saveEventType(page);
        await gotoBookingPage(page);
        await selectFirstAvailableTimeSlotNextMonth(page);
        const locationInput = page.locator(`[data-fob-field-name="location"] input`);
        await locationInput.clear();
        await locationInput.fill("+19199999999");
        await bookTimeSlot(page);

        await expect(page.locator("[data-testid=success-page]")).toBeVisible();
        await expect(page.locator("text=+19199999999")).toHaveCount(2);
        await expect(page.locator("text=+19199999999").first()).toBeVisible();
        await expect(page.locator("text=+19199999999").nth(1)).toBeVisible();
      });

      test("Can add Organzer Phone Number location and book with it", async ({ page }) => {
        await gotoFirstEventType(page);

        await page.getByTestId("location-select").click();
        await page.getByTestId("location-select-item-userPhone").click();
        const locationInputName = "locations[0].hostPhoneNumber";
        await page.locator(`input[name="${locationInputName}"]`).waitFor();
        await page.locator(`input[name="${locationInputName}"]`).clear();
        await page.locator(`input[name="${locationInputName}"]`).fill("+19199999999");

        await saveEventType(page);
        await gotoBookingPage(page);
        await selectFirstAvailableTimeSlotNextMonth(page);

        await bookTimeSlot(page);

        await expect(page.locator("[data-testid=success-page]")).toBeVisible();
        await expect(page.locator("text=+19199999999")).toBeVisible();
      });

      test("Can add Cal video location and book with it", async ({ page }) => {
        await gotoFirstEventType(page);

        await page.getByTestId("location-select").click();
        await page.locator(`text="Cal Video (Default)"`).click();

        await saveEventType(page);
        await gotoBookingPage(page);
        await selectFirstAvailableTimeSlotNextMonth(page);

        await bookTimeSlot(page);

        await expect(page.locator("[data-testid=success-page]")).toBeVisible();
        await expect(page.locator("[data-testid=where] ")).toContainText("Cal Video");
      });

      test("Can add Link Meeting as location and book with it", async ({ page }) => {
        await gotoFirstEventType(page);

        await page.getByTestId("location-select").click();
        await page.locator(`text="Link meeting"`).click();

        const locationInputName = `locations[0].link`;

        const testUrl = "https://cal.ai/";
        await page.locator(`input[name="${locationInputName}"]`).fill(testUrl);

        await saveEventType(page);
        await gotoBookingPage(page);
        await selectFirstAvailableTimeSlotNextMonth(page);

        await bookTimeSlot(page);

        await expect(page.locator("[data-testid=success-page]")).toBeVisible();
        const linkElement = await page.locator("[data-testid=where] > a");
        expect(await linkElement.getAttribute("href")).toBe(testUrl);
      });

      // TODO: This test is extremely flaky and has been failing a lot, blocking many PRs. Fix this.
      test.skip("Can remove location from multiple locations that are saved", async ({ page }) => {
        await gotoFirstEventType(page);

        // Add Attendee Phone Number location
        await selectAttendeePhoneNumber(page);

        // Add Cal Video location
        await addAnotherLocation(page, "Cal Video (Default)");

        await saveEventType(page);

        // Remove Attendee Phone Number Location
        const removeButtomId = "delete-locations.0.type";
        await page.getByTestId(removeButtomId).click();

        await saveEventType(page);

        await gotoBookingPage(page);
        await selectFirstAvailableTimeSlotNextMonth(page);

        await bookTimeSlot(page);

        await expect(page.locator("[data-testid=success-page]")).toBeVisible();
        await expect(page.locator("[data-testid=where]")).toHaveText(/Cal Video/);
      });

      test("can add single organizer address location without display location public option", async ({
        page,
      }) => {
        const $eventTypes = page.locator("[data-testid=event-types] > li a");
        const firstEventTypeElement = $eventTypes.first();
        await firstEventTypeElement.click();
        await page.waitForURL((url) => {
          return !!url.pathname.match(/\/event-types\/.+/);
        });

        const locationAddress = "New Delhi";

        await fillLocation(page, locationAddress, 0, false);
        await submitAndWaitForResponse(page, "/api/trpc/eventTypesHeavy/update?batch=1", {
          action: () => page.locator("[data-testid=update-eventtype]").click(),
        });

        await page.goto("/event-types");

        const previewLink = await page
          .locator("[data-testid=preview-link-button]")
          .first()
          .getAttribute("href");

        await page.goto(previewLink ?? "");
        await selectFirstAvailableTimeSlotNextMonth(page);
        await bookTimeSlot(page);
        await expect(page.locator("[data-testid=success-page]")).toBeVisible();
        await expect(page.locator(`[data-testid="where"]`)).toHaveText(locationAddress);
      });

      test("can select 'display on booking page' option when multiple organizer input type are present", async ({
        page,
      }) => {
        await gotoFirstEventType(page);

        await page.getByTestId("location-select").click();
        await page.locator(`text="Link meeting"`).click();

        const locationInputName = (idx: number) => `locations[${idx}].link`;

        const testUrl1 = "https://cal.ai/";
        await page.locator(`input[name="${locationInputName(0)}"]`).fill(testUrl1);
        await page.locator("[data-testid=display-location]").last().check();
        await checkDisplayLocation(page);
        await unCheckDisplayLocation(page);

        await page.locator("[data-testid=add-location]").click();

        const testUrl2 = "https://cal.com/ai";
        await page.locator(`text="Link meeting"`).last().click();
        await page.locator(`input[name="${locationInputName(1)}"]`).waitFor();
        await page.locator(`input[name="${locationInputName(1)}"]`).fill(testUrl2);
        await checkDisplayLocation(page);
        await unCheckDisplayLocation(page);

        // Remove Both of the locations
        const removeButtomId = "delete-locations.0.type";
        await page.getByTestId(removeButtomId).nth(0).click();
        await page.getByTestId(removeButtomId).nth(0).click();

        // Add Multiple Phone Call location options
        await page.getByTestId("location-select").last().click();
        await page.getByTestId("location-select-item-userPhone").click();

        const organizerPhoneNumberInputName = (idx: number) => `locations[${idx}].hostPhoneNumber`;

        const testPhoneInputValue1 = "9199999999";
        await page.locator(`input[name="${organizerPhoneNumberInputName(0)}"]`).waitFor();
        await page.locator(`input[name="${organizerPhoneNumberInputName(0)}"]`).fill(testPhoneInputValue1);
        await page.locator("[data-testid=display-location]").last().check();
        await checkDisplayLocation(page);
        await unCheckDisplayLocation(page);
        await page.locator("[data-testid=add-location]").click();

        const testPhoneInputValue2 = "9188888888";
        await page.getByTestId("location-select-item-userPhone").last().click();
        await page.locator(`input[name="${organizerPhoneNumberInputName(1)}"]`).waitFor();
        await page.locator(`input[name="${organizerPhoneNumberInputName(1)}"]`).fill(testPhoneInputValue2);
        await checkDisplayLocation(page);
        await unCheckDisplayLocation(page);
      });
    });

    test("Should not allow enabling both recurring event and offer seats at the same time", async ({
      page,
    }) => {
      const nonce = randomString(3);
      const eventTitle = `Conflict event ${nonce}`;
      await createNewUserEventType(page, { eventTitle });
      await page.goto("/event-types");
      await page.click(`text=${eventTitle}`);

      // Go to Advanced tab and enable offerSeats
      await page.click("[data-testid=vertical-tab-event_advanced_tab_title]");
      const offerSeatsToggle = page.locator("[data-testid=offer-seats-toggle]");
      await offerSeatsToggle.click();

      // Try enabling recurring - should be disabled
      await page.click("[data-testid=vertical-tab-recurring]");
      const recurringEventToggle = page.locator("[data-testid=recurring-event-check]");
      await expect(recurringEventToggle).toBeDisabled();

      // Go back and disable offerSeats
      await page.click("[data-testid=vertical-tab-event_advanced_tab_title]");
      await offerSeatsToggle.click(); // turn it off

      // Enable recurring now
      await page.click("[data-testid=vertical-tab-recurring]");
      await recurringEventToggle.click();
      await expect(page.locator("[data-testid=recurring-event-collapsible]")).toBeVisible();

      // After enabling recurring, offerSeats should now be disabled
      await page.click("[data-testid=vertical-tab-event_advanced_tab_title]");
      await expect(offerSeatsToggle).toBeDisabled();
    });
    test("should enable timezone lock in event advanced settings and verify disabled timezone selector on booking page", async ({
      page,
    }) => {
      await gotoFirstEventType(page);
      await expect(page.locator("[data-testid=event-title]")).toBeVisible();
      await page.click("[data-testid=vertical-tab-event_advanced_tab_title]");
      await page.click("[data-testid=lock-timezone-toggle]");
      await page.click("[data-testid=timezone-select]");
      await page.locator('[aria-label="Timezone Select"]').fill("New York");
      await page.keyboard.press("Enter");

      await submitAndWaitForResponse(page, "/api/trpc/eventTypesHeavy/update?batch=1", {
        action: () => page.locator("[data-testid=update-eventtype]").click(),
      });
      await page.goto("/event-types");
      const previewLink = await page
        .locator("[data-testid=preview-link-button]")
        .first()
        .getAttribute("href");

      await page.goto(previewLink ?? "");
      const currentTimezone = page.locator('[data-testid="event-meta-current-timezone"]');
      await expect(currentTimezone).toBeVisible();
      await expect(currentTimezone).toHaveClass(/cursor-not-allowed/);
      await expect(page.getByText("New York")).toBeVisible();
    });
    test("should create recurring event and successfully book multiple occurrences", async ({ page }) => {
      const nonce = randomString(3);
      const eventTitle = `Recurring Event Test ${nonce}`;

      await createNewUserEventType(page, { eventTitle });

      await page.waitForSelector('[data-testid="event-title"]');
      await expect(page.getByTestId("vertical-tab-basics")).toHaveAttribute("aria-current", "page");
      await page.click("[data-testid=vertical-tab-recurring]");
      await expect(page.locator("[data-testid=recurring-event-collapsible]")).toBeHidden();
      await page.click("[data-testid=recurring-event-check]");
      await expect(page.locator("[data-testid=recurring-event-collapsible]")).toBeVisible();

      await page.locator("[data-testid=recurring-event-collapsible] input[type=number]").nth(1).fill("3");

      await saveEventType(page);

      await gotoBookingPage(page);

      await expect(page.locator("[data-testid=occurrence-input]")).toHaveValue("3");

      await selectFirstAvailableTimeSlotNextMonth(page);

      await expect(page.locator("[data-testid=recurring-dates]")).toBeVisible();

      await bookTimeSlot(page, { isRecurringEvent: true });

      await expect(page.locator("[data-testid=success-page]")).toBeVisible();

      await expect(page.locator("text=3 occurrences")).toBeVisible();
    });
  });

  test.describe("Interface Language Tests", () => {
    test.use({
      locale: "en",
    });

    test("by default the Interface language has 'Visitor's browser language' selected", async ({
      page,
      users,
    }) => {
      await test.step("should create a en user", async () => {
        const user = await users.create({
          locale: "en",
        });
        await user.apiLogin();
        await page.goto("/event-types");
        await page.waitForSelector('[data-testid="event-types"]');
      });
      await test.step("should open first eventType and check Interface Language", async () => {
        await gotoFirstEventType(page);
        // Go to Advanced tab
        await page.click("[data-testid=vertical-tab-event_advanced_tab_title]");
        await page.click("[data-testid=event-interface-language-toggle]");
        const interfaceLanguageValue = page
          .getByTestId("event-interface-language")
          .locator('div[class$="-singleValue"]');
        await expect(interfaceLanguageValue).toHaveText("Visitor's browser language");
      });
    });

    test("user can change the interface language to any other language and the booking page should be rendered in that language", async ({
      page,
      users,
    }) => {
      await test.step("should create a en user", async () => {
        const user = await users.create({
          locale: "en",
        });
        await user.apiLogin();
        await page.goto("/event-types");
        await page.waitForSelector('[data-testid="event-types"]');
      });

      await test.step("should open first eventType and change Interface Language to Deutsche", async () => {
        await gotoFirstEventType(page);
        // Go to Advanced tab and enable offerSeats
        await page.click("[data-testid=vertical-tab-event_advanced_tab_title]");
        await page.click("[data-testid=event-interface-language-toggle]");
        await page.getByTestId("event-interface-language").click();
        await page.locator(`text="Deutsch"`).click();
        await saveEventType(page);
      });

      await test.step("should open corresponding booking page and ensure language rendered is Deutsche", async () => {
        await gotoBookingPage(page);
        //expect the slot selection page to be rendered in 'Deutsch'
        await expect(page.locator(`text="So"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="Mo"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="Di"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="Mi"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="Do"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="Fr"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="Sa"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="12 Std"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="24 Std"`).nth(0)).toBeVisible();

        await selectFirstAvailableTimeSlotNextMonth(page);
        //expect the booking inputs page to be rendered in 'Deutsch'
        await expect(page.locator(`text="Ihr Name"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="E-Mail Adresse"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="Zusätzliche Notizen"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="Weitere Gäste"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="Zurück"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="Bestätigen"`).nth(0)).toBeVisible();
      });

      await test.step("should be able to book successfully and ensure success page is rendered in Deutsche", async () => {
        await bookTimeSlot(page);
        await expect(page.locator("[data-testid=success-page]")).toBeVisible();
        await expect(page.locator(`text="Dieser Termin ist geplant"`).nth(0)).toBeVisible();
      });
    });

    test("user locale setting is overridden by event type language setting for booking page", async ({
      page,
      users,
    }) => {
      await test.step("should create a de user and ensure app is rendered in de", async () => {
        const user = await users.create({
          locale: "de",
        });
        await user.apiLogin();
        await page.goto("/event-types");
        await page.waitForSelector('[data-testid="event-types"]');
        {
          const locator = page.getByText("Ereignistypen", { exact: true }).first(); // "general"
          await expect(locator).toBeVisible();
        }
      });

      await test.step("should open first eventType and change Interface Language to Español", async () => {
        await page.goto("/event-types");
        await page.waitForSelector('[data-testid="event-types"]');
        await gotoFirstEventType(page);
        // Go to Advanced tab and enable offerSeats
        await page.click("[data-testid=vertical-tab-event_advanced_tab_title]");
        await page.click("[data-testid=event-interface-language-toggle]");
        await page.getByTestId("event-interface-language").click();
        await page.getByTestId("select-option-es").click();
        await saveEventType(page);
      });

      await test.step("should go to booking page and verify the Interface language is Español", async () => {
        await gotoBookingPage(page);
        //expect the slot selection page to be rendered in 'Español'
        await expect(page.locator(`text="dom"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="lun"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="mar"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="mié"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="jue"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="vie"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="sáb"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="12 h"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="24hs"`).nth(0)).toBeVisible();

        await selectFirstAvailableTimeSlotNextMonth(page);
        //expect the booking inputs page to be rendered in 'Español'
        await expect(page.locator(`text="Tu Nombre"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="Email"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="Notas Adicionales"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="Añadir invitados"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="Atrás"`).nth(0)).toBeVisible();
        await expect(page.locator(`text="Confirmar"`).nth(0)).toBeVisible();

        await bookTimeSlot(page);
        await expect(page.locator("[data-testid=success-page]")).toBeVisible();
      });

      await test.step("ensure other components of the App is still rendered in de and not affected by setting eventType Interface Language to Español", async () => {
        await page.goto("/event-types");
        await page.waitForSelector('[data-testid="event-types"]');
        {
          const locator = page.getByText("Ereignistypen", { exact: true }).first(); // "general"
          await expect(locator).toBeVisible();
        }
      });
    });
  });
});

const selectAttendeePhoneNumber = async (page: Page) => {
  await page.getByTestId("location-select").click();
  await page.getByTestId("location-select-item-phone").click();
};

/**
 * Adds n+1 location to the event type
 */
async function addAnotherLocation(page: Page, locationOptionText: string) {
  await page.locator("[data-testid=add-location]").click();
  // When adding another location, the dropdown opens automatically. So, we don't need to open it here.
  //
  await page.locator(`text="${locationOptionText}"`).click();
}

const fillLocation = async (page: Page, inputText: string, index: number, selectDisplayLocation = true) => {
  // Except the first location, dropdown automatically opens when adding another location
  if (index == 0) {
    await page.getByTestId("location-select").last().click();
  }
  await page.locator("text=In Person (Organizer Address)").last().click();

  const locationInputName = `locations[${index}].address`;
  await page.locator(`input[name="${locationInputName}"]`).waitFor();
  await page.locator(`input[name="locations[${index}].address"]`).fill(inputText);
  if (selectDisplayLocation) {
    await page.locator("[data-testid=display-location]").last().check();
  }
};

const checkDisplayLocation = async (page: Page) => {
  await page.locator("[data-testid=display-location]").last().check();
  await expect(page.locator("[data-testid=display-location]").last()).toBeChecked();
};

const unCheckDisplayLocation = async (page: Page) => {
  await page.locator("[data-testid=display-location]").last().uncheck();
  await expect(page.locator("[data-testid=display-location]").last()).toBeChecked({ checked: false });
};
