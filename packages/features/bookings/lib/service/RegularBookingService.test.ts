import {
  BookingLocations,
  createBookingScenario,
  getBooker,
  getGoogleCalendarCredential,
  getMockRequestDataForBooking,
  getOrganizer,
  getScenarioData,
  mockCalendarToHaveNoBusySlots,
  setupAndTeardown,
  TestData,
} from "@calcom/testing/lib/bookingScenario/bookingScenario";
import process from "node:process";
import { getRegularBookingService } from "@calcom/features/bookings/di/RegularBookingService.container";
import * as createBookingModule from "@calcom/features/bookings/lib/handleNewBooking/createBooking";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { HttpError } from "@calcom/lib/http-error";
import type { TraceContext } from "@calcom/lib/tracing";
import { TracedError } from "@calcom/lib/tracing/error";
import { Prisma } from "@calcom/prisma/client";
import { test } from "@calcom/testing/lib/fixtures/fixtures";
import { afterEach, describe, expect, vi } from "vitest";

vi.mock("@calcom/lib/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@calcom/lib/constants")>();
  return {
    ...actual,
    get IS_PRODUCTION(): boolean {
      return process.env.NODE_ENV === "production" || process.env.CALCOM_ENV === "production";
    },
  };
});

vi.mock("@calcom/features/auth/lib/verifyCodeUnAuthenticated", () => ({
  verifyCodeUnAuthenticated: vi.fn(),
}));

describe("RegularBookingService", () => {
  setupAndTeardown();

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe("createBooking conflict handling", () => {
    test("maps Prisma P2002 unique constraint violation to 409 booking_conflict_error", async () => {
      const booker = getBooker({
        email: "booker@example.com",
        name: "Booker",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        username: "organizer",
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
      });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slug: "no-confirmation",
              slotInterval: 30,
              length: 30,
              users: [{ id: 101 }],
            },
          ],
          organizer,
          apps: [TestData.apps["google-calendar"]],
        })
      );

      await mockCalendarToHaveNoBusySlots("googlecalendar", {});

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          user: organizer.username ?? "organizer",
          eventTypeId: 1,
          eventTypeSlug: "no-confirmation",
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: BookingLocations.CalVideo },
          },
        },
      });

      const prismaError = new Error(
        "Unique constraint failed on the constraint: Booking_idempotencyKey_key"
      ) as Error & { code: string; clientVersion: string };
      prismaError.name = "PrismaClientKnownRequestError";
      prismaError.code = "P2002";
      prismaError.clientVersion = "5.0.0";
      Object.setPrototypeOf(prismaError, Prisma.PrismaClientKnownRequestError.prototype);

      vi.spyOn(createBookingModule, "createBooking").mockRejectedValueOnce(prismaError);

      const regularBookingService = getRegularBookingService();

      await expect(
        regularBookingService.createBooking({
          bookingData: mockBookingData,
        })
      ).rejects.toSatisfy((err: unknown) => {
        return (
          err instanceof HttpError && err.statusCode === 409 && err.message === ErrorCode.BookingConflict
        );
      });
    });

    test("maps Prisma P2002 to 409 in production when error is redacted", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("CALCOM_ENV", "production");

      const booker = getBooker({
        email: "booker@example.com",
        name: "Booker",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        username: "organizer",
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
      });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slug: "no-confirmation",
              slotInterval: 30,
              length: 30,
              users: [{ id: 101 }],
            },
          ],
          organizer,
          apps: [TestData.apps["google-calendar"]],
        })
      );

      await mockCalendarToHaveNoBusySlots("googlecalendar", {});

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          user: organizer.username ?? "organizer",
          eventTypeId: 1,
          eventTypeSlug: "no-confirmation",
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: BookingLocations.CalVideo },
          },
        },
      });

      const prismaError = new Error(
        "Unique constraint failed on the constraint: Booking_idempotencyKey_key"
      ) as Error & { code: string; clientVersion: string };
      prismaError.name = "PrismaClientKnownRequestError";
      prismaError.code = "P2002";
      prismaError.clientVersion = "5.0.0";
      Object.setPrototypeOf(prismaError, Prisma.PrismaClientKnownRequestError.prototype);
      const traceContext: TraceContext = {
        traceId: "test_trace_id",
        spanId: "test_span_id",
        operation: "createBooking",
      };
      const tracedError = new TracedError(prismaError, traceContext);

      vi.spyOn(createBookingModule, "createBooking").mockRejectedValueOnce(tracedError);

      const regularBookingService = getRegularBookingService();

      await expect(
        regularBookingService.createBooking({
          bookingData: mockBookingData,
        })
      ).rejects.toSatisfy((err: unknown) => {
        return (
          err instanceof HttpError && err.statusCode === 409 && err.message === ErrorCode.BookingConflict
        );
      });
    });
  });
});
