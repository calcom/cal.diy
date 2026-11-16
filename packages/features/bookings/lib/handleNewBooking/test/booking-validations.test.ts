/**
 * Booking Validation Specifications
 * These specifications verify the business rules and validation behavior for booking creation
 */
import prismaMock from "@calcom/testing/lib/__mocks__/prisma";

import {
  createBookingScenario,
  TestData,
  getOrganizer,
  getBooker,
  getScenarioData,
  getGoogleCalendarCredential,
  mockCalendarToHaveNoBusySlots,
  getMockBookingAttendee,
} from "@calcom/testing/lib/bookingScenario/bookingScenario";
import { getMockRequestDataForBooking } from "@calcom/testing/lib/bookingScenario/getMockRequestDataForBooking";
import { setupAndTeardown } from "@calcom/testing/lib/bookingScenario/setupAndTeardown";

import { afterEach, beforeEach, vi } from "vitest";
import { describe, expect } from "vitest";

import { BookingStatus } from "@calcom/prisma/enums";
import { test } from "@calcom/testing/lib/fixtures/fixtures";

import { getNewBookingHandler } from "./getNewBookingHandler";

vi.mock("@calcom/features/auth/lib/verifyCodeUnAuthenticated", () => ({
  verifyCodeUnAuthenticated: vi.fn(),
}));

const { mockFindManyByEmailsWithEmailVerificationSettings } = vi.hoisted(() => ({
  mockFindManyByEmailsWithEmailVerificationSettings: vi.fn(),
}));

vi.mock("@calcom/features/users/repositories/UserRepository", async (importOriginal) => {
  const actual = await importOriginal();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const OriginalUserRepository = (actual as any).UserRepository;

  return {
    ...actual,
    UserRepository: vi.fn(function (prisma) {
      const realInstance = new OriginalUserRepository(prisma);
      realInstance.findManyByEmailsWithEmailVerificationSettings =
        mockFindManyByEmailsWithEmailVerificationSettings;
      return realInstance;
    }),
  };
});

function addToBlacklistedEmails(emails: string[]) {
  process.env.BLACKLISTED_GUEST_EMAILS = emails.join(",");
}

function resetBlacklistedEmails() {
  delete process.env.BLACKLISTED_GUEST_EMAILS;
}

beforeEach(() => {
  mockFindManyByEmailsWithEmailVerificationSettings.mockResolvedValue([]);
});

afterEach(() => {
  resetBlacklistedEmails();
  vi.clearAllMocks();
});

describe("Booking Validation Specifications", () => {
  setupAndTeardown();

  describe("Email Blacklist Validation", () => {
    test("when email is in BLACKLISTED_GUEST_EMAILS, allow the user to book only if they are logged in with that email", async () => {
      const handleNewBooking = getNewBookingHandler();
      const blockedEmail = "organizer@example.com"; // Use organizer's email as the blocked one

      const booker = getBooker({
        email: blockedEmail,
        name: "Organizer",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
        emailVerified: new Date(),
      });

      addToBlacklistedEmails(["organizer@example.com", "spam@test.com"]);

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
          apps: [TestData.apps["google-calendar"]],
        })
      );

      await mockCalendarToHaveNoBusySlots("googlecalendar", {});

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
          },
        },
      });

      // Non logged in user should not be able to book
      await expect(
        handleNewBooking({
          bookingData: mockBookingData,
        })
      ).rejects.toThrow(
        "Attendee email has been blocked. Make sure to login as organizer@example.com to use this email for creating a booking."
      );

      // Should allow booking when the user who owns the blacklisted email is logged in
      const createdBooking = await handleNewBooking({
        bookingData: mockBookingData,
        userId: 101, // Same as organizer who owns the blacklisted email
      });

      expect(createdBooking).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          uid: expect.any(String),
          status: BookingStatus.ACCEPTED,
        })
      );
    });

    test("prevents booking when blacklisted email is not verified in the system", async () => {
      const handleNewBooking = getNewBookingHandler();
      const blockedEmail = "blocked@example.com";

      const booker = getBooker({
        email: blockedEmail,
        name: "Unverified User",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
        emailVerified: null,
      });

      // Mock environment variable for blacklisted emails
      addToBlacklistedEmails(["blocked@example.com"]);

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
          apps: [TestData.apps["google-calendar"]],
        })
      );

      await mockCalendarToHaveNoBusySlots("googlecalendar", {});

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
          },
        },
      });

      // Should prevent booking when blacklisted email has no verified user in database
      await expect(
        handleNewBooking({
          bookingData: mockBookingData,
        })
      ).rejects.toThrow("Cannot use this email to create the booking.");
    });

    test("blocks a blacklisted email listed after whitespace in BLACKLISTED_GUEST_EMAILS", async () => {
      const handleNewBooking = getNewBookingHandler();
      const blockedEmail = "blocked@example.com";

      const booker = getBooker({
        email: blockedEmail,
        name: "Unverified User",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
        emailVerified: null,
      });

      process.env.BLACKLISTED_GUEST_EMAILS = "spam@test.com, blocked@example.com";

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
          apps: [TestData.apps["google-calendar"]],
        })
      );

      await mockCalendarToHaveNoBusySlots("googlecalendar", {});

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
          },
        },
      });

      await expect(
        handleNewBooking({
          bookingData: mockBookingData,
        })
      ).rejects.toThrow("Cannot use this email to create the booking.");
    });
  });

  describe("Active Bookings Limit Validation", () => {
    test("allows booking when user is under their active booking limit", async () => {
      vi.setSystemTime(new Date("2025-01-01"));
      const plus1DateString = "2025-01-02";

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

      // Create test scenario with event type that has maxActiveBookingsPerBooker limit
      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 30,
              length: 30,
              // Two bookings allowed for the booker
              maxActiveBookingsPerBooker: 2,
              users: [
                {
                  id: 101,
                },
              ],
            },
          ],
          organizer,
          apps: [TestData.apps["google-calendar"]],
          bookings: [
            {
              uid: "existing-booking-1",
              eventTypeId: 1,
              userId: organizer.id,
              startTime: `${plus1DateString}T10:00:00.000Z`,
              endTime: `${plus1DateString}T10:30:00.000Z`,
              title: "Existing Booking",
              status: BookingStatus.ACCEPTED,
              // Booker already has a booking in future
              attendees: [
                {
                  email: booker.email,
                },
              ],
            },
          ],
        })
      );

      await mockCalendarToHaveNoBusySlots("googlecalendar", {});

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
          },
        },
      });

      // Should allow booking when user has not reached their limit (1 booking < 2 limit)
      const createdBooking = await handleNewBooking({
        bookingData: mockBookingData,
      });

      expect(createdBooking).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          uid: expect.any(String),
          status: BookingStatus.ACCEPTED,
        })
      );

      // Second booking should be rejected
      await expect(
        handleNewBooking({
          bookingData: mockBookingData,
        })
      ).rejects.toThrow("booker_limit_exceeded_error");
    });

    test("enforces booking limits with reschedule option when enabled", async () => {
      vi.setSystemTime(new Date("2025-01-01"));
      const plus1DateString = "2025-01-02";
      const plus2DateString = "2025-01-03";

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

      // Create test scenario with event type that has reschedule option enabled
      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 30,
              length: 30,
              maxActiveBookingsPerBooker: 2,
              maxActiveBookingPerBookerOfferReschedule: true,
              users: [
                {
                  id: 101,
                },
              ],
            },
          ],
          organizer,
          apps: [TestData.apps["google-calendar"]],
          bookings: [
            {
              uid: "existing-booking-1",
              eventTypeId: 1,
              userId: organizer.id,
              startTime: `${plus1DateString}T10:00:00.000Z`,
              endTime: `${plus1DateString}T10:30:00.000Z`,
              title: "Existing Booking",
              status: BookingStatus.ACCEPTED,
              attendees: [
                {
                  email: booker.email,
                },
              ],
            },
            {
              uid: "existing-booking-2",
              eventTypeId: 1,
              userId: organizer.id,
              startTime: `${plus2DateString}T10:00:00.000Z`,
              endTime: `${plus2DateString}T10:30:00.000Z`,
              title: "Existing Booking",
              status: BookingStatus.ACCEPTED,
              attendees: [
                {
                  email: booker.email,
                },
              ],
            },
          ],
        })
      );

      await mockCalendarToHaveNoBusySlots("googlecalendar", {});

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
          },
        },
      });

      try {
        await handleNewBooking({
          bookingData: mockBookingData,
        });
      } catch (error) {
        expect(error.message).toEqual("booker_limit_exceeded_error_reschedule");
        expect(error.data).toEqual(
          expect.objectContaining({
            rescheduleUid: "existing-booking-1",
          })
        );
      }
    });

    test("includes seatUid in reschedule error for seated events", async () => {
      vi.setSystemTime(new Date("2025-01-01"));
      const plus1DateString = "2025-01-02";
      const plus2DateString = "2025-01-03";

      const handleNewBooking = getNewBookingHandler();

      const bookerA = getBooker({
        email: "bookerA@example.com",
        name: "Booker A",
      });

      const bookerB = getBooker({
        email: "bookerB@example.com",
        name: "Booker B",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
      });

      const seatReferenceUidA = "seat-reference-uid-a";

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 30,
              length: 30,
              maxActiveBookingsPerBooker: 1,
              maxActiveBookingPerBookerOfferReschedule: true,
              seatsPerTimeSlot: 3,
              users: [
                {
                  id: 101,
                },
              ],
            },
          ],
          organizer,
          apps: [TestData.apps["google-calendar"]],
          bookings: [
            {
              uid: "existing-booking-1",
              eventTypeId: 1,
              userId: organizer.id,
              startTime: `${plus1DateString}T10:00:00.000Z`,
              endTime: `${plus1DateString}T10:30:00.000Z`,
              title: "Existing Booking",
              status: BookingStatus.ACCEPTED,
              attendees: [
                getMockBookingAttendee({
                  id: 1,
                  name: bookerA.name,
                  email: bookerA.email,
                  locale: "en",
                  timeZone: "America/Toronto",
                  bookingSeat: {
                    referenceUid: seatReferenceUidA,
                    data: {},
                  },
                }),
                getMockBookingAttendee({
                  id: 2,
                  name: bookerB.name,
                  email: bookerB.email,
                  locale: "en",
                  timeZone: "America/Toronto",
                  bookingSeat: {
                    referenceUid: "seat-reference-uid-b",
                    data: {},
                  },
                }),
              ],
            },
          ],
        })
      );

      await mockCalendarToHaveNoBusySlots("googlecalendar", {});

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          start: `${plus2DateString}T10:00:00.000Z`,
          end: `${plus2DateString}T10:30:00.000Z`,
          responses: {
            email: bookerA.email,
            name: bookerA.name,
            location: { optionValue: "", value: "New York" },
          },
        },
      });

      try {
        await handleNewBooking({
          bookingData: mockBookingData,
        });
        expect.fail("Expected booking to throw booker_limit_exceeded_error_reschedule");
      } catch (error) {
        expect(error.message).toEqual("booker_limit_exceeded_error_reschedule");
        expect(error.data).toEqual(
          expect.objectContaining({
            rescheduleUid: "existing-booking-1",
            seatUid: seatReferenceUidA,
          })
        );
      }
    });
  });

  describe("User Email Verification Setting", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test("should block booking when main booker requires verification and is not logged in", async () => {
      const handleNewBooking = getNewBookingHandler();

      const booker = getBooker({
        email: "user@example.com",
        name: "User",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
        emailVerified: new Date(),
      });

      const userWithVerificationRequired = getOrganizer({
        name: "User",
        email: "user@example.com",
        id: 201,
        schedules: [TestData.schedules.IstWorkHours],
        emailVerified: new Date(),
        requiresBookerEmailVerification: true,
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
          usersApartFromOrganizer: [userWithVerificationRequired],
          apps: [TestData.apps["google-calendar"]],
        })
      );

      await mockCalendarToHaveNoBusySlots("googlecalendar", {});

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
          },
        },
      });

      await expect(
        handleNewBooking({
          bookingData: mockBookingData,
        })
      ).rejects.toThrow(
        "Attendee email has been blocked. Make sure to login as user@example.com to use this email for creating a booking."
      );
    });

    test("should allow booking when main booker requires verification but is logged in", async () => {
      const handleNewBooking = getNewBookingHandler();

      const booker = getBooker({
        email: "user@example.com",
        name: "User",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
        emailVerified: new Date(),
      });

      const userWithVerificationRequired = getOrganizer({
        name: "User",
        email: "user@example.com",
        id: 201,
        schedules: [TestData.schedules.IstWorkHours],
        emailVerified: new Date(),
        requiresBookerEmailVerification: true,
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
          usersApartFromOrganizer: [userWithVerificationRequired],
          apps: [TestData.apps["google-calendar"]],
        })
      );

      await mockCalendarToHaveNoBusySlots("googlecalendar", {});

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
          },
        },
      });

      const createdBooking = await handleNewBooking({
        bookingData: mockBookingData,
        userId: 201,
      });

      expect(createdBooking).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          uid: expect.any(String),
          status: BookingStatus.ACCEPTED,
        })
      );
    });

    test("should create booking when main booker provides valid verification code", async () => {
      const handleNewBooking = getNewBookingHandler();
      const { verifyCodeUnAuthenticated } = await import(
        "@calcom/features/auth/lib/verifyCodeUnAuthenticated"
      );

      vi.mocked(verifyCodeUnAuthenticated).mockResolvedValue(true);

      const booker = getBooker({
        email: "user@example.com",
        name: "User",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
        emailVerified: new Date(),
      });

      const userWithVerificationRequired = getOrganizer({
        name: "User",
        email: "user@example.com",
        id: 201,
        schedules: [TestData.schedules.IstWorkHours],
        emailVerified: new Date(),
        requiresBookerEmailVerification: true,
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
          usersApartFromOrganizer: [userWithVerificationRequired],
          apps: [TestData.apps["google-calendar"]],
        })
      );

      await mockCalendarToHaveNoBusySlots("googlecalendar", {});

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
          },
          verificationCode: "valid-code-123",
        },
      });

      const createdBooking = await handleNewBooking({
        bookingData: mockBookingData,
      });

      expect(createdBooking).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          uid: expect.any(String),
          status: BookingStatus.ACCEPTED,
        })
      );

      expect(verifyCodeUnAuthenticated).toHaveBeenCalledWith("user@example.com", "valid-code-123");
    });

    test("should require verification when secondary email of user with verification setting is used as main booker", async () => {
      const handleNewBooking = getNewBookingHandler();

      const booker = getBooker({
        email: "secondary@example.com",
        name: "User",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
        emailVerified: new Date(),
      });

      const userWithVerificationRequired = getOrganizer({
        name: "User",
        email: "primary@example.com",
        id: 201,
        schedules: [TestData.schedules.IstWorkHours],
        emailVerified: new Date(),
        requiresBookerEmailVerification: true,
        secondaryEmails: [{ email: "secondary@example.com", emailVerified: new Date() }],
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
          usersApartFromOrganizer: [userWithVerificationRequired],
          apps: [TestData.apps["google-calendar"]],
        })
      );

      await mockCalendarToHaveNoBusySlots("googlecalendar", {});

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
          },
        },
      });

      await expect(
        handleNewBooking({
          bookingData: mockBookingData,
        })
      ).rejects.toThrow(
        "Attendee email has been blocked. Make sure to login as secondary@example.com to use this email for creating a booking."
      );
    });

    test("should filter out guest that requires verification", async () => {
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
        emailVerified: new Date(),
      });

      const guestWithVerification = getOrganizer({
        name: "Guest",
        email: "guest-with-verification@example.com",
        id: 202,
        schedules: [TestData.schedules.IstWorkHours],
        emailVerified: new Date(),
        requiresBookerEmailVerification: true,
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
          usersApartFromOrganizer: [guestWithVerification],
          apps: [TestData.apps["google-calendar"]],
        })
      );

      await mockCalendarToHaveNoBusySlots("googlecalendar", {});

      mockFindManyByEmailsWithEmailVerificationSettings.mockResolvedValue([
        {
          email: "guest-with-verification@example.com",
          matchedEmail: "guest-with-verification@example.com",
          requiresBookerEmailVerification: true,
        },
      ]);

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
            guests: ["guest-with-verification@example.com", "regular-guest@example.com"],
          },
        },
      });

      const createdBooking = await handleNewBooking({
        bookingData: mockBookingData,
      });

      expect(createdBooking).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          uid: expect.any(String),
          status: BookingStatus.ACCEPTED,
        })
      );

      const booking = await prismaMock.booking.findFirst({
        where: { id: createdBooking.id },
        include: { attendees: true },
      });

      const guestEmails = booking?.attendees.map((a) => a.email).filter((e) => e !== booker.email);
      expect(guestEmails).toEqual(["regular-guest@example.com"]);
      expect(guestEmails).not.toContain("guest-with-verification@example.com");
    });

    test("should filter out secondary email with verification when added as guest", async () => {
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
        emailVerified: new Date(),
      });

      const userWithSecondaryEmail = getOrganizer({
        name: "User",
        email: "primary@example.com",
        id: 202,
        schedules: [TestData.schedules.IstWorkHours],
        emailVerified: new Date(),
        requiresBookerEmailVerification: true,
        secondaryEmails: [{ email: "secondary@example.com", emailVerified: new Date() }],
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
          usersApartFromOrganizer: [userWithSecondaryEmail],
          apps: [TestData.apps["google-calendar"]],
        })
      );

      await mockCalendarToHaveNoBusySlots("googlecalendar", {});

      mockFindManyByEmailsWithEmailVerificationSettings.mockResolvedValue([
        {
          email: "primary@example.com",
          matchedEmail: "secondary@example.com",
          requiresBookerEmailVerification: true,
        },
      ]);

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
            guests: ["secondary@example.com", "regular-guest@example.com"],
          },
        },
      });

      const createdBooking = await handleNewBooking({
        bookingData: mockBookingData,
      });

      expect(createdBooking).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          uid: expect.any(String),
          status: BookingStatus.ACCEPTED,
        })
      );

      const booking = await prismaMock.booking.findFirst({
        where: { id: createdBooking.id },
        include: { attendees: true },
      });

      const guestEmails = booking?.attendees.map((a) => a.email).filter((e) => e !== booker.email);
      expect(guestEmails).toEqual(["regular-guest@example.com"]);
      expect(guestEmails).not.toContain("secondary@example.com");
    });

    test("should match plus-addressed email to base email for verification check", async () => {
      const handleNewBooking = getNewBookingHandler();

      const booker = getBooker({
        email: "user+tag@example.com",
        name: "User",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
        emailVerified: new Date(),
      });

      const userWithVerificationRequired = getOrganizer({
        name: "User",
        email: "user@example.com",
        id: 201,
        schedules: [TestData.schedules.IstWorkHours],
        emailVerified: new Date(),
        requiresBookerEmailVerification: true,
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
          usersApartFromOrganizer: [userWithVerificationRequired],
          apps: [TestData.apps["google-calendar"]],
        })
      );

      await mockCalendarToHaveNoBusySlots("googlecalendar", {});

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
          },
        },
      });

      await expect(
        handleNewBooking({
          bookingData: mockBookingData,
        })
      ).rejects.toThrow("Attendee email has been blocked");
    });

    test("should filter only guests requiring verification from multiple guests", async () => {
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
        emailVerified: new Date(),
      });

      const guest1 = getOrganizer({
        name: "Guest1",
        email: "guest1-verify@example.com",
        id: 202,
        schedules: [TestData.schedules.IstWorkHours],
        emailVerified: new Date(),
        requiresBookerEmailVerification: true,
      });

      const guest3 = getOrganizer({
        name: "Guest3",
        email: "guest3-verify@example.com",
        id: 203,
        schedules: [TestData.schedules.IstWorkHours],
        emailVerified: new Date(),
        requiresBookerEmailVerification: true,
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
          usersApartFromOrganizer: [guest1, guest3],
          apps: [TestData.apps["google-calendar"]],
        })
      );

      await mockCalendarToHaveNoBusySlots("googlecalendar", {});

      mockFindManyByEmailsWithEmailVerificationSettings.mockResolvedValue([
        {
          email: "guest1-verify@example.com",
          matchedEmail: "guest1-verify@example.com",
          requiresBookerEmailVerification: true,
        },
        {
          email: "guest3-verify@example.com",
          matchedEmail: "guest3-verify@example.com",
          requiresBookerEmailVerification: true,
        },
      ]);

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
            guests: [
              "guest1-verify@example.com",
              "guest2-no-verify@example.com",
              "guest3-verify@example.com",
              "guest4-no-verify@example.com",
            ],
          },
        },
      });

      const createdBooking = await handleNewBooking({
        bookingData: mockBookingData,
      });

      expect(createdBooking).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          uid: expect.any(String),
          status: BookingStatus.ACCEPTED,
        })
      );

      const booking = await prismaMock.booking.findFirst({
        where: { id: createdBooking.id },
        include: { attendees: true },
      });

      const guestEmails = booking?.attendees.map((a) => a.email).filter((e) => e !== booker.email);
      expect(guestEmails).toEqual(
        expect.arrayContaining(["guest2-no-verify@example.com", "guest4-no-verify@example.com"])
      );
      expect(guestEmails).not.toContain("guest1-verify@example.com");
      expect(guestEmails).not.toContain("guest3-verify@example.com");
      expect(guestEmails?.length).toBe(2);
    });

    test("should throw error when invalid verification code is provided", async () => {
      const handleNewBooking = getNewBookingHandler();
      const { verifyCodeUnAuthenticated } = await import(
        "@calcom/features/auth/lib/verifyCodeUnAuthenticated"
      );

      vi.mocked(verifyCodeUnAuthenticated).mockResolvedValue(false);

      const booker = getBooker({
        email: "user@example.com",
        name: "User",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
        emailVerified: new Date(),
      });

      const userWithVerificationRequired = getOrganizer({
        name: "User",
        email: "user@example.com",
        id: 201,
        schedules: [TestData.schedules.IstWorkHours],
        emailVerified: new Date(),
        requiresBookerEmailVerification: true,
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
          usersApartFromOrganizer: [userWithVerificationRequired],
          apps: [TestData.apps["google-calendar"]],
        })
      );

      await mockCalendarToHaveNoBusySlots("googlecalendar", {});

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
          },
          verificationCode: "invalid-code",
        },
      });

      await expect(
        handleNewBooking({
          bookingData: mockBookingData,
        })
      ).rejects.toThrow("Invalid verification code");

      expect(verifyCodeUnAuthenticated).toHaveBeenCalledWith("user@example.com", "invalid-code");
    });
  });
});
