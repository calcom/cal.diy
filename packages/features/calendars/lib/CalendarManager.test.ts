import { prisma } from "@calcom/prisma/__mocks__/prisma";
import { getCalendar } from "@calcom/app-store/_utils/getCalendar";
import type { Calendar, CalendarEvent } from "@calcom/types/Calendar";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import {
  deduplicateCredentialsBasedOnSelectedCalendars,
  deleteEvent,
  getCalendarCredentials,
  getConnectedCalendars,
  processEvent,
} from "./CalendarManager";

vi.mock("@calcom/prisma", () => ({
  prisma,
}));

vi.mock("@calcom/app-store/_utils/getCalendar", () => ({
  getCalendar: vi.fn(),
}));

vi.mock("@calcom/lib/constants", () => ({
  ORGANIZER_EMAIL_EXEMPT_DOMAINS: "",
  IS_PRODUCTION: false,
}));

vi.mock("@calcom/app-store/locations", () => ({
  MeetLocationType: "integrations:google:meet",
}));

vi.mock("@calcom/lib/CalEventParser", () => ({
  getRichDescription: vi.fn(() => "Test description"),
}));

vi.mock("@calcom/app-store/delegationCredential", () => ({
  enrichHostsWithDelegationCredentials: vi.fn(),
  getUsersCredentialsIncludeServiceAccountKey: vi.fn(),
  getCredentialForSelectedCalendar: vi.fn(),
  findUniqueDelegationCalendarCredential: vi.fn(),
  getAllDelegationCredentialsForUserIncludeServiceAccountKey: vi.fn(),
  getDelegationCredentialOrFindRegularCredential: vi.fn(),
}));

function buildCredential(data: {
  type: string;
  appId: string;
  id: number;
  delegatedToId: string | null;
  user: { email: string } | null;
}) {
  return {
    ...data,
    teamId: null,
    invalid: false,
    key: { access_token: "DONT_MATTER" },
    userId: 10000,
    delegatedTo: {
      serviceAccountKey: {
        client_email: "DONT_MATTER",
        tenant_id: "DONT_MATTER",
        client_id: "DONT_MATTER",
        private_key: "DONT_MATTER",
      },
    },
  };
}

function buildCalendarEvent(overrides = {}) {
  return {
    type: "test-event",
    title: "Test Event",
    startTime: "2024-01-01T10:00:00Z",
    endTime: "2024-01-01T11:00:00Z",
    organizer: {
      name: "Organizer",
      email: "organizer@example.com",
      timeZone: "UTC",
      language: { translate: (x: string) => x, locale: "en" },
    },
    attendees: [
      {
        name: "Attendee 1",
        email: "attendee1@example.com",
        timeZone: "UTC",
        language: { translate: (x: string) => x, locale: "en" },
      },
      {
        name: "Attendee 2",
        email: "attendee2@example.com",
        timeZone: "UTC",
        language: { translate: (x: string) => x, locale: "en" },
      },
    ],
    destinationCalendar: null,
    hideOrganizerEmail: false,
    location: null,
    ...overrides,
  };
}

describe("CalendarManager tests", () => {
  it("uses the app name for the destination calendar when the deprecated title is absent", async () => {
    const calendar = mockDeep<Calendar>();
    calendar.listCalendars.mockResolvedValue([
      {
        externalId: "owner@example.com",
        integration: "google_calendar",
        name: "Personal",
        email: "owner@example.com",
        primary: true,
      },
    ]);
    vi.mocked(getCalendar).mockResolvedValue(calendar);
    const credentials = getCalendarCredentials([
      {
        ...buildCredential({
          type: "google_calendar",
          appId: "google-calendar",
          id: 1,
          delegatedToId: null,
          user: { email: "owner@example.com" },
        }),
        encryptedKey: null,
        delegationCredentialId: null,
      },
    ]).map((entry) => {
      const integration = { ...entry.integration, name: "Google Calendar" };
      delete integration.title;
      return { ...entry, integration };
    });

    expect(credentials).toHaveLength(1);
    const result = await getConnectedCalendars(credentials, [], "owner@example.com");

    expect(result.destinationCalendar).toMatchObject({
      integrationTitle: "Google Calendar",
      primaryEmail: "owner@example.com",
      externalId: "owner@example.com",
    });
  });

  describe("fn: processEvent", () => {
    it("should clear attendees when hideOrganizerEmail is true and no Zoho Calendar destination", () => {
      const calEvent = buildCalendarEvent({
        hideOrganizerEmail: true,
        destinationCalendar: [
          {
            integration: "google_calendar",
            externalId: "calendar-1",
          },
        ],
      });

      const result = processEvent(calEvent as any);

      expect(result.attendees).toEqual([]);
    });

    it("should NOT clear attendees when hideOrganizerEmail is true and destination is Zoho Calendar", () => {
      const calEvent = buildCalendarEvent({
        hideOrganizerEmail: true,
        destinationCalendar: [
          {
            integration: "zoho_calendar",
            externalId: "calendar-1",
          },
        ],
      });

      const result = processEvent(calEvent as any);

      // Zoho Calendar requires at least one attendee, so attendees should NOT be cleared
      expect(result.attendees).toHaveLength(2);
      expect(result.attendees[0].email).toBe("attendee1@example.com");
      expect(result.attendees[1].email).toBe("attendee2@example.com");
    });

    it("should NOT clear attendees when hideOrganizerEmail is true and one of multiple destinations is Zoho Calendar", () => {
      const calEvent = buildCalendarEvent({
        hideOrganizerEmail: true,
        destinationCalendar: [
          {
            integration: "google_calendar",
            externalId: "google-calendar-1",
          },
          {
            integration: "zoho_calendar",
            externalId: "zoho-calendar-1",
          },
        ],
      });

      const result = processEvent(calEvent as any);

      // Zoho Calendar is in the list, so attendees should NOT be cleared
      expect(result.attendees).toHaveLength(2);
    });

    it("should NOT clear attendees when hideOrganizerEmail is false", () => {
      const calEvent = buildCalendarEvent({
        hideOrganizerEmail: false,
        destinationCalendar: [
          {
            integration: "google_calendar",
            externalId: "calendar-1",
          },
        ],
      });

      const result = processEvent(calEvent as any);

      expect(result.attendees).toHaveLength(2);
    });

    it("should NOT clear attendees when location is MeetLocationType even with hideOrganizerEmail true", () => {
      const calEvent = buildCalendarEvent({
        hideOrganizerEmail: true,
        location: "integrations:google:meet",
        destinationCalendar: [
          {
            integration: "google_calendar",
            externalId: "calendar-1",
          },
        ],
      });

      const result = processEvent(calEvent as any);

      expect(result.attendees).toHaveLength(2);
    });

    it("should handle null destinationCalendar with hideOrganizerEmail true", () => {
      const calEvent = buildCalendarEvent({
        hideOrganizerEmail: true,
        destinationCalendar: null,
      });

      const result = processEvent(calEvent as any);

      expect(result.attendees).toEqual([]);
    });

    it("should handle empty destinationCalendar array with hideOrganizerEmail true", () => {
      const calEvent = buildCalendarEvent({
        hideOrganizerEmail: true,
        destinationCalendar: [],
      });

      const result = processEvent(calEvent as any);

      expect(result.attendees).toEqual([]);
    });

    it("should include calendarDescription from getRichDescription", () => {
      const calEvent = buildCalendarEvent();

      const result = processEvent(calEvent as any);

      expect(result.calendarDescription).toBe("Test description");
    });

    it("should clear responses for seatsPerTimeSlot events", () => {
      const calEvent = buildCalendarEvent({
        seatsPerTimeSlot: 5,
        responses: { field1: { label: "Field 1", value: "test" } },
        userFieldsResponses: { field1: { label: "Field 1", value: "test" } },
        additionalNotes: "Test notes",
        customInputs: { input1: "value1" },
      });

      const result = processEvent(calEvent as any);

      expect(result.responses).toBeNull();
      expect(result.userFieldsResponses).toBeNull();
      expect(result.additionalNotes).toBeNull();
      expect(result.customInputs).toBeNull();
    });
  });

  describe("fn: getCalendarCredentials", () => {
    it("should only return credentials for calendar apps", async () => {
      const googleCalendarCredentials = {
        id: "1",
        appId: "google-calendar",
        type: "google_calendar",
        userId: "3",
        key: {
          access_token: "google_calendar_key",
        },
        invalid: false,
        delegatedTo: null,
      };

      const credentials = [
        googleCalendarCredentials,
        {
          id: "2",
          appId: "office365-video",
          type: "office365_video",
          userId: "4",
          key: {
            access_token: "office365_video_key",
          },
          invalid: false,
        },
      ];

      const calendarCredentials = getCalendarCredentials(credentials);
      expect(calendarCredentials).toHaveLength(1);
      expect(calendarCredentials[0].credential).toEqual(googleCalendarCredentials);
    });
  });

  describe("fn: deduplicateCredentialsBasedOnSelectedCalendars", () => {
    it("should remove a regular credential for which a delegation credential exists i.e. both are fetching events for same externalId", () => {
      const calcomUser = {
        email: "owner@hariombalhara.net",
      };

      const externalIdSameAsCalcomUserEmail = calcomUser.email;
      const externalIdDifferentFromCalcomUserEmail = "hariombalhara@gmail.com";

      // Delegation Credential(Calendar)
      const delegationCredentialCalendarForCalcomEmail = buildCredential({
        type: "google_calendar",
        appId: "google-calendar",
        id: -1,
        delegatedToId: "45fa8f04-e891-417b-98e1-abf48e8ae18a",
        user: calcomUser,
      });

      // Delegation Credential(Conferencing)
      const delegationCredentialConferencingForCalcomEmail = buildCredential({
        type: "google_video",
        appId: "google-meet",
        id: -1,
        delegatedToId: "45fa8f04-e891-417b-98e1-abf48e8ae18a",
        user: calcomUser,
      });

      // Regular Credential for owner@hariombalhara.net
      const regularCredentialForCalcomEmail = buildCredential({
        id: 2,
        appId: "google-calendar",
        type: "google_calendar",
        delegatedToId: null,
        user: calcomUser,
      });

      // Regular Credential for hariombalhara@gmail.com
      const regularCredentialForSomeOtherEmail = buildCredential({
        id: 3,
        appId: "google-calendar",
        type: "google_calendar",
        delegatedToId: null,
        user: calcomUser,
      });

      const credentials = [
        delegationCredentialCalendarForCalcomEmail,
        delegationCredentialConferencingForCalcomEmail,
        // This one is duplicate
        regularCredentialForCalcomEmail,
        // Regular Credential for hariombalhara@gmail.com
        regularCredentialForSomeOtherEmail,
      ];

      const selectedCalendars = [
        {
          id: "62f4f3b7-c65b-4199-8052-25b91ee25ff2",
          userId: 23,
          integration: "google_calendar",
          externalId: externalIdDifferentFromCalcomUserEmail,
          credentialId: regularCredentialForSomeOtherEmail.id,
          delegationCredentialId: null,
          eventTypeId: null,
        },
        {
          id: "418e1bd0-7bde-4ea6-b03a-b2b6de6af497",
          userId: 23,
          integration: "google_calendar",
          externalId: externalIdSameAsCalcomUserEmail,
          credentialId: regularCredentialForCalcomEmail.id,
          delegationCredentialId: null,
          eventTypeId: null,
        },
      ];

      const uniqueCredentials = deduplicateCredentialsBasedOnSelectedCalendars({
        credentials,
        selectedCalendars,
      });
      expect(uniqueCredentials).toHaveLength(3);
      expect(uniqueCredentials).toEqual([
        delegationCredentialCalendarForCalcomEmail,
        delegationCredentialConferencingForCalcomEmail,
        regularCredentialForSomeOtherEmail,
      ]);
    });

    it("should not remove a regular credential for which a delegation credential exists i.e. both are fetching events for same externalId if integration is different", () => {
      const calcomUser = {
        email: "owner@hariombalhara.net",
      };

      const externalIdSameAsCalcomUserEmail = calcomUser.email;
      const externalIdDifferentFromCalcomUserEmail = "hariombalhara@gmail.com";

      // Delegation Credential(Calendar) - wrong integration type
      const delegationCredentialCalendarForCalcomEmail = buildCredential({
        type: "google_calendar_wrong_type",
        appId: "google-calendar",
        id: -1,
        delegatedToId: "45fa8f04-e891-417b-98e1-abf48e8ae18a",
        user: calcomUser,
      });

      // Delegation Credential(Conferencing)
      const delegationCredentialConferencingForCalcomEmail = buildCredential({
        type: "google_video",
        appId: "google-meet",
        id: -1,
        delegatedToId: "45fa8f04-e891-417b-98e1-abf48e8ae18a",
        user: calcomUser,
      });

      // Regular Credential for owner@hariombalhara.net
      const regularCredentialForCalcomEmail = buildCredential({
        id: 2,
        appId: "google-calendar",
        type: "google_calendar",
        delegatedToId: null,
        user: calcomUser,
      });

      // Regular Credential for hariombalhara@gmail.com
      const regularCredentialForSomeOtherEmail = buildCredential({
        id: 3,
        appId: "google-calendar",
        type: "google_calendar",
        delegatedToId: null,
        user: calcomUser,
      });

      const credentials = [
        delegationCredentialCalendarForCalcomEmail,
        delegationCredentialConferencingForCalcomEmail,
        // This one won't be removed as integration is different
        regularCredentialForCalcomEmail,
        // Regular Credential for hariombalhara@gmail.com
        regularCredentialForSomeOtherEmail,
      ];

      const selectedCalendars = [
        {
          id: "62f4f3b7-c65b-4199-8052-25b91ee25ff2",
          userId: 23,
          integration: "google_calendar",
          externalId: externalIdDifferentFromCalcomUserEmail,
          credentialId: regularCredentialForSomeOtherEmail.id,
          delegationCredentialId: null,
          eventTypeId: null,
        },
        {
          id: "418e1bd0-7bde-4ea6-b03a-b2b6de6af497",
          userId: 23,
          integration: "google_calendar",
          externalId: externalIdSameAsCalcomUserEmail,
          credentialId: regularCredentialForCalcomEmail.id,
          delegationCredentialId: null,
          eventTypeId: null,
        },
      ];

      const uniqueCredentials = deduplicateCredentialsBasedOnSelectedCalendars({
        credentials,
        selectedCalendars,
      });
      expect(uniqueCredentials).toHaveLength(4);
      expect(uniqueCredentials).toEqual([
        delegationCredentialCalendarForCalcomEmail,
        delegationCredentialConferencingForCalcomEmail,
        regularCredentialForCalcomEmail,
        regularCredentialForSomeOtherEmail,
      ]);
    });

    it("should return empty array when credentials array is empty", () => {
      const selectedCalendars = [
        {
          id: "calendar-1",
          userId: 23,
          integration: "google_calendar",
          externalId: "test@example.com",
          credentialId: 1,
          delegationCredentialId: null,
          eventTypeId: null,
        },
      ];

      const uniqueCredentials = deduplicateCredentialsBasedOnSelectedCalendars({
        credentials: [],
        selectedCalendars,
      });
      expect(uniqueCredentials).toHaveLength(0);
    });

    it("should return original credentials when user email is not present", () => {
      const credentialsWithoutUserEmail = [
        buildCredential({
          type: "google_calendar",
          appId: "google-calendar",
          id: 1,
          delegatedToId: null,
          user: null,
        }),
        buildCredential({
          type: "google_calendar",
          appId: "google-calendar",
          id: -1,
          delegatedToId: "delegation-1",
          user: null,
        }),
      ];

      const selectedCalendars = [
        {
          id: "calendar-1",
          userId: 23,
          integration: "google_calendar",
          externalId: "test@example.com",
          credentialId: 1,
          delegationCredentialId: null,
          eventTypeId: null,
        },
      ];

      const uniqueCredentials = deduplicateCredentialsBasedOnSelectedCalendars({
        credentials: credentialsWithoutUserEmail,
        selectedCalendars,
      });
      expect(uniqueCredentials).toEqual(credentialsWithoutUserEmail);
    });

    it("should return original credentials when no delegation credentials exist", () => {
      const regularCredentials = [
        buildCredential({
          type: "google_calendar",
          appId: "google-calendar",
          id: 1,
          delegatedToId: null,
          user: { email: "test@example.com" },
        }),
        buildCredential({
          type: "google_calendar",
          appId: "google-calendar",
          id: 2,
          delegatedToId: null,
          user: { email: "test@example.com" },
        }),
      ];

      const selectedCalendars = [
        {
          id: "calendar-1",
          userId: 23,
          integration: "google_calendar",
          externalId: "test@example.com",
          credentialId: 1,
          delegationCredentialId: null,
          eventTypeId: null,
        },
      ];

      const uniqueCredentials = deduplicateCredentialsBasedOnSelectedCalendars({
        credentials: regularCredentials,
        selectedCalendars,
      });
      expect(uniqueCredentials).toEqual(regularCredentials);
    });

    it("should return original credentials when no matching selected calendars exist", () => {
      const credentials = [
        buildCredential({
          type: "google_calendar",
          appId: "google-calendar",
          id: 1,
          delegatedToId: "delegation-1",
          user: { email: "test@example.com" },
        }),
        buildCredential({
          type: "google_calendar",
          appId: "google-calendar",
          id: 2,
          delegatedToId: null,
          user: { email: "test@example.com" },
        }),
      ];

      const selectedCalendars = [
        {
          id: "calendar-1",
          userId: 23,
          integration: "google_calendar",
          externalId: "different@example.com", // Different email than the credentials
          credentialId: 1,
          delegationCredentialId: null,
          eventTypeId: null,
        },
      ];

      const uniqueCredentials = deduplicateCredentialsBasedOnSelectedCalendars({
        credentials,
        selectedCalendars,
      });
      expect(uniqueCredentials).toEqual(credentials);
    });
  });

  describe("fn: deleteEvent", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should return early when bookingRefUid is empty string", async () => {
      vi.mocked(getCalendar).mockResolvedValue({ deleteEvent: vi.fn() } as any);

      const credential = {
        id: 1,
        type: "google_calendar",
        key: { access_token: "test_token" },
        encryptedKey: null,
        userId: 1,
        user: { email: "test@example.com" },
        teamId: null,
        appId: "google-calendar",
        invalid: false,
        delegationCredentialId: null,
        delegatedTo: null,
      };

      const result = await deleteEvent({
        credential,
        bookingRefUid: "",
        event: buildCalendarEvent(),
        externalCalendarId: "calendar-id",
      });

      expect(result).toEqual({});
    });
  });
});
