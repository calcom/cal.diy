import { WEBAPP_URL } from "@calcom/lib/constants";
import { generateHashedLink } from "@calcom/lib/generateHashedLink";
import { randomString } from "@calcom/lib/random";
import type { Schedule, TimeRange } from "@calcom/types/schedule";
import { expect } from "@playwright/test";
import { JSDOM } from "jsdom";
import { test, todo } from "./lib/fixtures";
import {
  bookFirstEvent,
  bookOptinEvent,
  bookTimeSlot,
  cancelBookingFromBookingsList,
  confirmBooking,
  confirmReschedule,
  expectSlotNotAllowedToBook,
  selectFirstAvailableTimeSlotNextMonth,
  testEmail,
  testName,
} from "./lib/testUtils";

const freeUserObj = { name: `Free-user-${randomString(3)}` };
test.describe.configure({ mode: "parallel" });
test.afterEach(async ({ users }) => {
  await users.deleteAll();
});

test("check SSR and OG - User Event Type", async ({ page, users }) => {
  const name = "Test User";
  const user = await users.create({
    name,
  });
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes(`/${user.username}/30-min`) && response.status() === 200
  );
  await page.goto(`/${user.username}/30-min`);
  await page.content();
  const response = await responsePromise;
  const ssrResponse = await response.text();
  const document = new JSDOM(ssrResponse).window.document;

  const titleText = document.querySelector("title")?.textContent;
  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
  const ogUrl = document.querySelector('meta[property="og:url"]')?.getAttribute("content");
  const canonicalLink = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
  expect(titleText).toContain(name);
  expect(ogUrl).toEqual(`${WEBAPP_URL}/${user.username}/30-min`);
  await page.waitForSelector('[data-testid="avatar-href"]');
  const avatarLocators = await page.locator('[data-testid="avatar-href"]').all();
  expect(avatarLocators.length).toBe(1);

  for (const avatarLocator of avatarLocators) {
    expect(await avatarLocator.getAttribute("href")).toEqual(`${WEBAPP_URL}/${user.username}?redirect=false`);
  }

  expect(canonicalLink).toEqual(`${WEBAPP_URL}/${user.username}/30-min`);
  // Verify that there is correct URL that would generate the awesome OG image
  expect(ogImage).toContain(
    "/_next/image?w=1200&q=100&url=%2Fapi%2Fsocial%2Fog%2Fimage%3Ftype%3Dmeeting%26title%3D30%2Bmin"
  );
  // Verify Organizer Name in the URL
  expect(ogImage).toContain("meetingProfileName%3DTest%2BUser");
});

todo("check SSR and OG - Team Event Type");

test.describe("user with a special character in the username", () => {
  test("/[user] page shouldn't 404", async ({ page, users }) => {
    const user = await users.create({ username: "franz-janßen" });
    const response = await page.goto(`/${user.username}`);
    expect(response?.status()).not.toBe(404);
  });

  test("/[user]/[type] page shouldn't 404", async ({ page, users }) => {
    const user = await users.create({ username: "franz-janßen" });
    const response = await page.goto(`/${user.username}/30-min`);
    expect(response?.status()).not.toBe(404);
  });

  test("Should not throw 500 when redirecting user to his/her only event-type page even if username contains special characters", async ({
    page,
    users,
  }) => {
    const benny = await users.create({
      username: "ßenny", // ß is a special character
      eventTypes: [
        {
          title: "15 min",
          slug: "15-min",
          length: 15,
        },
      ],
      overrideDefaultEventTypes: true,
    });
    // This redirects to /[user]/[type] because this user has only 1 event-type
    const response = await page.goto(`/${benny.username}`);
    expect(response?.status()).not.toBe(500);
  });
});

test.describe("free user", () => {
  test.beforeEach(async ({ page, users }) => {
    const free = await users.create(freeUserObj);
    await page.goto(`/${free.username}`);
  });

  test("cannot book same slot multiple times", async ({ page, users }) => {
    const [user] = users.get();

    const bookerObj = {
      email: users.trackEmail({ username: "testEmail", domain: "example.com" }),
      name: "testBooker",
    };
    // Click first event type
    await page.click('[data-testid="event-type-link"]');

    await selectFirstAvailableTimeSlotNextMonth(page);

    await bookTimeSlot(page, bookerObj);

    // save booking url
    const bookingUrl: string = page.url();

    // Make sure we're navigated to the success page
    await expect(page.locator("[data-testid=success-page]")).toBeVisible();
    await user.getFirstEventAsOwner();

    await page.goto(bookingUrl);

    await expectSlotNotAllowedToBook(page);
  });
});

test.describe("pro user", () => {
  test.beforeEach(async ({ page, users }) => {
    const pro = await users.create();
    await page.goto(`/${pro.username}`);
  });

  test("pro user's page has at least 2 visible events", async ({ page }) => {
    const $eventTypes = page.locator("[data-testid=event-types] > *");
    expect(await $eventTypes.count()).toBeGreaterThanOrEqual(2);
  });

  test("book an event first day in next month", async ({ page }) => {
    await bookFirstEvent(page);
  });

  test("can reschedule a booking", async ({ page, users, bookings }) => {
    const [pro] = users.get();
    const [eventType] = pro.eventTypes;
    await bookings.create(pro.id, pro.username, eventType.id);

    await pro.apiLogin();
    await page.goto("/bookings/upcoming");
    await page.waitForSelector('[data-testid="bookings"]');
    // Click the ellipsis menu button to open the dropdown
    await page.locator('[data-testid="booking-actions-dropdown"]').nth(0).click();
    await page.locator('[data-testid="reschedule"]').click();
    await page.waitForURL((url) => {
      const bookingId = url.searchParams.get("rescheduleUid");
      return !!bookingId;
    });
    await selectFirstAvailableTimeSlotNextMonth(page);

    await confirmReschedule(page);
    await page.waitForURL((url) => {
      return url.pathname.startsWith("/booking");
    });
  });

  test("it redirects when a rescheduleUid does not match the current event type", async ({
    page,
    users,
    bookings,
  }) => {
    const [pro] = users.get();
    const [eventType] = pro.eventTypes;
    const bookingFixture = await bookings.create(pro.id, pro.username, eventType.id);

    // open the wrong eventType (rescheduleUid created for /30min event)
    await page.goto(`${pro.username}/${pro.eventTypes[1].slug}?rescheduleUid=${bookingFixture.uid}`);

    await expect(page).toHaveURL(new RegExp(`${pro.username}/${eventType.slug}`));
  });

  test("it returns a 404 when the rescheduleUid does not exist", async ({ page, users }) => {
    const [pro] = users.get();
    const [eventType] = pro.eventTypes;

    const bookingPageUrl = new URL(
      `${pro.username}/${eventType.slug}?rescheduleUid=${randomString(10)}`,
      WEBAPP_URL
    );
    const response = await page.goto(bookingPageUrl.href);
    expect(response?.status()).toBe(404);
  });

  test("it returns a 404 on a private booking link when the rescheduleUid does not exist", async ({
    page,
    users,
    prisma,
  }) => {
    const [pro] = users.get();
    const [eventType] = pro.eventTypes;

    const eventWithPrivateLink = await prisma.eventType.update({
      where: {
        id: eventType.id,
      },
      data: {
        hashedLink: {
          create: [
            {
              link: generateHashedLink(eventType.id),
            },
          ],
        },
      },
      include: {
        hashedLink: true,
      },
    });

    const bookingPageUrl = new URL(
      `/d/${eventWithPrivateLink.hashedLink[0]?.link}/${eventWithPrivateLink.slug}?rescheduleUid=${randomString(10)}`,
      WEBAPP_URL
    );
    const response = await page.goto(bookingPageUrl.href);
    expect(response?.status()).toBe(404);
  });

  test("it returns a 404 when a requested event type does not exist", async ({ page, users }) => {
    const [pro] = users.get();
    const unexistingPageUrl = new URL(`${pro.username}/invalid-event-type`, WEBAPP_URL);
    const response = await page.goto(unexistingPageUrl.href);
    expect(response?.status()).toBe(404);
  });

  test("Can cancel the recently created booking and rebook the same timeslot", async ({
    page,
    users,
  }, testInfo) => {
    // Because it tests the entire booking flow + the cancellation + rebooking
    test.setTimeout(testInfo.timeout * 3);
    await bookFirstEvent(page);
    await expect(page.locator(`[data-testid="attendee-email-${testEmail}"]`)).toHaveText(testEmail);
    await expect(page.locator(`[data-testid="attendee-name-${testName}"]`)).toHaveText(testName);

    const [pro] = users.get();
    await pro.apiLogin();

    await page.goto("/bookings/upcoming");
    await cancelBookingFromBookingsList({
      page,
      nth: 0,
      reason: "Test reason",
    });

    await page.goto(`/${pro.username}`);
    await bookFirstEvent(page);
  });

  test("Can cancel the recently created booking and shouldn't be allowed to reschedule it", async ({
    page,
    users,
  }, testInfo) => {
    // Because it tests the entire booking flow + the cancellation + rebooking
    test.setTimeout(testInfo.timeout * 3);
    await bookFirstEvent(page);
    await expect(page.locator(`[data-testid="attendee-email-${testEmail}"]`)).toHaveText(testEmail);
    await expect(page.locator(`[data-testid="attendee-name-${testName}"]`)).toHaveText(testName);

    const [pro] = users.get();
    await pro.apiLogin();

    await page.goto("/bookings/upcoming");
    const { bookingUid } = await cancelBookingFromBookingsList({
      page,
      nth: 0,
      reason: "Test reason",
    });

    await pro.getFirstEventAsOwner();

    await page.goto(`/reschedule/${bookingUid}`);

    expect(page.url()).not.toContain("rescheduleUid");
    const cancelledHeadline = page.locator('[data-testid="cancelled-headline"]');
    await expect(cancelledHeadline).toBeVisible();
  });

  test("can book an event that requires confirmation and then that booking can be accepted by organizer", async ({
    page,
    users,
  }) => {
    await bookOptinEvent(page);
    const [pro] = users.get();
    await pro.apiLogin();

    await page.goto("/bookings/unconfirmed");
    await Promise.all([
      page.click('[data-testid="confirm"]'),
      page.waitForResponse((response) => response.url().includes("/api/trpc/bookings/confirm")),
    ]);
    // This is the only booking in there that needed confirmation and now it should be empty screen
    await expect(page.locator('[data-testid="empty-screen"]')).toBeVisible();
  });

  test("can book an unconfirmed event multiple times", async ({ page }) => {
    await page.locator('[data-testid="event-type-link"]:has-text("Opt in")').click();
    await selectFirstAvailableTimeSlotNextMonth(page);

    const pageUrl = page.url();

    await bookTimeSlot(page);
    await expect(page.locator("[data-testid=success-page]")).toBeVisible();

    // go back to the booking page to re-book.
    await page.goto(pageUrl);
    await bookTimeSlot(page, { email: "test2@example.com" });
    await expect(page.locator("[data-testid=success-page]")).toBeVisible();
  });

  test("booking an unconfirmed event with the same email brings you to the original request", async ({
    page,
  }) => {
    await page.locator('[data-testid="event-type-link"]:has-text("Opt in")').click();
    await selectFirstAvailableTimeSlotNextMonth(page);

    const pageUrl = page.url();

    await bookTimeSlot(page);
    // go back to the booking page to re-book.
    await page.goto(pageUrl);

    await bookTimeSlot(page);
    await expect(page.locator("[data-testid=success-page]")).toBeVisible();
  });

  test("can book with multiple guests", async ({ page }) => {
    const additionalGuests = ["test@gmail.com", "test2@gmail.com"];

    await page.click('[data-testid="event-type-link"]');
    await selectFirstAvailableTimeSlotNextMonth(page);
    await page.fill('[name="name"]', "test1234");
    await page.fill('[name="email"]', "test1234@example.com");
    await page.locator('[data-testid="add-guests"]').click();

    await page.locator('input[type="email"]').nth(1).fill(additionalGuests[0]);
    await page.locator('[data-testid="add-another-guest"]').click();
    await page.locator('input[type="email"]').nth(2).fill(additionalGuests[1]);

    await confirmBooking(page);

    await expect(page.locator("[data-testid=success-page]")).toBeVisible();

    const promises = additionalGuests.map(async (email) => {
      await expect(page.locator(`[data-testid="attendee-email-${email}"]`)).toHaveText(email);
    });
    await Promise.all(promises);
  });

  test("Time slots should be reserved when selected", async ({ page, browser }) => {
    const initialUrl = page.url();
    await page.locator('[data-testid="event-type-link"]').first().click();
    await selectFirstAvailableTimeSlotNextMonth(page);
    const newContext = await browser.newContext();
    const pageTwoInNewContext = await newContext.newPage();
    await pageTwoInNewContext.goto(initialUrl);
    await pageTwoInNewContext.waitForURL(initialUrl);
    await pageTwoInNewContext.locator('[data-testid="event-type-link"]').first().click();

    await pageTwoInNewContext.locator('[data-testid="incrementMonth"]').waitFor();
    await pageTwoInNewContext.click('[data-testid="incrementMonth"]');
    await pageTwoInNewContext.locator('[data-testid="day"][data-disabled="false"]').nth(0).waitFor();
    await pageTwoInNewContext.locator('[data-testid="day"][data-disabled="false"]').nth(0).click();

    // 9:30 should be the first available time slot
    await pageTwoInNewContext.locator('[data-testid="time"]').nth(0).waitFor();
    const firstSlotAvailable = pageTwoInNewContext.locator('[data-testid="time"]').nth(0);
    // Find text inside the element
    const firstSlotAvailableText = await firstSlotAvailable.innerText();
    expect(firstSlotAvailableText).toContain("9:30");
  });

  test("Time slots are not reserved when going back via Cancel button on Event Form", async ({
    context,
    page,
  }) => {
    const initialUrl = page.url();
    await page.waitForSelector('[data-testid="event-type-link"]');
    const eventTypeLink = page.locator('[data-testid="event-type-link"]').first();
    await eventTypeLink.click();
    await selectFirstAvailableTimeSlotNextMonth(page);

    const pageTwo = await context.newPage();
    await pageTwo.goto(initialUrl);
    await pageTwo.waitForURL(initialUrl);

    await pageTwo.waitForSelector('[data-testid="event-type-link"]');
    const eventTypeLinkTwo = pageTwo.locator('[data-testid="event-type-link"]').first();
    await eventTypeLinkTwo.waitFor();
    await eventTypeLinkTwo.click();

    await page.locator('[data-testid="back"]').waitFor();
    await page.click('[data-testid="back"]');

    await pageTwo.locator('[data-testid="incrementMonth"]').waitFor();
    await pageTwo.click('[data-testid="incrementMonth"]');
    await pageTwo.locator('[data-testid="day"][data-disabled="false"]').nth(0).waitFor();
    await pageTwo.locator('[data-testid="day"][data-disabled="false"]').nth(0).click();

    await pageTwo.locator('[data-testid="time"]').nth(0).waitFor();
    const firstSlotAvailable = pageTwo.locator('[data-testid="time"]').nth(0);

    // Find text inside the element
    const firstSlotAvailableText = await firstSlotAvailable.innerText();
    expect(firstSlotAvailableText).toContain("9:00");
  });
});

test.describe("prefill", () => {
  test("logged in", async ({ page, users }) => {
    const prefill = await users.create({ name: "Prefill User" });
    await prefill.apiLogin();
    await page.goto("/pro/30min");

    await test.step("from session", async () => {
      await selectFirstAvailableTimeSlotNextMonth(page);
      await expect(page.locator('[name="name"]')).toHaveValue(prefill.name || "");
      await expect(page.locator('[name="email"]')).toHaveValue(prefill.email);
    });

    await test.step("from query params", async () => {
      const url = new URL(page.url());
      url.searchParams.set("name", testName);
      url.searchParams.set("email", testEmail);
      await page.goto(url.toString());

      await expect(page.locator('[name="name"]')).toHaveValue(testName);
      await expect(page.locator('[name="email"]')).toHaveValue(testEmail);
    });
  });

  test("Persist the field values when going back and coming back to the booking form", async ({ page }) => {
    await page.goto("/pro/30min");
    await selectFirstAvailableTimeSlotNextMonth(page);
    await page.fill('[name="name"]', "John Doe");
    await page.fill('[name="email"]', "john@example.com");
    await page.fill('[name="notes"]', "Test notes");
    await page.click('[data-testid="back"]');

    await selectFirstAvailableTimeSlotNextMonth(page);
    await expect(page.locator('[name="name"]')).toHaveValue("John Doe");
    await expect(page.locator('[name="email"]')).toHaveValue("john@example.com");
    await expect(page.locator('[name="notes"]')).toHaveValue("Test notes");
  });

  test("logged out", async ({ page }) => {
    await page.goto("/pro/30min");

    await test.step("from query params", async () => {
      await selectFirstAvailableTimeSlotNextMonth(page);

      const url = new URL(page.url());
      url.searchParams.set("name", testName);
      url.searchParams.set("email", testEmail);
      await page.goto(url.toString());

      await expect(page.locator('[name="name"]')).toHaveValue(testName);
      await expect(page.locator('[name="email"]')).toHaveValue(testEmail);
    });
  });

  test("skip confirm step if all fields are prefilled from query params", async ({ page }) => {
    await page.goto("/pro/30min");
    const url = new URL(page.url());
    url.searchParams.set("name", testName);
    url.searchParams.set("email", testEmail);
    url.searchParams.set("guests", "guest1@example.com");
    url.searchParams.set("guests", "guest2@example.com");
    url.searchParams.set("notes", "This is an additional note");
    await page.goto(url.toString());
    await selectFirstAvailableTimeSlotNextMonth(page);

    await expect(page.locator('[data-testid="skip-confirm-book-button"]')).toBeVisible();
    await page.click('[data-testid="skip-confirm-book-button"]');

    await expect(page.locator("[data-testid=success-page]")).toBeVisible();
  });
});

test.describe("Booking on different layouts", () => {
  test.beforeEach(async ({ page, users }) => {
    // Create user with specific availability (9 AM - 5 PM UTC, Monday-Friday)
    // This ensures slots are available and reduces race conditions
    const dateRanges: TimeRange = {
      start: new Date(new Date().setUTCHours(9, 0, 0, 0)),
      end: new Date(new Date().setUTCHours(17, 0, 0, 0)),
    };
    const schedule: Schedule = [[], [dateRanges], [dateRanges], [dateRanges], [dateRanges], [dateRanges], []];

    const user = await users.create({ schedule });
    await page.goto(`/${user.username}`);
  });

  test("Book on week layout", async ({ page }) => {
    // Click first event type
    await page.locator('[data-testid="event-type-link"]').first().click();

    await page.click('[data-testid="toggle-group-item-week_view"]');

    await page.click('[data-testid="incrementMonth"]');

    await page.locator('[data-testid="calendar-empty-cell"]').nth(1).click();

    // Fill what is this meeting about? name email and notes
    await page.locator('[name="name"]').fill("Test name");
    await page.locator('[name="email"]').fill(`${randomString(4)}@example.com`);
    await page.locator('[name="notes"]').fill("Test notes");

    await confirmBooking(page);

    // expect page to be booking page
    await expect(page.locator("[data-testid=success-page]")).toBeVisible();
  });

  test("Book on column layout", async ({ page }) => {
    // Click first event type
    await page.locator('[data-testid="event-type-link"]').first().click();

    await page.click('[data-testid="toggle-group-item-column_view"]');

    await selectFirstAvailableTimeSlotNextMonth(page);

    // Fill what is this meeting about? name email and notes
    await page.locator('[name="name"]').fill("Test name");
    await page.locator('[name="email"]').fill(`${randomString(4)}@example.com`);
    await page.locator('[name="notes"]').fill("Test notes");

    await confirmBooking(page);

    // expect page to be booking page
    await expect(page.locator("[data-testid=success-page]")).toBeVisible();
  });
});

test.describe("Event type with disabled cancellation and rescheduling", () => {
  let bookingId: string;
  let user: { username: string | null };

  test.beforeEach(async ({ page, users }) => {
    user = await users.create({
      name: `Test-user-${randomString(4)}`,
      eventTypes: [
        {
          title: "No Cancel No Reschedule",
          slug: "no-cancel-no-reschedule",
          length: 30,
          disableCancelling: true,
          disableRescheduling: true,
        },
      ],
    });

    // Book the event
    await page.goto(`/${user.username}/no-cancel-no-reschedule`);
    await selectFirstAvailableTimeSlotNextMonth(page);
    await bookTimeSlot(page, {
      name: "Test-user-1",
      email: "test-booker@example.com",
    });

    // Verify booking was successful
    await expect(page.locator("[data-testid=success-page]")).toBeVisible();

    const url = new URL(page.url());
    const pathSegments = url.pathname.split("/");
    bookingId = pathSegments[pathSegments.length - 1];
  });

  test("Reschedule and cancel buttons should be hidden on success page", async ({ page }) => {
    await expect(page.locator('[data-testid="reschedule-link"]')).toBeHidden();
    await expect(page.locator('[data-testid="cancel"]')).toBeHidden();
  });

  test("Direct access to reschedule/{bookingId} should redirect to success page", async ({ page }) => {
    await page.goto(`/reschedule/${bookingId}`);

    await expect(page.locator("[data-testid=success-page]")).toBeVisible();

    await page.waitForURL((url) => url.pathname === `/booking/${bookingId}`);
  });

  test("Using rescheduleUid query parameter should redirect to success page", async ({ page }) => {
    await page.goto(`/${user.username}/no-cancel-no-reschedule?rescheduleUid=${bookingId}`);

    await expect(page.locator("[data-testid=success-page]")).toBeVisible();

    await page.waitForURL((url) => url.pathname === `/booking/${bookingId}`);
  });

  test("Should prevent cancellation and show an error message", async ({ page }) => {
    const csrfTokenResponse = await page.request.get("/api/csrf");
    const { csrfToken } = await csrfTokenResponse.json();
    const response = await page.request.post("/api/cancel", {
      data: {
        uid: bookingId,
        csrfToken,
      },
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(response.status()).toBe(400);
    const responseBody = await response.json();
    expect(responseBody.message).toBe("This event type does not allow cancellations");
  });
});
test("Should throw error when both seatsPerTimeSlot and recurringEvent are set", async ({ page, users }) => {
  const user = await users.create({
    name: `Test-user-${randomString(4)}`,
    eventTypes: [
      {
        title: "Seats With Recurrence",
        slug: "seats-with-recurrence",
        length: 30,
        seatsPerTimeSlot: 3,
        recurringEvent: {
          freq: 1,
          count: 4,
          interval: 1,
        },
      },
    ],
  });

  // Way to book the event
  await page.goto(`/${user.username}/seats-with-recurrence`);
  await selectFirstAvailableTimeSlotNextMonth(page);
  await page.locator('[name="name"]').fill("Test name");
  await page.locator('[name="email"]').fill(`${randomString(4)}@example.com`);

  page.locator("[data-testid=confirm-book-button]").click();

  // Expect an error message to be displayed
  const alertError = page.locator("[data-testid=booking-fail]");
  await expect(alertError).toBeVisible();
  await expect(alertError).toContainText(
    "Could not book the meeting. Recurring event doesn't support seats feature. Disable seats feature or make the event non-recurring."
  );
});

test.describe("GTM container", () => {
  test.beforeEach(async ({ users }) => {
    await users.create();
  });

  test("global GTM should not be loaded on private booking link", async ({ page, users, prisma }) => {
    const [user] = users.get();
    const eventType = await user.getFirstEventAsOwner();

    const eventWithPrivateLink = await prisma.eventType.update({
      where: {
        id: eventType.id,
      },
      data: {
        hashedLink: {
          create: [
            {
              link: generateHashedLink(eventType.id),
            },
          ],
        },
      },
      include: {
        hashedLink: true,
      },
    });

    const getScheduleRespPromise = page.waitForResponse(
      (response) => response.url().includes("getSchedule") && response.status() === 200
    );
    await page.goto(`/d/${eventWithPrivateLink.hashedLink[0]?.link}/${eventWithPrivateLink.slug}`);
    await page.waitForLoadState("domcontentloaded");
    await getScheduleRespPromise;

    const injectedScript = page.locator('script[id="injected-body-script"]');
    await expect(injectedScript).not.toBeAttached();
  });

  test("global GTM should be loaded on non-booking pages", async ({ page, users }) => {
    test.skip(!process.env.NEXT_PUBLIC_BODY_SCRIPTS, "Skipping test as NEXT_PUBLIC_BODY_SCRIPTS is not set");

    const [user] = users.get();
    await user.apiLogin();

    // Go to a non-booking page and wait for one of the common API calls to complete.
    const eventsByStatusRespPromise = page.waitForResponse(
      (response) => response.url().includes("getEventTypesFromGroup") && response.status() === 200
    );
    await page.goto("/event-types");
    await page.waitForLoadState("domcontentloaded");
    await eventsByStatusRespPromise;

    const injectedScript = page.locator('script[id="injected-body-script"]');
    await expect(injectedScript).toBeAttached();

    const scriptContent = await injectedScript.textContent();
    expect(scriptContent).toContain("googletagmanager");
  });
});

test.describe("Past booking cancellation", () => {
  test("Cancel button should be hidden for past bookings", async ({ page, users, bookings }) => {
    const user = await users.create({
      name: "Test User",
    });

    await user.apiLogin();

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const endDate = new Date(pastDate.getTime() + 30 * 60 * 1000);

    const booking = await bookings.create(user.id, user.username, user.eventTypes[0].id, {
      title: "Past Meeting",
      startTime: pastDate,
      endTime: endDate,
      status: "ACCEPTED",
    });

    await page.goto("/bookings/past");
    await page.locator('[data-testid="booking-actions-dropdown"]').nth(0).click();
    await expect(page.locator('[data-testid="cancel"]')).toBeDisabled();

    await page.goto(`/booking/${booking.uid}`);
    await expect(page.locator('[data-testid="cancel"]')).toBeHidden();
  });
});

test.describe("Optional Email Field Validation", () => {
  test("should validate format if input is provided, but allow empty submission", async ({ page, users }) => {
    const user = await users.create({
      eventTypes: [
        {
          title: "Test Event",
          slug: "test-event",
          length: 30,
          bookingFields: [
            { name: "name", type: "name", required: true },
            { name: "email", type: "email", required: true },
            {
              name: "altEmail",
              type: "email",
              required: false,
              label: "Alternate Email",
            },
          ],
        },
      ],
    });

    await page.goto(`/${user.username}/test-event`);
    await selectFirstAvailableTimeSlotNextMonth(page);

    await page.locator('input[name="name"]').fill("Test Booker");
    await page.locator('input[name="email"]').fill("booker@example.com");

    const optionalField = page.getByLabel(/Alternate Email/i);

    // Visibility
    await expect(optionalField).toBeVisible();

    // Trigger validation error
    await optionalField.fill("not-an-email");
    await page.click('[data-testid="confirm-book-button"]');

    // Verify form didn't submit
    await expect(page).not.toHaveURL(/.*isSuccessBookingPage=true.*/);

    // Verify empty submission is allowed
    await optionalField.fill("");

    // Click the button to submit
    await page.click('[data-testid="confirm-book-button"]');

    // Verify it reached the end
    await expect(page).toHaveURL(/.*isSuccessBookingPage=true.*/, { timeout: 15000 });
    await expect(page.getByTestId("success-page")).toBeVisible();
  });
});
