import process from "node:process";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Booking, sanitizeAndFilterGuests } from "./addGuests.handler";

const mockFindManyByEmailsWithEmailVerificationSettings = vi.fn();

vi.mock("@calcom/features/users/repositories/UserRepository", () => {
  return {
    UserRepository: class MockUserRepository {
      findManyByEmailsWithEmailVerificationSettings = mockFindManyByEmailsWithEmailVerificationSettings;
    },
  };
});
vi.mock("@calcom/features/bookings/repositories/BookingRepository", () => {
  return {
    BookingRepository: class MockBookingRepository {},
  };
});
vi.mock("@calcom/app-store/delegationCredential", () => ({
  getUsersCredentialsIncludeServiceAccountKey: vi.fn(),
}));
vi.mock("@calcom/app-store/zod-utils", () => ({
  eventTypeMetaDataSchemaWithTypedApps: { parse: vi.fn() },
}));
vi.mock("@calcom/features/bookings/lib/BookingEmailSmsHandler", () => ({
  BookingEmailSmsHandler: class MockBookingEmailSmsHandler {
    handleAddGuests = vi.fn();
    handleAddAttendee = vi.fn();
  },
}));
vi.mock("@calcom/features/bookings/lib/EventManager", () => ({
  default: class MockEventManager {
    updateCalendarAttendees = vi.fn();
  },
}));
vi.mock("@calcom/features/eventtypes/di/EventTypeService.container", () => ({
  getEventTypeService: () => ({
    shouldHideBrandingForEventType: vi.fn(),
  }),
}));
vi.mock("@calcom/i18n/server", () => ({
  getTranslation: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@calcom/lib/isRecurringEvent", () => ({
  parseRecurringEvent: vi.fn(),
}));
vi.mock("@calcom/lib/logger", () => ({
  default: {
    getSubLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));
vi.mock("@calcom/prisma", () => ({
  default: {},
  prisma: {},
}));
vi.mock("@calcom/prisma/zod-utils", () => ({
  eventTypeBookingFields: { parse: vi.fn() },
}));

function buildBooking(attendeeEmails: string[]): Booking {
  return { attendees: attendeeEmails.map((email) => ({ email })) } as unknown as Booking;
}

describe("sanitizeAndFilterGuests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BLACKLISTED_GUEST_EMAILS;
    mockFindManyByEmailsWithEmailVerificationSettings.mockResolvedValue([]);
  });

  describe("deduplication", () => {
    it("keeps the first guest's email together with its own guest object when plus-addressed emails collide", async () => {
      const guests = [
        {
          email: "alice+work@example.com",
          name: "Alice Work",
          timeZone: "Asia/Kolkata",
          language: "en",
        },
        {
          email: "alice+home@example.com",
          name: "Alice Home",
          timeZone: "America/New_York",
          language: "fr",
        },
      ];

      const result = await sanitizeAndFilterGuests(guests, buildBooking([]));

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        email: "alice+work@example.com",
        name: "Alice Work",
        timeZone: "Asia/Kolkata",
        language: "en",
      });
    });

    it("keeps the first guest object for exact duplicate emails", async () => {
      const guests = [
        { email: "bob@example.com", name: "Bob One", timeZone: "Europe/Berlin" },
        { email: "bob@example.com", name: "Bob Two", timeZone: "Asia/Tokyo" },
      ];

      const result = await sanitizeAndFilterGuests(guests, buildBooking([]));

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        email: "bob@example.com",
        name: "Bob One",
        timeZone: "Europe/Berlin",
      });
    });

    it("treats differently-cased emails as duplicates, keeping the first occurrence as written", async () => {
      const guests = [
        { email: "Carol@example.com", name: "Carol First" },
        { email: "carol@example.com", name: "Carol Second" },
      ];

      const result = await sanitizeAndFilterGuests(guests, buildBooking([]));

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ email: "Carol@example.com", name: "Carol First" });
    });

    it("keeps guests whose base emails differ", async () => {
      const guests = [
        { email: "dave@example.com", name: "Dave" },
        { email: "erin+team@example.com", name: "Erin" },
        { email: "frank@example.com", name: "Frank" },
      ];

      const result = await sanitizeAndFilterGuests(guests, buildBooking([]));

      expect(result).toEqual(guests);
    });
  });

  describe("attendee filtering", () => {
    it("drops guests whose base email already attends the booking", async () => {
      const guests = [
        { email: "existing@example.com", name: "Existing" },
        { email: "new@example.com", name: "New" },
      ];

      const result = await sanitizeAndFilterGuests(guests, buildBooking(["existing@example.com"]));

      expect(result).toEqual([{ email: "new@example.com", name: "New" }]);
    });

    it("throws when deduplication leaves only a guest that already attends the booking", async () => {
      const guests = [
        { email: "existing@example.com", name: "Existing" },
        { email: "existing+other@example.com", name: "Other" },
      ];

      await expect(sanitizeAndFilterGuests(guests, buildBooking(["existing@example.com"]))).rejects.toThrow(
        TRPCError
      );

      await expect(
        sanitizeAndFilterGuests(guests, buildBooking(["existing@example.com"]))
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "emails_must_be_unique_valid",
      });
    });
  });
});
