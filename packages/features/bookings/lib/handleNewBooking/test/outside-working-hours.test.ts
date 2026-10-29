import {
  createBookingScenario,
  getBooker,
  getOrganizer,
  getScenarioData,
  TestData,
} from "@calcom/testing/lib/bookingScenario/bookingScenario";
import process from "node:process";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { BookingStatus } from "@calcom/prisma/enums";
import { getMockRequestDataForBooking } from "@calcom/testing/lib/bookingScenario/getMockRequestDataForBooking";
import { setupAndTeardown } from "@calcom/testing/lib/bookingScenario/setupAndTeardown";
import { test } from "@calcom/testing/lib/fixtures/fixtures";
import { describe, expect } from "vitest";
import { getNewBookingHandler } from "./getNewBookingHandler";

// Local test runs sometime gets too slow
const timeout: number = process.env.CI ? 5000 : 20000;

// getDate() uses the runner's local date, so on runners west of UTC late in the evening
// "tomorrow at 05:00 UTC" can already be in the past. The slots below are UTC, so derive the date in UTC.
const getTomorrowUtcDateString = (): string =>
  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

// Regression coverage for https://github.com/calcom/cal.diy/issues/12092:
// API callers can send any start/end, so the booking service itself must reject
// times outside the organizer's working hours rather than relying on the Booker UI.
describe("handleNewBooking", () => {
  setupAndTeardown();

  describe("Booking outside the organizer's working hours:", () => {
    const setUpOrganizerWithIstWorkHours = async (): Promise<{ booker: ReturnType<typeof getBooker> }> => {
      const booker = getBooker({
        email: "booker@example.com",
        name: "Booker",
      });

      // IstWorkHours is 9:30AM to 6PM IST, i.e. 04:00 to 12:30 UTC
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
              slotInterval: 30,
              length: 30,
              users: [
                {
                  id: 101,
                },
              ],
            },
          ],
          organizer,
        })
      );

      return { booker };
    };

    const getBookingDataFor = ({
      booker,
      start,
      end,
    }: {
      booker: ReturnType<typeof getBooker>;
      start: string;
      end: string;
    }): ReturnType<typeof getMockRequestDataForBooking> =>
      getMockRequestDataForBooking({
        data: {
          start,
          end,
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
          },
        },
      });

    test(
      `should fail with no_available_users_found_error when the slot is entirely outside working hours`,
      async () => {
        const handleNewBooking = getNewBookingHandler();
        const { booker } = await setUpOrganizerWithIstWorkHours();
        const plus1DateString = getTomorrowUtcDateString();

        const mockBookingData = getBookingDataFor({
          booker,
          start: `${plus1DateString}T14:00:00.000Z`,
          end: `${plus1DateString}T14:30:00.000Z`,
        });

        await expect(
          async () =>
            await handleNewBooking({
              bookingData: mockBookingData,
            })
        ).rejects.toThrowError(ErrorCode.NoAvailableUsersFound);
      },
      timeout
    );

    test(
      `should fail with no_available_users_found_error when the slot runs past the end of working hours`,
      async () => {
        const handleNewBooking = getNewBookingHandler();
        const { booker } = await setUpOrganizerWithIstWorkHours();
        const plus1DateString = getTomorrowUtcDateString();

        const mockBookingData = getBookingDataFor({
          booker,
          start: `${plus1DateString}T12:15:00.000Z`,
          end: `${plus1DateString}T12:45:00.000Z`,
        });

        await expect(
          async () =>
            await handleNewBooking({
              bookingData: mockBookingData,
            })
        ).rejects.toThrowError(ErrorCode.NoAvailableUsersFound);
      },
      timeout
    );

    // Guards against the failures above passing for an unrelated reason (e.g. a broken scenario setup)
    test(
      `should create the booking when the same organizer is booked inside working hours`,
      async () => {
        const handleNewBooking = getNewBookingHandler();
        const { booker } = await setUpOrganizerWithIstWorkHours();
        const plus1DateString = getTomorrowUtcDateString();

        const mockBookingData = getBookingDataFor({
          booker,
          start: `${plus1DateString}T05:00:00.000Z`,
          end: `${plus1DateString}T05:30:00.000Z`,
        });

        const createdBooking = await handleNewBooking({
          bookingData: mockBookingData,
        });

        expect(createdBooking.status).toBe(BookingStatus.ACCEPTED);
      },
      timeout
    );
  });
});
