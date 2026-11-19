import prismock from "@calcom/testing/lib/__mocks__/prisma";

import {
  TestData,
  createBookingScenario,
  getBooker,
  getDate,
  getOrganizer,
  getScenarioData,
} from "@calcom/testing/lib/bookingScenario/bookingScenario";
import { getMockRequestDataForBooking } from "@calcom/testing/lib/bookingScenario/getMockRequestDataForBooking";
import { setupAndTeardown } from "@calcom/testing/lib/bookingScenario/setupAndTeardown";

import { describe, expect, vi } from "vitest";

import { ErrorCode } from "@calcom/lib/errorCodes";
import { Prisma } from "@calcom/prisma/client";
import { test } from "@calcom/testing/lib/fixtures/fixtures";

import { getNewBookingHandler } from "./getNewBookingHandler";

vi.mock("@calcom/lib/constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@calcom/lib/constants")>()),
  IS_PRODUCTION: true,
}));

const timeout = process.env.CI ? 5000 : 20000;

const eventLength = 30;

describe("handleNewBooking", () => {
  setupAndTeardown();

  describe(
    "Booking Conflicts",
    () => {
      test(
        "should return booking_conflict_error when booking creation hits a unique constraint violation",
        async ({}) => {
          const handleNewBooking = getNewBookingHandler();

          const booker = getBooker({
            email: "booker@example.com",
            name: "Booker",
          });

          const organizer = getOrganizer({
            name: "Organizer",
            email: "organizer@example.com",
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
          });

          await createBookingScenario(
            getScenarioData({
              eventTypes: [
                {
                  id: 1,
                  slotInterval: eventLength,
                  length: eventLength,
                  users: [{ id: 101 }],
                },
              ],
              organizer,
            })
          );

          const { dateString } = getDate({ dateIncrement: 1 });

          const mockBookingData = getMockRequestDataForBooking({
            data: {
              start: `${dateString}T05:00:00.000Z`,
              end: `${dateString}T05:30:00.000Z`,
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: "New York" },
              },
            },
          });

          const uniqueViolation = new Prisma.PrismaClientKnownRequestError(
            "Unique constraint failed on the fields: (`idempotencyKey`)",
            { code: "P2002", clientVersion: "test" }
          );
          vi.spyOn(prismock.booking, "create").mockRejectedValueOnce(uniqueViolation);

          // In production redactError strips the Prisma error code, so the service must
          // still recognize the unique-constraint violation and report a conflict.
          await expect(handleNewBooking({ bookingData: mockBookingData })).rejects.toThrowError(
            ErrorCode.BookingConflict
          );
        },
        timeout
      );
    }
  );
});
