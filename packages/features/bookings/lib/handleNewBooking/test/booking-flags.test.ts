import prismaMock from "@calcom/testing/lib/__mocks__/prisma";

import {
  createBookingScenario,
  getDate,
  getGoogleCalendarCredential,
  TestData,
  getOrganizer,
  getBooker,
  getScenarioData,
  mockCalendarToHaveNoBusySlots,
  mockCalendar,
} from "@calcom/testing/lib/bookingScenario/bookingScenario";
import { expectBookingToBeInDatabase } from "@calcom/testing/lib/bookingScenario/expects";
import { getMockRequestDataForBooking } from "@calcom/testing/lib/bookingScenario/getMockRequestDataForBooking";
import { setupAndTeardown } from "@calcom/testing/lib/bookingScenario/setupAndTeardown";

import { describe, expect, test, vi } from "vitest";

import { BookingStatus } from "@calcom/prisma/enums";

import { getNewBookingHandler } from "./getNewBookingHandler";

setupAndTeardown();

describe("handleNewBooking - Booking Flags", () => {
  describe("skipAvailabilityCheck flag", () => {
    test("should skip availability checks when skipAvailabilityCheck is true", async () => {
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
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
      });

      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          webhooks: [
            {
              userId: organizer.id,
              eventTriggers: ["BOOKING_CREATED"],
              subscriberUrl: "http://my-webhook.example.com",
              active: true,
              eventTypeId: 1,
              appId: null,
            },
          ],
          eventTypes: [
            {
              id: 1,
              slotInterval: 45,
              length: 45,
              users: [
                {
                  id: 101,
                },
              ],
            },
          ],
          organizer,
          apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
        })
      );

      mockCalendarToHaveNoBusySlots("googlecalendar", {
        create: {
          uid: "MOCK_ID",
        },
      });

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "integrations:daily" },
          },
          start: `${plus1DateString}T05:00:00.000Z`,
          end: `${plus1DateString}T05:45:00.000Z`,
        },
      });

      const createdBooking = await handleNewBooking({
        bookingData: mockBookingData,
        skipAvailabilityCheck: true,
      });

      expect(createdBooking.responses).toEqual(
        expect.objectContaining({
          email: booker.email,
          name: booker.name,
        })
      );

      expect(createdBooking.status).toBe(BookingStatus.ACCEPTED);

      await expectBookingToBeInDatabase({
        description: "",
        location: "integrations:daily",
        responses: expect.objectContaining({
          email: booker.email,
          name: booker.name,
        }),
        uid: createdBooking.uid,
        eventTypeId: mockBookingData.eventTypeId,
        status: BookingStatus.ACCEPTED,
      });
    });
  });

  describe("skipEventLimitsCheck flag", () => {
    test("should skip event limits checks when skipEventLimitsCheck is true", async () => {
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
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
      });

      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 45,
              length: 45,
              bookingLimits: {
                PER_DAY: 1,
              },
              users: [
                {
                  id: 101,
                },
              ],
            },
          ],
          organizer,
          apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
        })
      );

      mockCalendarToHaveNoBusySlots("googlecalendar", {
        create: {
          uid: "MOCK_ID",
        },
      });

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "integrations:daily" },
          },
          start: `${plus1DateString}T05:00:00.000Z`,
          end: `${plus1DateString}T05:45:00.000Z`,
        },
      });

      const createdBooking = await handleNewBooking({
        bookingData: mockBookingData,
        skipEventLimitsCheck: true,
      });

      expect(createdBooking.responses).toEqual(
        expect.objectContaining({
          email: booker.email,
          name: booker.name,
        })
      );

      expect(createdBooking.status).toBe(BookingStatus.ACCEPTED);

      await expectBookingToBeInDatabase({
        description: "",
        location: "integrations:daily",
        responses: expect.objectContaining({
          email: booker.email,
          name: booker.name,
        }),
        uid: createdBooking.uid,
        eventTypeId: mockBookingData.eventTypeId,
        status: BookingStatus.ACCEPTED,
      });
    });
  });

  describe("skipCalendarSyncTaskCreation flag", () => {
    test("should skip calendar sync when skipCalendarSyncTaskCreation is true", async () => {
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
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
      });

      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 45,
              length: 45,
              users: [
                {
                  id: 101,
                },
              ],
            },
          ],
          organizer,
          apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
        })
      );

      mockCalendar("googlecalendar", {
        create: {
          uid: "MOCK_ID",
        },
      });

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "integrations:daily" },
          },
          start: `${plus1DateString}T05:00:00.000Z`,
          end: `${plus1DateString}T05:45:00.000Z`,
        },
      });

      const createdBooking = await handleNewBooking({
        bookingData: mockBookingData,
        skipCalendarSyncTaskCreation: true,
      });

      expect(createdBooking.responses).toEqual(
        expect.objectContaining({
          email: booker.email,
          name: booker.name,
        })
      );

      expect(createdBooking.status).toBe(BookingStatus.ACCEPTED);

      await expectBookingToBeInDatabase({
        description: "",
        location: "integrations:daily",
        responses: expect.objectContaining({
          email: booker.email,
          name: booker.name,
        }),
        uid: createdBooking.uid,
        eventTypeId: mockBookingData.eventTypeId,
        status: BookingStatus.ACCEPTED,
      });

      const actualBooking = await prismaMock.booking.findFirst({
        where: { uid: createdBooking.uid },
        include: { references: true },
      });
      expect(actualBooking?.references).toEqual([]);
    });
  });

  describe("combined flags", () => {
    test("should work with multiple flags enabled", async () => {
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
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
      });

      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 45,
              length: 45,
              bookingLimits: {
                PER_DAY: 1,
              },
              users: [
                {
                  id: 101,
                },
              ],
            },
          ],
          organizer,
          apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
        })
      );

      mockCalendar("googlecalendar", {
        create: {
          uid: "MOCK_ID",
        },
      });

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "integrations:daily" },
          },
          start: `${plus1DateString}T05:00:00.000Z`,
          end: `${plus1DateString}T05:45:00.000Z`,
        },
      });

      const createdBooking = await handleNewBooking({
        bookingData: mockBookingData,
        skipAvailabilityCheck: true,
        skipEventLimitsCheck: true,
        skipCalendarSyncTaskCreation: true,
      });

      expect(createdBooking.responses).toEqual(
        expect.objectContaining({
          email: booker.email,
          name: booker.name,
        })
      );

      expect(createdBooking.status).toBe(BookingStatus.ACCEPTED);

      await expectBookingToBeInDatabase({
        description: "",
        location: "integrations:daily",
        responses: expect.objectContaining({
          email: booker.email,
          name: booker.name,
        }),
        uid: createdBooking.uid,
        eventTypeId: mockBookingData.eventTypeId,
        status: BookingStatus.ACCEPTED,
      });

      const actualBooking = await prismaMock.booking.findFirst({
        where: { uid: createdBooking.uid },
        include: { references: true },
      });
      expect(actualBooking?.references).toEqual([]);
    });
  });

  describe("forceConfirm flag", () => {
    test("should create booking as ACCEPTED when forceConfirm is true, even when requiresConfirmation is true", async () => {
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
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
      });

      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          webhooks: [
            {
              userId: organizer.id,
              eventTriggers: ["BOOKING_CREATED"],
              subscriberUrl: "http://my-webhook.example.com",
              active: true,
              eventTypeId: 1,
              appId: null,
            },
          ],
          eventTypes: [
            {
              id: 1,
              slotInterval: 45,
              length: 45,
              requiresConfirmation: true,
              userId: 101,
              users: [
                {
                  id: 101,
                },
              ],
            },
          ],
          organizer,
          apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
        })
      );

      mockCalendarToHaveNoBusySlots("googlecalendar", {
        create: {
          uid: "MOCK_ID",
        },
      });

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "integrations:daily" },
          },
          start: `${plus1DateString}T05:00:00.000Z`,
          end: `${plus1DateString}T05:45:00.000Z`,
          forceConfirm: true,
        },
      });

      const createdBooking = await handleNewBooking({
        bookingData: mockBookingData,
        userId: 101, // Owner
      });

      expect(createdBooking.responses).toEqual(
        expect.objectContaining({
          email: booker.email,
          name: booker.name,
        })
      );

      // Even though requiresConfirmation is true, forceConfirm=true from owner should produce ACCEPTED
      expect(createdBooking.status).toBe(BookingStatus.ACCEPTED);

      await expectBookingToBeInDatabase({
        description: "",
        location: "integrations:daily",
        responses: expect.objectContaining({
          email: booker.email,
          name: booker.name,
        }),
        uid: createdBooking.uid,
        eventTypeId: mockBookingData.eventTypeId,
        status: BookingStatus.ACCEPTED,
      });
    });

    test("should create booking as PENDING when requiresConfirmation is true and forceConfirm is not set (regression)", async () => {
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
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
      });

      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          webhooks: [
            {
              userId: organizer.id,
              eventTriggers: ["BOOKING_CREATED"],
              subscriberUrl: "http://my-webhook.example.com",
              active: true,
              eventTypeId: 1,
              appId: null,
            },
          ],
          eventTypes: [
            {
              id: 1,
              slotInterval: 45,
              length: 45,
              requiresConfirmation: true,
              users: [
                {
                  id: 101,
                },
              ],
            },
          ],
          organizer,
          apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
        })
      );

      mockCalendarToHaveNoBusySlots("googlecalendar", {
        create: {
          uid: "MOCK_ID",
        },
      });

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "integrations:daily" },
          },
          start: `${plus1DateString}T05:00:00.000Z`,
          end: `${plus1DateString}T05:45:00.000Z`,
          // forceConfirm is NOT set — booking must remain PENDING
        },
      });

      const createdBooking = await handleNewBooking({
        bookingData: mockBookingData,
      });

      // Without forceConfirm, requiresConfirmation event type keeps PENDING status
      expect(createdBooking.status).toBe(BookingStatus.PENDING);

      await expectBookingToBeInDatabase({
        description: "",
        location: "integrations:daily",
        responses: expect.objectContaining({
          email: booker.email,
          name: booker.name,
        }),
        uid: createdBooking.uid,
        eventTypeId: mockBookingData.eventTypeId,
        status: BookingStatus.PENDING,
      });
    });

    test("should NOT honor forceConfirm if caller is NOT owner/admin", async () => {
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
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
      });

      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 45,
              length: 45,
              requiresConfirmation: true,
              users: [{ id: 101 }],
              userId: 101, // eventType owner
            },
          ],
          organizer,
        })
      );

      vi.spyOn(prismaMock.user, "findUnique").mockResolvedValueOnce({
        id: 999,
        role: "USER", // Not an admin
      } as Awaited<ReturnType<typeof prismaMock.user.findUnique>>);

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
          },
          start: `${plus1DateString}T05:00:00.000Z`,
          end: `${plus1DateString}T05:45:00.000Z`,
          forceConfirm: true,
        },
      });

      const createdBooking = await handleNewBooking({
        bookingData: mockBookingData,
        userId: 999, // Unauthorized caller
      });

      // forceConfirm should be ignored, status should be PENDING
      expect(createdBooking.status).toBe(BookingStatus.PENDING);
    });
  });
});
