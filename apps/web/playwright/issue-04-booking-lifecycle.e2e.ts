import { expect } from "@playwright/test";
import { test } from "./lib/fixtures";
import {
  bookFirstEvent,
  cancelBookingFromBookingsList,
  confirmReschedule,
  selectSecondAvailableTimeSlotNextMonth,
} from "./lib/testUtils";

const timeZone = "Asia/Saigon";
const cancellationReason = "QA issue 04: verify cancellation";

test.use({ timezoneId: timeZone });

function observedTime(date: Date): { utc: string; local: string } {
  return {
    utc: date.toISOString(),
    local: new Intl.DateTimeFormat("en-GB", {
      timeZone,
      dateStyle: "short",
      timeStyle: "short",
    }).format(date),
  };
}

test.afterEach(async ({ users }) => {
  await users.deleteAll();
});

test("Issue 04: book, reschedule, and cancel a personal event", async ({ page, users, prisma }, testInfo) => {
  test.setTimeout(600_000);

  const host = await users.create({ name: "Issue 04 QA Host" });
  const [eventType] = host.eventTypes;
  if (!eventType) throw new Error("QA host has no event type");

  const beforeCount = await prisma.booking.count({ where: { eventTypeId: eventType.id } });
  expect(beforeCount).toBe(0);

  await page.goto(`/${host.username}`);
  await bookFirstEvent(page);
  const bookingA = await prisma.booking.findFirst({
    where: { eventTypeId: eventType.id },
    select: { uid: true, status: true, startTime: true, endTime: true, rescheduled: true },
  });
  expect(bookingA).not.toBeNull();
  if (!bookingA) return;
  expect(bookingA.status).toBe("ACCEPTED");
  await testInfo.attach("B01-booking.json", {
    body: JSON.stringify({
      beforeCount,
      after: {
        status: bookingA.status,
        start: observedTime(bookingA.startTime),
        end: observedTime(bookingA.endTime),
      },
    }),
    contentType: "application/json",
  });

  await host.apiLogin();
  await page.goto("/bookings/upcoming");
  await page.getByTestId("booking-actions-dropdown").first().click();
  await page.getByTestId("reschedule").click();
  await page.waitForURL((url) => url.searchParams.has("rescheduleUid"));
  await selectSecondAvailableTimeSlotNextMonth(page);
  await confirmReschedule(page);
  await page.waitForURL((url) => url.pathname.startsWith("/booking"));

  const bookingAAfterReschedule = await prisma.booking.findUnique({
    where: { uid: bookingA.uid },
    select: { status: true, rescheduled: true },
  });
  const bookingB = await prisma.booking.findFirst({
    where: { eventTypeId: eventType.id, fromReschedule: bookingA.uid },
    select: { uid: true, status: true, startTime: true, endTime: true, fromReschedule: true },
  });
  expect(bookingAAfterReschedule?.status).toBe("CANCELLED");
  expect(bookingAAfterReschedule?.rescheduled).toBe(true);
  expect(bookingB?.status).toBe("ACCEPTED");
  expect(bookingB?.fromReschedule).toBe(bookingA.uid);
  expect(bookingB?.startTime.toISOString()).not.toBe(bookingA.startTime.toISOString());
  if (!bookingAAfterReschedule || !bookingB) return;
  await testInfo.attach("B02-reschedule.json", {
    body: JSON.stringify({
      before: { status: bookingA.status, start: observedTime(bookingA.startTime) },
      after: {
        oldStatus: bookingAAfterReschedule.status,
        oldRescheduled: bookingAAfterReschedule.rescheduled,
        newStatus: bookingB.status,
        linkedToOldBooking: Boolean(bookingB.fromReschedule),
        newStart: observedTime(bookingB.startTime),
        newEnd: observedTime(bookingB.endTime),
      },
    }),
    contentType: "application/json",
  });

  await page.goto("/bookings/upcoming");
  await cancelBookingFromBookingsList({ page, nth: 0, reason: cancellationReason });
  const bookingBAfterCancel = await prisma.booking.findUnique({
    where: { uid: bookingB.uid },
    select: { status: true, cancellationReason: true },
  });
  expect(bookingBAfterCancel?.status).toBe("CANCELLED");
  expect(bookingBAfterCancel?.cancellationReason).toBe(cancellationReason);
  if (!bookingBAfterCancel) return;
  await testInfo.attach("B03-cancellation.json", {
    body: JSON.stringify({
      before: { status: bookingB.status, start: observedTime(bookingB.startTime) },
      after: {
        status: bookingBAfterCancel.status,
        cancellationReason: bookingBAfterCancel.cancellationReason,
      },
    }),
    contentType: "application/json",
  });
});
