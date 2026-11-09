import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { ErrorWithCode } from "@calcom/lib/errors";
import { expect } from "@playwright/test";
import { test } from "../lib/fixtures";
import {
  bookEventOnThisPage,
  cancelBookingFromBookingsList,
  confirmReschedule,
  selectSecondAvailableTimeSlotNextMonth,
} from "../lib/testUtils";

const select = {
  uid: true,
  status: true,
  rescheduled: true,
  fromReschedule: true,
  startTime: true,
  endTime: true,
  cancellationReason: true,
  rejectionReason: true,
  oneTimePassword: true,
} as const;
const cancellationReason = "QA MBT cancellation";
const rejectionReason = "QA MBT rejection";
const required = (condition: boolean) => {
  if (!condition) throw ErrorWithCode.Factory.BadRequest("MBT oracle failed; sensitive details withheld");
};

test.use({ timezoneId: "Asia/Saigon", trace: "off", screenshot: "off", video: "off" });

test("Issue 06: execute GraphWalker booking path", async ({ page, users, bookings, prisma }) => {
  test.setTimeout(1_800_000);
  const pathFile = process.env.MBT_PATH;
  const evidenceFile = process.env.MBT_EVIDENCE;
  required(Boolean(pathFile && evidenceFile));
  if (!pathFile || !evidenceFile) return;
  const path: string[] = JSON.parse(readFileSync(pathFile, "utf8"));
  const evidence = JSON.parse(readFileSync(evidenceFile, "utf8"));
  const edges = new Set<string>();
  const vertices = new Set<string>();
  const steps: { element: string; result: string; reason?: string }[] = [];
  let operation = "create synthetic host";
  let index = 0;
  let host: Awaited<ReturnType<typeof users.create>> | undefined;
  let regularEventTypeId = 0;
  let optinEventTypeId = 0;
  let a: string | undefined;
  let b: string | undefined;
  let pendingUid: string | undefined;
  let lastCancelledUid: string | undefined;
  let lastRejectedUid: string | undefined;
  let rescheduleUrl = "";
  let slotSelected = false;
  const blockers = new Set<string>();
  const read = () =>
    prisma.booking.findMany({
      where: {
        eventTypeId: {
          in: [regularEventTypeId, optinEventTypeId],
        },
      },
      select,
    });
  const actionIndex = async (uid: string | undefined) => {
    const actions = page.getByTestId("booking-actions-dropdown");
    operation = "wait for booking actions to load";
    await actions.first().waitFor({ state: "visible" });
    operation = "find the synthetic booking in the loaded action menus";
    for (let i = 0; i < (await actions.count()); i++) {
      const candidate = await actions
        .nth(i)
        .evaluate((node) => node.closest('[data-testid="booking-item"]')?.getAttribute("data-booking-uid"));
      if (candidate === uid) return i;
    }
    required(false);
    return -1;
  };
  const freshHost = async () => {
    host = await users.create({
      name: "MBT synthetic host",
      overrideDefaultEventTypes: true,
      eventTypes: [
        {
          title: "Accepted Meeting",
          slug: "accepted",
          length: 30,
          requiresConfirmation: false,
        },
        {
          title: "Opt-in Meeting",
          slug: "optin",
          length: 30,
          requiresConfirmation: true,
        },
      ],
    });
    const regularEvent = host.eventTypes.find((e) => e.slug === "accepted");
    const optinEvent = host.eventTypes.find((e) => e.slug === "optin");
    required(Boolean(regularEvent && optinEvent));
    regularEventTypeId = regularEvent?.id ?? 0;
    optinEventTypeId = optinEvent?.id ?? 0;
    a = undefined;
    b = undefined;
    pendingUid = undefined;
    lastCancelledUid = undefined;
    lastRejectedUid = undefined;
    blockers.clear();
    slotSelected = false;
    required((await read()).length === 0);
    await page.goto(`/${host.username}`);
  };
  const openReschedule = async () => {
    required(Boolean(host && a));
    if (!host) return;
    await host.apiLogin();
    await page.goto("/bookings/upcoming");
    const nth = await actionIndex(a);
    operation = "open the original booking reschedule action";
    await page.getByTestId("booking-actions-dropdown").nth(nth).click();
    await page.getByTestId("reschedule").click();
    await page.waitForURL((url) => url.searchParams.has("rescheduleUid"));
    rescheduleUrl = page.url();
    await selectSecondAvailableTimeSlotNextMonth(page);
    slotSelected = true;
  };
  const unchangedA = async () => {
    const rows = (await read()).filter((row) => !blockers.has(row.uid));
    const rowA = rows.find((row) => row.uid === a);
    required(Boolean(rowA && rowA.status === "ACCEPTED" && !rowA.rescheduled && !rowA.fromReschedule));
  };
  try {
    await freshHost();
    for (; index < path.length; index++) {
      const element = path[index];
      operation = `${element}: UI action and database oracle`;
      switch (element) {
        case "v_NoBooking":
          required((await read()).length === 0);
          break;
        case "e_CreateAcceptedBooking": {
          await page.goto(`/${host?.username}/accepted`);
          await bookEventOnThisPage(page);
          const rows = (await read()).filter((row) => !blockers.has(row.uid));
          required(rows.length === 1 && rows[0].status === "ACCEPTED");
          a = rows[0].uid;
          required(rows[0].endTime > rows[0].startTime);
          break;
        }
        case "e_CreatePendingBooking": {
          await page.goto(`/${host?.username}/optin`);
          await bookEventOnThisPage(page);
          const rows = (await read()).filter((row) => !blockers.has(row.uid));
          required(rows.length === 1 && rows[0].status === "PENDING");
          pendingUid = rows[0].uid;
          required(rows[0].oneTimePassword !== null);
          required(rows[0].endTime > rows[0].startTime);
          break;
        }
        case "v_Pending": {
          const rows = (await read()).filter((row) => !blockers.has(row.uid));
          required(rows.length === 1 && rows[0].uid === pendingUid && rows[0].status === "PENDING");
          required(rows[0].oneTimePassword !== null);
          break;
        }
        case "e_ConfirmPendingBooking": {
          required(Boolean(host && pendingUid));
          if (!host) return;
          await host.apiLogin();
          await page.goto("/bookings/unconfirmed");
          const confirmBtn = page.locator(`[data-testid="confirm"][data-booking-uid="${pendingUid}"]`);
          operation = "wait for confirm button in unconfirmed bookings";
          await confirmBtn.waitFor({ state: "visible" });
          await Promise.all([
            confirmBtn.click(),
            page.waitForResponse((r) => r.url().includes("/api/trpc/bookings/confirm")),
          ]);
          const rows = (await read()).filter((row) => !blockers.has(row.uid));
          required(rows.length === 1 && rows[0].uid === pendingUid && rows[0].status === "ACCEPTED");
          required(rows[0].oneTimePassword === null);
          a = pendingUid;
          pendingUid = undefined;
          break;
        }
        case "e_RejectPendingBooking": {
          required(Boolean(host && pendingUid));
          if (!host) return;
          await host.apiLogin();
          await page.goto("/bookings/unconfirmed");
          const rejectBtn = page.locator(`[data-testid="reject"][data-booking-uid="${pendingUid}"]`);
          operation = "wait for reject button in unconfirmed bookings";
          await rejectBtn.waitFor({ state: "visible" });
          await rejectBtn.click();
          operation = "fill rejection reason dialog and confirm rejection";
          await page.locator('textarea[name="rejectionReason"]').fill(rejectionReason);
          await Promise.all([
            page.getByTestId("rejection-confirm").click(),
            page.waitForResponse((r) => r.url().includes("/api/trpc/bookings/confirm")),
          ]);
          const rows = (await read()).filter((row) => !blockers.has(row.uid));
          const rejected = rows.find((row) => row.uid === pendingUid);
          required(Boolean(rejected && rejected.status === "REJECTED" && rejected.rejectionReason === rejectionReason));
          lastRejectedUid = pendingUid;
          pendingUid = undefined;
          break;
        }
        case "e_CancelPendingBooking": {
          required(Boolean(host && pendingUid));
          if (!host) return;
          await host.apiLogin();
          await page.goto("/bookings/unconfirmed");
          const nth = await actionIndex(pendingUid);
          await cancelBookingFromBookingsList({ page, nth, reason: cancellationReason });
          const current = (await read()).find((booking) => booking.uid === pendingUid);
          required(current?.status === "CANCELLED" && current.cancellationReason === cancellationReason);
          lastCancelledUid = pendingUid;
          pendingUid = undefined;
          break;
        }
        case "v_BookedA":
          await unchangedA();
          break;
        case "e_RescheduleSlotUnavailable": {
          await openReschedule();
          const before = (await read()).find((row) => row.uid === a);
          const date = new URL(page.url()).searchParams.get("date");
          let blockerUid: string | undefined;
          let blockedStart: Date | undefined;
          let blockedEnd: Date | undefined;
          await page.route(
            "**/api/book/event",
            async (route) => {
              try {
                const body: unknown = route.request().postDataJSON();
                if (
                  !host ||
                  !body ||
                  typeof body !== "object" ||
                  !("start" in body) ||
                  !("end" in body) ||
                  typeof body.start !== "string" ||
                  typeof body.end !== "string"
                ) {
                  await route.abort();
                  return;
                }
                blockedStart = new Date(body.start);
                blockedEnd = new Date(body.end);
                required(Number.isFinite(blockedStart.getTime()) && blockedEnd > blockedStart);
                const blocker = await bookings.create(host.id, host.username, regularEventTypeId, {
                  startTime: blockedStart,
                  endTime: blockedEnd,
                  status: "ACCEPTED",
                });
                blockerUid = blocker.uid;
                blockers.add(blocker.uid);
                await route.continue();
              } catch {
                await route.abort();
              }
            },
            { times: 1 }
          );
          operation = "submit stale reschedule request after blocking its exact start/end";
          const responsePromise = page.waitForResponse(
            (r) => new URL(r.url()).pathname === "/api/book/event"
          );
          await page.getByTestId("confirm-reschedule-button").click();
          const response = await responsePromise;
          const rows = await read();
          required(Boolean(blockerUid && blockedStart && blockedEnd));
          required(response.status() >= 400 && response.status() < 500);
          required(rows.some((row) => row.uid === blockerUid));
          required(rows.filter((row) => !blockers.has(row.uid)).length === 1);
          const old = rows.find((row) => row.uid === a);
          required(Boolean(old && JSON.stringify(old) === JSON.stringify(before)));
          required(!rows.some((row) => row.fromReschedule === a));
          evidence.slotUnavailable = {
            httpStatus: response.status(),
            requestSlotBlocked: true,
            urlDateMatchesRequestStart: Boolean(date && new Date(date).getTime() === blockedStart?.getTime()),
            startUTC: blockedStart?.toISOString(),
            endUTC: blockedEnd?.toISOString(),
            originalUnchanged: true,
            replacementCount: 0,
          };
          slotSelected = false;
          break;
        }
        case "v_SlotUnavailable": {
          const rows = await read();
          const old = rows.find((row) => row.uid === a);
          required(old?.status === "ACCEPTED" && !old.rescheduled);
          required(!rows.some((row) => row.fromReschedule === a));
          break;
        }
        case "e_SelectAnotherSlot": {
          await page.goto(rescheduleUrl);
          await selectSecondAvailableTimeSlotNextMonth(page);
          slotSelected = true;
          const rows = await read();
          required(rows.find((row) => row.uid === a)?.status === "ACCEPTED");
          const selected = new URL(page.url()).searchParams.get("slot");
          required(Boolean(selected));
          const time = new Date(selected ?? "").getTime();
          required(
            Number.isFinite(time) &&
              !rows.some(
                (row) =>
                  blockers.has(row.uid) && row.startTime.getTime() <= time && row.endTime.getTime() > time
              )
          );
          break;
        }
        case "e_RescheduleToNewSlot": {
          if (!slotSelected) {
            await openReschedule();
          }
          await confirmReschedule(page);
          await page.waitForURL((url) => url.pathname.startsWith("/booking"));
          const rows = await read();
          const old = rows.find((row) => row.uid === a);
          const replacements = rows.filter((row) => row.fromReschedule === a);
          required(old?.status === "CANCELLED" && old.rescheduled === true && replacements.length === 1);
          const replacement = replacements[0];
          required(replacement.uid !== a && replacement.status === "ACCEPTED");
          required(replacement.startTime.getTime() !== old?.startTime.getTime());
          required(replacement.endTime > replacement.startTime);
          b = replacement.uid;
          slotSelected = false;
          break;
        }
        case "v_BookedB": {
          const rows = await read();
          required(rows.find((row) => row.uid === a)?.rescheduled === true);
          const current = rows.find((row) => row.uid === b);
          required(current?.status === "ACCEPTED" && current.fromReschedule === a);
          break;
        }
        case "e_CancelAcceptedBooking": {
          required(Boolean(host && a));
          if (!host) return;
          await host.apiLogin();
          await page.goto("/bookings/upcoming");
          const nth = await actionIndex(a);
          await cancelBookingFromBookingsList({ page, nth, reason: cancellationReason });
          const current = (await read()).find((booking) => booking.uid === a);
          required(current?.status === "CANCELLED" && current.cancellationReason === cancellationReason);
          lastCancelledUid = a;
          a = undefined;
          break;
        }
        case "e_CancelRescheduledBooking": {
          required(Boolean(host && b));
          if (!host) return;
          await host.apiLogin();
          await page.goto("/bookings/upcoming");
          const nth = await actionIndex(b);
          await cancelBookingFromBookingsList({ page, nth, reason: cancellationReason });
          const current = (await read()).find((booking) => booking.uid === b);
          required(current?.status === "CANCELLED" && current.cancellationReason === cancellationReason);
          lastCancelledUid = b;
          b = undefined;
          break;
        }
        case "v_Cancelled": {
          const current = (await read()).find((booking) => booking.uid === lastCancelledUid);
          required(Boolean(current && current.status === "CANCELLED" && current.cancellationReason === cancellationReason));
          break;
        }
        case "v_Rejected": {
          const current = (await read()).find((booking) => booking.uid === lastRejectedUid);
          required(Boolean(current && current.status === "REJECTED" && current.rejectionReason === rejectionReason));
          break;
        }
        case "e_StartNewBookingAfterCancel": {
          const oldEventType = regularEventTypeId;
          const before = await read();
          await freshHost();
          const after = await prisma.booking.findMany({ where: { eventTypeId: oldEventType }, select });
          required(JSON.stringify(before) === JSON.stringify(after));
          break;
        }
        case "e_StartNewBookingAfterReject": {
          const oldEventType = optinEventTypeId;
          const before = await read();
          await freshHost();
          const after = await prisma.booking.findMany({ where: { eventTypeId: oldEventType }, select });
          required(JSON.stringify(before) === JSON.stringify(after));
          break;
        }
        default:
          required(false);
      }
      steps.push({ element, result: "pass" });
      if (element.startsWith("e_")) edges.add(element);
      else vertices.add(element);
    }
    required(edges.size === 12 && vertices.size === 7);
  } catch (error) {
    if (index < path.length)
      steps.push({
        element: path[index],
        result: error instanceof ErrorWithCode ? "fail" : "chưa kiểm chứng",
        reason: `${operation}: ${error instanceof ErrorWithCode ? "oracle mismatch" : "action unavailable or timed out"}; sensitive details withheld`,
      });
    for (const element of path.slice(index + 1))
      steps.push({ element, result: "chưa kiểm chứng", reason: "Earlier step failed" });
    throw ErrorWithCode.Factory.BadRequest("MBT failed; see sanitized evidence");
  } finally {
    evidence.steps = steps;
    evidence.result = edges.size === 12 && vertices.size === 7 && index === path.length ? "pass" : "fail";
    evidence.coverage = {
      edges: { visited: edges.size, total: 12, percent: (edges.size / 12) * 100 },
      vertices: { visited: vertices.size, total: 7, percent: (vertices.size / 7) * 100 },
    };
    writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2));
    await users.deleteAll();
  }
  expect(edges.size).toBe(12);
  expect(vertices.size).toBe(7);
});
