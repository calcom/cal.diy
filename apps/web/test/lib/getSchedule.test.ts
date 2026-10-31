import CalendarManagerMock from "@calcom/features/calendars/lib/__mocks__/CalendarManager";
import { constantsScenarios } from "@calcom/lib/__mocks__/constants";
import {
  createBookingScenario,
  createCredentials,
  createOrganization,
  getDate,
  getGoogleCalendarCredential,
  getOrganizer,
  getScenarioData,
  mockCrmApp,
  TestData,
  Timezones,
} from "@calcom/testing/lib/bookingScenario/bookingScenario";
import dayjs from "@calcom/dayjs";
import { getAvailableSlotsService } from "@calcom/features/di/containers/AvailableSlots";
import { type BookingStatus, SchedulingType } from "@calcom/prisma/enums";
import { describe, test, vi } from "vitest";
import { expect, expectedSlotsForSchedule } from "./getSchedule/expects";
import { setupAndTeardown } from "./getSchedule/setupAndTeardown";
import { timeTravelToTheBeginningOfToday } from "./getSchedule/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
constantsScenarios.set({
  IS_PRODUCTION: true,
  WEBAPP_URL: "http://localhost:3000",
  RESERVED_SUBDOMAINS: ["auth", "docs"],
  SINGLE_ORG_SLUG: "",
} as any);
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("getSchedule", () => {
  const availableSlotsService = getAvailableSlotsService();
  setupAndTeardown();

  // TODO: Move these inside describe('Team Event')
  describe("Round robin lead skip(i.e. use contact owner specified by teamMemberEmail) - CRM", async () => {
    test("correctly get slots for event with only round robin hosts", async () => {
      vi.setSystemTime("2024-05-21T00:00:13Z");

      const plus1DateString = "2024-05-22";
      const plus2DateString = "2024-05-23";

      const crmCredential = {
        id: 1,
        type: "salesforce_crm",
        key: {
          clientId: "test-client-id",
        },
        userId: 1,
        teamId: null,
        appId: "salesforce",
        invalid: false,
        user: { email: "test@test.com" },
      };

      await createCredentials([crmCredential]);

      mockCrmApp("salesforce", {
        getContacts: [
          {
            id: "contact-id",
            email: "test@test.com",
            ownerEmail: "example@example.com",
          },
        ],
        createContacts: [{ id: "contact-id", email: "test@test.com" }],
      });

      await createBookingScenario({
        eventTypes: [
          {
            id: 1,
            slotInterval: 60,
            length: 60,
            hosts: [
              {
                userId: 101,
                isFixed: false,
              },
              {
                userId: 102,
                isFixed: false,
              },
            ],
            schedulingType: "ROUND_ROBIN",
            metadata: {
              apps: {
                salesforce: {
                  enabled: true,
                  appCategories: ["crm"],
                  roundRobinLeadSkip: true,
                },
              },
            },
          },
        ],
        users: [
          {
            ...TestData.users.example,
            email: "example@example.com",
            id: 101,
            schedules: [TestData.schedules.IstEveningShift],
          },
          {
            ...TestData.users.example,
            email: "example1@example.com",
            id: 102,
            schedules: [TestData.schedules.IstMorningShift],
            defaultScheduleId: 2,
          },
        ],
        bookings: [],
      });

      const scheduleWithLeadSkip = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: true,
          teamMemberEmail: "example@example.com",
          orgSlug: null,
        },
      });

      // only slots where example@example.com is available
      expect(scheduleWithLeadSkip).toHaveTimeSlots(
        [`11:30:00.000Z`, `12:30:00.000Z`, `13:30:00.000Z`, `14:30:00.000Z`, `15:30:00.000Z`],
        {
          dateString: plus2DateString,
        }
      );

      const scheduleWithoutLeadSkip = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: true,
          orgSlug: null,
        },
      });

      // slots where either one of the rr hosts is available
      expect(scheduleWithoutLeadSkip).toHaveTimeSlots(
        [
          `04:30:00.000Z`,
          `05:30:00.000Z`,
          `06:30:00.000Z`,
          `07:30:00.000Z`,
          `08:30:00.000Z`,
          `09:30:00.000Z`,
          `10:30:00.000Z`,
          `11:30:00.000Z`,
          `12:30:00.000Z`,
          `13:30:00.000Z`,
          `14:30:00.000Z`,
          `15:30:00.000Z`,
        ],
        {
          dateString: plus2DateString,
        }
      );
    });
    test("correctly get slots for event with round robin and fixed hosts", async () => {
      vi.setSystemTime("2024-05-21T00:00:13Z");

      const plus1DateString = "2024-05-22";
      const plus2DateString = "2024-05-23";

      const crmCredential = {
        id: 1,
        type: "salesforce_crm",
        key: {
          clientId: "test-client-id",
        },
        userId: 1,
        teamId: null,
        appId: "salesforce",
        invalid: false,
        user: { email: "test@test.com" },
      };

      await createCredentials([crmCredential]);

      mockCrmApp("salesforce", {
        getContacts: [
          {
            id: "contact-id",
            email: "test@test.com",
            ownerEmail: "example@example.com",
          },
          {
            id: "contact-id-1",
            email: "test1@test.com",
            ownerEmail: "example1@example.com",
          },
        ],
        createContacts: [{ id: "contact-id", email: "test@test.com" }],
      });

      await createBookingScenario({
        eventTypes: [
          {
            id: 1,
            slotInterval: 60,
            length: 60,
            hosts: [
              {
                userId: 101,
                isFixed: true,
              },
              {
                userId: 102,
                isFixed: false,
              },
              {
                userId: 103,
                isFixed: false,
              },
            ],
            schedulingType: "ROUND_ROBIN",
            metadata: {
              apps: {
                salesforce: {
                  enabled: true,
                  appCategories: ["crm"],
                  roundRobinLeadSkip: true,
                },
              },
            },
          },
        ],
        users: [
          {
            ...TestData.users.example,
            email: "example@example.com",
            id: 101,
            schedules: [TestData.schedules.IstMidShift],
          },
          {
            ...TestData.users.example,
            email: "example1@example.com",
            id: 102,
            schedules: [TestData.schedules.IstMorningShift],
            defaultScheduleId: 2,
          },
          {
            ...TestData.users.example,
            email: "example2@example.com",
            id: 103,
            schedules: [TestData.schedules.IstEveningShift],

            defaultScheduleId: 3,
          },
        ],
        bookings: [],
      });

      const scheduleFixedHostLead = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: true,
          teamMemberEmail: "example@example.com",
          orgSlug: null,
        },
      });

      // show normal slots, example@example + one RR host needs to be available
      expect(scheduleFixedHostLead).toHaveTimeSlots(
        [
          `07:30:00.000Z`,
          `08:30:00.000Z`,
          `09:30:00.000Z`,
          `10:30:00.000Z`,
          `11:30:00.000Z`,
          `12:30:00.000Z`,
          `13:30:00.000Z`,
        ],
        {
          dateString: plus2DateString,
        }
      );

      const scheduleRRHostLead = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: true,
          teamMemberEmail: "example1@example.com",
          orgSlug: null,
        },
      });

      // slots where example@example (fixed host) + example1@example.com are available together
      expect(scheduleRRHostLead).toHaveTimeSlots(
        [`07:30:00.000Z`, `08:30:00.000Z`, `09:30:00.000Z`, `10:30:00.000Z`, `11:30:00.000Z`],
        {
          dateString: plus2DateString,
        }
      );
    });
    test("correctly get slots when contact owner has no availability in first two weeks", async () => {
      vi.setSystemTime("2024-05-01T00:00:13Z");

      const startTime = "2024-05-01";
      const endTime = "2024-06-01";
      const dateWithinTwoWeeks = "2024-05-10";
      const dateAfterTwoWeeks = "2024-05-22";

      const crmCredential = {
        id: 1,
        type: "salesforce_crm",
        key: {
          clientId: "test-client-id",
        },
        userId: 1,
        teamId: null,
        appId: "salesforce",
        invalid: false,
        user: { email: "test@test.com" },
      };

      await createCredentials([crmCredential]);

      mockCrmApp("salesforce", {
        getContacts: [
          {
            id: "contact-id",
            email: "test@test.com",
            ownerEmail: "example@example.com",
          },
        ],
        createContacts: [{ id: "contact-id", email: "test@test.com" }],
      });

      await createBookingScenario({
        eventTypes: [
          {
            id: 1,
            slotInterval: 60,
            length: 60,
            hosts: [
              {
                userId: 101,
                isFixed: false,
              },
              {
                userId: 102,
                isFixed: false,
              },
            ],
            schedulingType: "ROUND_ROBIN",
            metadata: {
              apps: {
                salesforce: {
                  enabled: true,
                  appCategories: ["crm"],
                  roundRobinLeadSkip: true,
                },
              },
            },
          },
        ],
        users: [
          {
            ...TestData.users.example,
            email: "example@example.com",
            id: 101,
            schedules: [TestData.schedules.IstWorkHoursWithFirstTwoWeeksUnavailable(startTime)],
          },
          {
            ...TestData.users.example,
            email: "example1@example.com",
            id: 102,
            schedules: [TestData.schedules.IstMorningShift],
            defaultScheduleId: 2,
          },
        ],
        bookings: [],
      });

      const scheduleWithLeadSkip = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${startTime}T18:30:00.000Z`,
          endTime: `${endTime}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: true,
          teamMemberEmail: "example@example.com",
          orgSlug: null,
        },
      });

      // example@example.com isn't available in the first two weeks, so we fallback to all hosts
      expect(scheduleWithLeadSkip).toHaveTimeSlots(
        [
          `04:30:00.000Z`,
          `05:30:00.000Z`,
          `06:30:00.000Z`,
          `07:30:00.000Z`,
          `08:30:00.000Z`,
          `09:30:00.000Z`,
          `10:30:00.000Z`,
          `11:30:00.000Z`,
          // `12:30:00.000Z`,
          // `13:30:00.000Z`,
          // `14:30:00.000Z`,
          // `15:30:00.000Z`,
        ],
        {
          dateString: dateWithinTwoWeeks,
        }
      );

      // slots from from both hosts because example@example.com isn't available in the first two weeks, so we fallback to all hosts
      expect(scheduleWithLeadSkip).toHaveTimeSlots(
        [
          `04:30:00.000Z`,
          `05:30:00.000Z`,
          `06:30:00.000Z`,
          `07:30:00.000Z`,
          `08:30:00.000Z`,
          `09:30:00.000Z`,
          `10:30:00.000Z`,
          `11:30:00.000Z`,
          `12:30:00.000Z`,
          `13:30:00.000Z`,
          `14:30:00.000Z`,
          `15:30:00.000Z`,
        ],
        {
          dateString: dateAfterTwoWeeks,
        }
      );
    });

    test("correctly get slots for event when contact owner has no availability for the whole month but is available the first two weeks", async () => {
      vi.setSystemTime("2024-05-01T00:00:13Z");

      const startTime = "2024-07-01";
      const endTime = "2024-07-31";

      const crmCredential = {
        id: 1,
        type: "salesforce_crm",
        key: {
          clientId: "test-client-id",
        },
        userId: 1,
        teamId: null,
        appId: "salesforce",
        invalid: false,
        user: { email: "test@test.com" },
      };

      await createCredentials([crmCredential]);

      mockCrmApp("salesforce", {
        getContacts: [
          {
            id: "contact-id",
            email: "test@test.com",
            ownerEmail: "example@example.com",
          },
        ],
        createContacts: [{ id: "contact-id", email: "test@test.com" }],
      });

      await createBookingScenario({
        eventTypes: [
          {
            id: 1,
            slotInterval: 60,
            length: 60,
            hosts: [
              {
                userId: 101,
                isFixed: false,
              },
              {
                userId: 102,
                isFixed: false,
              },
            ],
            schedulingType: "ROUND_ROBIN",
            metadata: {
              apps: {
                salesforce: {
                  enabled: true,
                  appCategories: ["crm"],
                  roundRobinLeadSkip: true,
                },
              },
            },
          },
        ],
        users: [
          {
            ...TestData.users.example,
            email: "example@example.com",
            id: 101,
            schedules: [TestData.schedules.IstNotAvailableForFullMonth("2024-07")], // not available full July
          },
          {
            ...TestData.users.example,
            email: "example1@example.com",
            id: 102,
            schedules: [TestData.schedules.IstMorningShift],
            defaultScheduleId: 2,
          },
        ],
        bookings: [],
      });

      const scheduleWithLeadSkip = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${startTime}T18:30:00.000Z`,
          endTime: `${endTime}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: true,
          teamMemberEmail: "example@example.com",
          orgSlug: null,
        },
      });

      // slots from example@example.com because even though user isn't available in July, user is available in the first two weeks
      expect(scheduleWithLeadSkip).toHaveDateDisabled({
        dateString: "2024-07-05",
      });
    });

    test("correctly get slots for event when contact owner has no availability at all", async () => {
      vi.setSystemTime("2024-05-01T00:00:13Z");

      const startTime = "2024-07-01";
      const endTime = "2024-07-31";

      const crmCredential = {
        id: 1,
        type: "salesforce_crm",
        key: {
          clientId: "test-client-id",
        },
        userId: 1,
        teamId: null,
        appId: "salesforce",
        invalid: false,
        user: { email: "test@test.com" },
      };

      await createCredentials([crmCredential]);

      mockCrmApp("salesforce", {
        getContacts: [
          {
            id: "contact-id",
            email: "test@test.com",
            ownerEmail: "example@example.com",
          },
        ],
        createContacts: [{ id: "contact-id", email: "test@test.com" }],
      });

      await createBookingScenario({
        eventTypes: [
          {
            id: 1,
            slotInterval: 60,
            length: 60,
            hosts: [
              {
                userId: 101,
                isFixed: false,
              },
              {
                userId: 102,
                isFixed: false,
              },
            ],
            schedulingType: "ROUND_ROBIN",
            metadata: {
              apps: {
                salesforce: {
                  enabled: true,
                  appCategories: ["crm"],
                  roundRobinLeadSkip: true,
                },
              },
            },
          },
        ],
        users: [
          {
            ...TestData.users.example,
            email: "example@example.com",
            id: 101,
            schedules: [TestData.schedules.EmptyAvailability],
          },
          {
            ...TestData.users.example,
            email: "example1@example.com",
            id: 102,
            schedules: [TestData.schedules.IstMorningShift],
            defaultScheduleId: 2,
          },
        ],
        bookings: [],
      });

      const scheduleWithLeadSkip = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${startTime}T18:30:00.000Z`,
          endTime: `${endTime}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: true,
          teamMemberEmail: "example@example.com",
          orgSlug: null,
        },
      });

      // slots from example1@example.com because example@example.com isn't available also not the first two weeks
      expect(scheduleWithLeadSkip).toHaveTimeSlots(
        [
          `04:30:00.000Z`,
          `05:30:00.000Z`,
          `06:30:00.000Z`,
          `07:30:00.000Z`,
          `08:30:00.000Z`,
          `09:30:00.000Z`,
          `10:30:00.000Z`,
          `11:30:00.000Z`,
        ],
        {
          dateString: "2024-07-05",
        }
      );
    });

    test("correctly gets slot for event when contact owner is available in the first two weeks and the next month is loaded (within the two weeks)", async () => {
      vi.setSystemTime("2024-05-23T00:00:13Z");

      const startTime = "2024-06-01";
      const endTime = "2024-06-31";

      const crmCredential = {
        id: 1,
        type: "salesforce_crm",
        key: {
          clientId: "test-client-id",
        },
        userId: 1,
        teamId: null,
        appId: "salesforce",
        invalid: false,
        user: { email: "test@test.com" },
      };

      await createCredentials([crmCredential]);

      mockCrmApp("salesforce", {
        getContacts: [
          {
            id: "contact-id",
            email: "test@test.com",
            ownerEmail: "example@example.com",
          },
        ],
        createContacts: [{ id: "contact-id", email: "test@test.com" }],
      });

      await createBookingScenario({
        eventTypes: [
          {
            id: 1,
            slotInterval: 60,
            length: 60,
            hosts: [
              {
                userId: 101,
                isFixed: false,
              },
              {
                userId: 102,
                isFixed: false,
              },
            ],
            schedulingType: "ROUND_ROBIN",
            metadata: {
              apps: {
                salesforce: {
                  enabled: true,
                  appCategories: ["crm"],
                  roundRobinLeadSkip: true,
                },
              },
            },
          },
        ],
        users: [
          {
            ...TestData.users.example,
            email: "example@example.com",
            id: 101,
            schedules: [TestData.schedules.IstNotAvailableForFullMonth("2024-06")],
          },
          {
            ...TestData.users.example,
            email: "example1@example.com",
            id: 102,
            schedules: [TestData.schedules.IstMorningShift],
            defaultScheduleId: 2,
          },
        ],
        bookings: [],
      });

      const scheduleWithLeadSkip = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${startTime}T18:30:00.000Z`,
          endTime: `${endTime}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: true,
          teamMemberEmail: "example@example.com",
          orgSlug: null,
        },
      });

      // slots for example@example.com, because user is available in the first two weeks (prev month)
      expect(scheduleWithLeadSkip).toHaveDateDisabled({
        dateString: "2024-06-03",
      });
    });

    test("correctly gets slot for event when contact owner is available in the first two weeks and it's end of the month", async () => {
      vi.setSystemTime("2024-05-23T00:00:13Z");

      const startTime = "2024-05-23";
      const endTime = "2024-05-31";

      const crmCredential = {
        id: 1,
        type: "salesforce_crm",
        key: {
          clientId: "test-client-id",
        },
        userId: 1,
        teamId: null,
        appId: "salesforce",
        invalid: false,
        user: { email: "test@test.com" },
      };

      await createCredentials([crmCredential]);

      mockCrmApp("salesforce", {
        getContacts: [
          {
            id: "contact-id",
            email: "test@test.com",
            ownerEmail: "example@example.com",
          },
        ],
        createContacts: [{ id: "contact-id", email: "test@test.com" }],
      });

      await createBookingScenario({
        eventTypes: [
          {
            id: 1,
            slotInterval: 60,
            length: 60,
            hosts: [
              {
                userId: 101,
                isFixed: false,
              },
              {
                userId: 102,
                isFixed: false,
              },
            ],
            schedulingType: "ROUND_ROBIN",
            metadata: {
              apps: {
                salesforce: {
                  enabled: true,
                  appCategories: ["crm"],
                  roundRobinLeadSkip: true,
                },
              },
            },
          },
        ],
        users: [
          {
            ...TestData.users.example,
            email: "example@example.com",
            id: 101,
            schedules: [TestData.schedules.IstNotAvailableForFullMonth("2024-05")],
          },
          {
            ...TestData.users.example,
            email: "example1@example.com",
            id: 102,
            schedules: [TestData.schedules.IstMorningShift],
            defaultScheduleId: 2,
          },
        ],
        bookings: [],
      });

      const scheduleWithLeadSkip = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${startTime}T18:30:00.000Z`,
          endTime: `${endTime}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: true,
          teamMemberEmail: "example@example.com",
          orgSlug: null,
        },
      });

      // slots for example@example.com, because user is available in the first two weeks (next month)
      expect(scheduleWithLeadSkip).toHaveDateDisabled({
        dateString: "2024-05-29",
      });
    });

    test("Negative case(i.e. skipContactOwner is true) - when teamMemberEmail is provided but not used", async () => {
      vi.setSystemTime("2024-05-21T00:00:13Z");

      const plus1DateString = "2024-05-22";
      const plus2DateString = "2024-05-23";

      const crmCredential = {
        id: 1,
        type: "salesforce_crm",
        key: {
          clientId: "test-client-id",
        },
        userId: 1,
        teamId: null,
        appId: "salesforce",
        invalid: false,
        user: { email: "test@test.com" },
      };

      await createCredentials([crmCredential]);

      mockCrmApp("salesforce", {
        getContacts: [
          {
            id: "contact-id",
            email: "test@test.com",
            ownerEmail: "example@example.com",
          },
        ],
        createContacts: [{ id: "contact-id", email: "test@test.com" }],
      });

      await createBookingScenario({
        eventTypes: [
          {
            id: 1,
            slotInterval: 60,
            length: 60,
            hosts: [
              {
                userId: 101,
                isFixed: false,
              },
              {
                userId: 102,
                isFixed: false,
              },
            ],
            schedulingType: "ROUND_ROBIN",
            metadata: {
              apps: {
                salesforce: {
                  enabled: true,
                  appCategories: ["crm"],
                  roundRobinLeadSkip: true,
                },
              },
            },
          },
        ],
        users: [
          {
            ...TestData.users.example,
            email: "example@example.com",
            id: 101,
            schedules: [TestData.schedules.IstEveningShift],
          },
          {
            ...TestData.users.example,
            email: "example1@example.com",
            id: 102,
            schedules: [TestData.schedules.IstMorningShift],
            defaultScheduleId: 2,
          },
        ],
        bookings: [],
      });

      const scheduleWhenContactOwnerIsSkipped = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: true,
          teamMemberEmail: "example@example.com",
          skipContactOwner: true,
          orgSlug: null,
        },
      });

      // Both users slot would be available as contact owner(example@example.com) is skipped and we fallback to all users of RR
      expect(scheduleWhenContactOwnerIsSkipped).toHaveTimeSlots(
        [
          `04:30:00.000Z`,
          `05:30:00.000Z`,
          `06:30:00.000Z`,
          `07:30:00.000Z`,
          `08:30:00.000Z`,
          `09:30:00.000Z`,
          `10:30:00.000Z`,
          `11:30:00.000Z`,
          `12:30:00.000Z`,
          `13:30:00.000Z`,
          `14:30:00.000Z`,
          `15:30:00.000Z`,
        ],
        {
          dateString: plus2DateString,
        }
      );
    });
  });

  describe("User Event", () => {
    test("correctly identifies unavailable slots from Cal Bookings in different status", async () => {
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
      const { dateString: plus3DateString } = getDate({ dateIncrement: 3 });

      // An event with one accepted booking
      await createBookingScenario({
        // An event with length 30 minutes, slotInterval 45 minutes, and minimumBookingNotice 1440 minutes (24 hours)
        eventTypes: [
          {
            id: 1,
            // If `slotInterval` is set, it supersedes `length`
            slotInterval: 45,
            length: 45,
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
          },
        ],
        bookings: [
          // That event has one accepted booking from 4:00 to 4:15 in GMT on Day + 3 which is 9:30 to 9:45 in IST
          {
            eventTypeId: 1,
            userId: 101,
            status: "ACCEPTED",
            // Booking Time is stored in GMT in DB. So, provide entry in GMT only.
            startTime: `${plus3DateString}T04:00:00.000Z`,
            endTime: `${plus3DateString}T04:15:00.000Z`,
          },
          {
            eventTypeId: 1,
            userId: 101,
            status: "REJECTED",
            // Booking Time is stored in GMT in DB. So, provide entry in GMT only.
            startTime: `${plus2DateString}T04:00:00.000Z`,
            endTime: `${plus2DateString}T04:15:00.000Z`,
          },
          {
            eventTypeId: 1,
            userId: 101,
            status: "CANCELLED",
            // Booking Time is stored in GMT in DB. So, provide entry in GMT only.
            startTime: `${plus2DateString}T05:00:00.000Z`,
            endTime: `${plus2DateString}T05:15:00.000Z`,
          },
          {
            eventTypeId: 1,
            userId: 101,
            status: "PENDING",
            // Booking Time is stored in GMT in DB. So, provide entry in GMT only.
            startTime: `${plus2DateString}T06:00:00.000Z`,
            endTime: `${plus2DateString}T06:15:00.000Z`,
          },
        ],
      });

      // Day Plus 2 is completely free - It only has non accepted bookings
      const scheduleOnCompletelyFreeDay = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          // EventTypeSlug doesn't matter for non-dynamic events
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      // getSchedule returns timeslots in GMT
      expect(scheduleOnCompletelyFreeDay).toHaveTimeSlots(
        [
          "04:00:00.000Z",
          "04:45:00.000Z",
          "05:30:00.000Z",
          "06:15:00.000Z",
          "07:00:00.000Z",
          "07:45:00.000Z",
          "08:30:00.000Z",
          "09:15:00.000Z",
          "10:00:00.000Z",
          "10:45:00.000Z",
          "11:30:00.000Z",
        ],
        {
          dateString: plus2DateString,
        }
      );

      // Day plus 3
      const scheduleForDayWithOneBooking = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus2DateString}T18:30:00.000Z`,
          endTime: `${plus3DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      expect(scheduleForDayWithOneBooking).toHaveTimeSlots(
        [
          // "04:00:00.000Z", - This slot is unavailable because of the booking from 4:00 to 4:15
          `04:15:00.000Z`,
          `05:00:00.000Z`,
          `05:45:00.000Z`,
          `06:30:00.000Z`,
          `07:15:00.000Z`,
          `08:00:00.000Z`,
          `08:45:00.000Z`,
          `09:30:00.000Z`,
          `10:15:00.000Z`,
          `11:00:00.000Z`,
          `11:45:00.000Z`,
        ],
        {
          dateString: plus3DateString,
        }
      );
    });

    test("slots are available as per `length`, `slotInterval` of the event", async () => {
      await createBookingScenario({
        eventTypes: [
          {
            id: 1,
            length: 30,
            users: [
              {
                id: 101,
              },
            ],
          },
          {
            id: 2,
            length: 30,
            slotInterval: 120,
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
          },
        ],
      });
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
      const scheduleForEventWith30Length = await availableSlotsService.getAvailableSlots({
        input: {
          orgSlug: null,
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
        },
      });

      expect(scheduleForEventWith30Length).toHaveTimeSlots(
        [
          `04:00:00.000Z`,
          `04:30:00.000Z`,
          `05:00:00.000Z`,
          `05:30:00.000Z`,
          `06:00:00.000Z`,
          `06:30:00.000Z`,
          `07:00:00.000Z`,
          `07:30:00.000Z`,
          `08:00:00.000Z`,
          `08:30:00.000Z`,
          `09:00:00.000Z`,
          `09:30:00.000Z`,
          `10:00:00.000Z`,
          `10:30:00.000Z`,
          `11:00:00.000Z`,
          `11:30:00.000Z`,
          `12:00:00.000Z`,
        ],
        {
          dateString: plus2DateString,
        }
      );

      const scheduleForEventWith30minsLengthAndSlotInterval2hrs =
        await availableSlotsService.getAvailableSlots({
          input: {
            orgSlug: null,
            eventTypeId: 2,
            eventTypeSlug: "",
            startTime: `${plus1DateString}T18:30:00.000Z`,
            endTime: `${plus2DateString}T18:29:59.999Z`,
            timeZone: Timezones["+5:30"],
            isTeamEvent: false,
          },
        });
      // `slotInterval` takes precedence over `length`
      // 4:30 is utc so it is 10:00 in IST
      expect(scheduleForEventWith30minsLengthAndSlotInterval2hrs).toHaveTimeSlots(
        [`04:30:00.000Z`, `06:30:00.000Z`, `08:30:00.000Z`, `10:30:00.000Z`, `12:30:00.000Z`],
        {
          dateString: plus2DateString,
        }
      );
    });

    test("minimumBookingNotice is respected", async () => {
      await createBookingScenario({
        eventTypes: [
          {
            id: 1,
            length: 2 * 60,
            minimumBookingNotice: 13 * 60, // Would take the minimum bookable time to be 18:30UTC+13 = 7:30AM UTC
            users: [
              {
                id: 101,
              },
            ],
          },
          {
            id: 2,
            length: 2 * 60,
            minimumBookingNotice: 10 * 60, // Would take the minimum bookable time to be 18:30UTC+10 = 4:30AM UTC
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
          },
        ],
      });

      const { dateString: todayDateString } = getDate();
      const { dateString: minus1DateString } = getDate({ dateIncrement: -1 });

      // Time Travel to the beginning of today after getting all the dates correctly.
      timeTravelToTheBeginningOfToday({ utcOffsetInHours: 5.5 });

      const scheduleForEventWithBookingNotice13Hrs = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${minus1DateString}T18:30:00.000Z`,
          endTime: `${todayDateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      expect(scheduleForEventWithBookingNotice13Hrs).toHaveTimeSlots(
        [
          /*`03:30:00.000Z`, `05:30:00.000Z`, - Minimum time slot is 07:30 UTC which is 13hrs from 18:30*/
          `07:30:00.000Z`,
          `09:30:00.000Z`,
        ],
        {
          dateString: todayDateString,
        }
      );

      const scheduleForEventWithBookingNotice10Hrs = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 2,
          eventTypeSlug: "",
          startTime: `${minus1DateString}T18:30:00.000Z`,
          endTime: `${todayDateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });
      expect(scheduleForEventWithBookingNotice10Hrs).toHaveTimeSlots(
        [
          /*`03:30:00.000Z`, - Minimum bookable time slot is 04:30 UTC which is 10hrs from 18:30 */
          `04:30:00.000Z`,
          `06:30:00.000Z`,
          `08:30:00.000Z`,
          `10:30:00.000Z`,
        ],
        {
          dateString: todayDateString,
        }
      );
    });

    test("afterBuffer and beforeBuffer tests - Non Cal Busy Time", async () => {
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
      const { dateString: plus3DateString } = getDate({ dateIncrement: 3 });

      CalendarManagerMock.getBusyCalendarTimes.mockResolvedValue({
        success: true,
        data: [
          {
            start: `${plus3DateString}T04:00:00.000Z`,
            end: `${plus3DateString}T05:59:59.000Z`,
          },
        ],
      });

      const scenarioData = {
        eventTypes: [
          {
            id: 1,
            length: 120,
            beforeEventBuffer: 120,
            afterEventBuffer: 120,
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
            credentials: [getGoogleCalendarCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
          },
        ],
        apps: [TestData.apps["google-calendar"]],
      };

      await createBookingScenario(scenarioData);

      const scheduleForEventOnADayWithNonCalBooking = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus2DateString}T18:30:00.000Z`,
          endTime: `${plus3DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      expect(scheduleForEventOnADayWithNonCalBooking).toHaveTimeSlots(
        [
          // `05:30:00.000Z`, // - 5:30 AM is not available because 08:30AM slot has a `beforeEventBuffer`
          `08:30:00.000Z`, // - 8:30 AM is available (2 PM IST)
          `10:30:00.000Z`,
        ],
        {
          dateString: plus3DateString,
        }
      );
    });

    test("afterBuffer and beforeBuffer tests - Cal Busy Time", async () => {
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
      const { dateString: plus3DateString } = getDate({ dateIncrement: 3 });

      CalendarManagerMock.getBusyCalendarTimes.mockResolvedValue({
        success: true,
        data: [
          {
            start: `${plus3DateString}T04:00:00.000Z`,
            end: `${plus3DateString}T05:59:59.000Z`,
          },
        ],
      });

      const scenarioData = {
        eventTypes: [
          {
            id: 1,
            length: 120,
            beforeEventBuffer: 120,
            afterEventBuffer: 120,
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
            credentials: [getGoogleCalendarCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
          },
        ],
        bookings: [
          {
            userId: 101,
            eventTypeId: 1,
            startTime: `${plus2DateString}T04:00:00.000Z`,
            endTime: `${plus2DateString}T05:59:59.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
        ],
        apps: [TestData.apps["google-calendar"]],
      };

      await createBookingScenario(scenarioData);

      const scheduleForEventOnADayWithCalBooking = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      expect(scheduleForEventOnADayWithCalBooking).toHaveTimeSlots(
        [
          // `05:30:00.000Z`, // - 5:30 AM is not available because of afterBuffer(120 mins) of the existing booking(4:00-5:59AM slot)
          // `08:30:00.000Z`, // - 8:30 AM is not available because of beforeBuffer(120mins) of possible booking at 08:30
          `10:30:00.000Z`,
        ],
        {
          dateString: plus2DateString,
        }
      );
    });

    test("afterBuffer is respected even when query startTime begins after booking endTime (pre-fetch buffer window)", async () => {
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });

      CalendarManagerMock.getBusyCalendarTimes.mockResolvedValue({
        success: true,
        data: [],
      });

      const scenarioData = {
        eventTypes: [
          {
            id: 1,
            length: 120,
            beforeEventBuffer: 120,
            afterEventBuffer: 120,
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
            credentials: [getGoogleCalendarCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
          },
        ],
        bookings: [
          {
            userId: 101,
            eventTypeId: 1,
            startTime: `${plus2DateString}T04:00:00.000Z`,
            endTime: `${plus2DateString}T05:59:59.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
        ],
        apps: [TestData.apps["google-calendar"]],
      };

      await createBookingScenario(scenarioData);

      const schedule = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus2DateString}T06:00:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      expect(schedule).toHaveTimeSlots([`10:30:00.000Z`], {
        dateString: plus2DateString,
      });
    });

    test("Start times are offset (offsetStart)", async () => {
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });

      CalendarManagerMock.getBusyCalendarTimes.mockResolvedValue({ success: true, data: [] });

      const scenarioData = {
        eventTypes: [
          {
            id: 1,
            length: 25,
            offsetStart: 5,
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
            credentials: [getGoogleCalendarCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
          },
        ],
        apps: [TestData.apps["google-calendar"]],
      };

      await createBookingScenario(scenarioData);

      const schedule = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      expect(schedule).toHaveTimeSlots(
        [
          `04:05:00.000Z`,
          `04:35:00.000Z`,
          `05:05:00.000Z`,
          `05:35:00.000Z`,
          `06:05:00.000Z`,
          `06:35:00.000Z`,
          `07:05:00.000Z`,
          `07:35:00.000Z`,
          `08:05:00.000Z`,
          `08:35:00.000Z`,
          `09:05:00.000Z`,
          `09:35:00.000Z`,
          `10:05:00.000Z`,
          `10:35:00.000Z`,
          `11:05:00.000Z`,
          `11:35:00.000Z`,
          `12:05:00.000Z`,
        ],
        {
          dateString: plus2DateString,
        }
      );
    });

    test("Check for Date overrides", async () => {
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });

      const scenarioData = {
        eventTypes: [
          {
            id: 1,
            length: 60,
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [TestData.schedules.IstWorkHoursWithDateOverride(plus2DateString)],
          },
        ],
      };

      await createBookingScenario(scenarioData);

      const scheduleForEventOnADayWithDateOverride = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      expect(scheduleForEventOnADayWithDateOverride).toHaveTimeSlots(
        ["08:30:00.000Z", "09:30:00.000Z", "10:30:00.000Z", "11:30:00.000Z"],
        {
          dateString: plus2DateString,
        }
      );
    });

    test("that a user is considered busy when there's a booking they host", async () => {
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });

      await createBookingScenario({
        eventTypes: [
          // A Collective Event Type hosted by this user
          {
            id: 1,
            slotInterval: 45,
            schedulingType: SchedulingType.COLLECTIVE,
            hosts: [
              {
                userId: 101,
              },
              {
                userId: 102,
              },
            ],
          },
          // A default Event Type which this user owns
          {
            id: 2,
            length: 15,
            slotInterval: 45,
            users: [{ id: 101 }],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
          },
          {
            ...TestData.users.example,
            id: 102,
            schedules: [TestData.schedules.IstWorkHours],
          },
        ],
        bookings: [
          // Create a booking on our Collective Event Type
          {
            userId: 101,
            attendees: [
              {
                email: "IntegrationTestUser102@example.com",
              },
            ],
            eventTypeId: 1,
            status: "ACCEPTED",
            startTime: `${plus2DateString}T04:00:00.000Z`,
            endTime: `${plus2DateString}T04:15:00.000Z`,
          },
        ],
      });

      // Requesting this user's availability for their
      // individual Event Type
      const thisUserAvailability = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 2,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      expect(thisUserAvailability).toHaveTimeSlots(
        [
          // `04:00:00.000Z`, // <- This slot should be occupied by the Collective Event
          `04:15:00.000Z`,
          `05:00:00.000Z`,
          `05:45:00.000Z`,
          `06:30:00.000Z`,
          `07:15:00.000Z`,
          `08:00:00.000Z`,
          `08:45:00.000Z`,
          `09:30:00.000Z`,
          `10:15:00.000Z`,
          `11:00:00.000Z`,
          `11:45:00.000Z`,
        ],
        {
          dateString: plus2DateString,
        }
      );
    });

    test("test that booking limit is working correctly if user is all day available", async () => {
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
      const { dateString: plus3DateString } = getDate({ dateIncrement: 3 });

      const scenarioData = {
        eventTypes: [
          {
            id: 1,
            length: 60,
            beforeEventBuffer: 0,
            afterEventBuffer: 0,
            bookingLimits: {
              PER_DAY: 1,
            },
            users: [
              {
                id: 101,
              },
            ],
          },
          {
            id: 2,
            length: 60,
            beforeEventBuffer: 0,
            afterEventBuffer: 0,
            bookingLimits: {
              PER_DAY: 2,
            },
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [
              {
                id: 1,
                name: "All Day available",
                availability: [
                  {
                    userId: null,
                    eventTypeId: null,
                    days: [0, 1, 2, 3, 4, 5, 6],
                    startTime: new Date("1970-01-01T00:00:00.000Z"),
                    endTime: new Date("1970-01-01T23:59:59.999Z"),
                    date: null,
                  },
                ],
                timeZone: Timezones["+6:00"],
              },
            ],
          },
        ],
        // One bookings for each(E1 and E2) on plus2Date
        bookings: [
          {
            userId: 101,
            eventTypeId: 1,
            startTime: `${plus2DateString}T08:00:00.000Z`,
            endTime: `${plus2DateString}T09:00:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
          {
            userId: 101,
            eventTypeId: 2,
            startTime: `${plus2DateString}T08:00:00.000Z`,
            endTime: `${plus2DateString}T09:00:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
        ],
      };

      await createBookingScenario(scenarioData);

      const thisUserAvailabilityBookingLimitOne = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T00:00:00.000Z`,
          endTime: `${plus3DateString}T23:59:59.999Z`,
          timeZone: Timezones["+6:00"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      const thisUserAvailabilityBookingLimitTwo = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 2,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T00:00:00.000Z`,
          endTime: `${plus3DateString}T23:59:59.999Z`,
          timeZone: Timezones["+6:00"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      let availableSlotsInTz: dayjs.Dayjs[] = [];
      for (const date in thisUserAvailabilityBookingLimitOne.slots) {
        thisUserAvailabilityBookingLimitOne.slots[date].forEach((timeObj) => {
          availableSlotsInTz.push(dayjs(timeObj.time).tz(Timezones["+6:00"]));
        });
      }

      expect(availableSlotsInTz.filter((slot) => slot.format().startsWith(plus2DateString)).length).toBe(0); // 1 booking per day as limit

      availableSlotsInTz = [];
      for (const date in thisUserAvailabilityBookingLimitTwo.slots) {
        thisUserAvailabilityBookingLimitTwo.slots[date].forEach((timeObj) => {
          availableSlotsInTz.push(dayjs(timeObj.time).tz(Timezones["+6:00"]));
        });
      }
      expect(availableSlotsInTz.filter((slot) => slot.format().startsWith(plus2DateString)).length).toBe(23); // 2 booking per day as limit, only one booking on that
    });

    test("test that duration limit is working correctly if user is all day available", async () => {
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
      const { dateString: plus3DateString } = getDate({ dateIncrement: 3 });

      const scenarioData = {
        eventTypes: [
          {
            id: 1,
            length: 60,
            beforeEventBuffer: 0,
            afterEventBuffer: 0,
            durationLimits: {
              PER_DAY: 120, // 2 hours per day
            },
            users: [
              {
                id: 101,
              },
            ],
          },
          {
            id: 2,
            length: 60,
            beforeEventBuffer: 0,
            afterEventBuffer: 0,
            durationLimits: {
              PER_DAY: 240, // 4 hours per day
            },
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [
              {
                id: 1,
                name: "All Day available",
                availability: [
                  {
                    userId: null,
                    eventTypeId: null,
                    days: [0, 1, 2, 3, 4, 5, 6],
                    startTime: new Date("1970-01-01T00:00:00.000Z"),
                    endTime: new Date("1970-01-01T23:59:59.999Z"),
                    date: null,
                  },
                ],
                timeZone: Timezones["+6:00"],
              },
            ],
          },
        ],
        bookings: [
          {
            userId: 101,
            eventTypeId: 1,
            startTime: `${plus2DateString}T08:00:00.000Z`,
            endTime: `${plus2DateString}T09:00:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
          {
            userId: 101,
            eventTypeId: 1,
            startTime: `${plus2DateString}T10:00:00.000Z`,
            endTime: `${plus2DateString}T11:00:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
          {
            userId: 101,
            eventTypeId: 2,
            startTime: `${plus2DateString}T12:00:00.000Z`,
            endTime: `${plus2DateString}T13:00:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
        ],
      };

      await createBookingScenario(scenarioData);

      const thisUserAvailabilityDurationLimitReached = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T00:00:00.000Z`,
          endTime: `${plus3DateString}T23:59:59.999Z`,
          timeZone: Timezones["+6:00"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      const thisUserAvailabilityDurationLimitNotReached = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 2,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T00:00:00.000Z`,
          endTime: `${plus3DateString}T23:59:59.999Z`,
          timeZone: Timezones["+6:00"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      let availableSlotsInTz: dayjs.Dayjs[] = [];
      for (const date in thisUserAvailabilityDurationLimitReached.slots) {
        thisUserAvailabilityDurationLimitReached.slots[date].forEach((timeObj) => {
          availableSlotsInTz.push(dayjs(timeObj.time).tz(Timezones["+6:00"]));
        });
      }

      expect(availableSlotsInTz.filter((slot) => slot.format().startsWith(plus2DateString)).length).toBe(0);

      availableSlotsInTz = [];
      for (const date in thisUserAvailabilityDurationLimitNotReached.slots) {
        thisUserAvailabilityDurationLimitNotReached.slots[date].forEach((timeObj) => {
          availableSlotsInTz.push(dayjs(timeObj.time).tz(Timezones["+6:00"]));
        });
      }

      expect(
        availableSlotsInTz.filter((slot) => slot.format().startsWith(plus2DateString)).length
      ).toBeGreaterThan(0);
    });

    test("test that duration limit is working correctly with different timezone", async () => {
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
      const { dateString: plus3DateString } = getDate({ dateIncrement: 3 });

      const scenarioData = {
        eventTypes: [
          {
            id: 1,
            length: 60,
            beforeEventBuffer: 0,
            afterEventBuffer: 0,
            durationLimits: {
              PER_DAY: 120, // 2 hours per day
            },
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [
              {
                id: 1,
                name: "All Day available",
                availability: [
                  {
                    userId: null,
                    eventTypeId: null,
                    days: [0, 1, 2, 3, 4, 5, 6],
                    startTime: new Date("1970-01-01T00:00:00.000Z"),
                    endTime: new Date("1970-01-01T23:59:59.999Z"),
                    date: null,
                  },
                ],
                timeZone: Timezones["+6:00"],
              },
            ],
          },
        ],
        bookings: [
          {
            userId: 101,
            eventTypeId: 1,
            startTime: `${plus2DateString}T08:00:00.000Z`,
            endTime: `${plus2DateString}T09:00:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
          {
            userId: 101,
            eventTypeId: 1,
            startTime: `${plus2DateString}T10:00:00.000Z`,
            endTime: `${plus2DateString}T11:00:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
        ],
      };

      await createBookingScenario(scenarioData);

      const thisUserAvailabilityDurationLimit = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T00:00:00.000Z`,
          endTime: `${plus3DateString}T23:59:59.999Z`,
          timeZone: Timezones["-11:00"], // attendee timezone
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      const availableSlotsInTz: dayjs.Dayjs[] = [];
      for (const date in thisUserAvailabilityDurationLimit.slots) {
        thisUserAvailabilityDurationLimit.slots[date].forEach((timeObj) => {
          availableSlotsInTz.push(dayjs(timeObj.time).tz(Timezones["+6:00"]));
        });
      }

      expect(availableSlotsInTz.filter((slot) => slot.format().startsWith(plus2DateString)).length).toBe(0);
    });

    test.skip("test that PER_WEEK duration limits work correctly", async () => {
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
      const { dateString: plus3DateString } = getDate({ dateIncrement: 3 });
      const { dateString: plus4DateString } = getDate({ dateIncrement: 4 });
      const { dateString: plus5DateString } = getDate({ dateIncrement: 5 });

      const scenarioData = {
        eventTypes: [
          {
            id: 1,
            length: 60,
            beforeEventBuffer: 0,
            afterEventBuffer: 0,
            durationLimits: {
              PER_WEEK: 180, // 3 hours per week
            },
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [
              {
                id: 1,
                name: "All Day available",
                availability: [
                  {
                    userId: null,
                    eventTypeId: null,
                    days: [0, 1, 2, 3, 4, 5, 6],
                    startTime: new Date("1970-01-01T00:00:00.000Z"),
                    endTime: new Date("1970-01-01T23:59:59.999Z"),
                    date: null,
                  },
                ],
                timeZone: Timezones["+6:00"],
              },
            ],
          },
        ],
        bookings: [
          {
            userId: 101,
            eventTypeId: 1,
            startTime: `${plus1DateString}T08:00:00.000Z`,
            endTime: `${plus1DateString}T09:00:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
          {
            userId: 101,
            eventTypeId: 1,
            startTime: `${plus2DateString}T10:00:00.000Z`,
            endTime: `${plus2DateString}T11:00:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
          {
            userId: 101,
            eventTypeId: 1,
            startTime: `${plus3DateString}T12:00:00.000Z`,
            endTime: `${plus3DateString}T13:00:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
        ],
      };

      await createBookingScenario(scenarioData);

      const weeklyAvailability = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T00:00:00.000Z`,
          endTime: `${plus5DateString}T23:59:59.999Z`,
          timeZone: Timezones["+6:00"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      const availableSlotsInTz: dayjs.Dayjs[] = [];
      for (const date in weeklyAvailability.slots) {
        weeklyAvailability.slots[date].forEach((timeObj) => {
          availableSlotsInTz.push(dayjs(timeObj.time).tz(Timezones["+6:00"]));
        });
      }

      expect(
        availableSlotsInTz.filter(
          (slot) =>
            slot.format().startsWith(plus1DateString) ||
            slot.format().startsWith(plus2DateString) ||
            slot.format().startsWith(plus3DateString) ||
            slot.format().startsWith(plus4DateString)
        ).length
      ).toBe(0);
    });

    test.skip("global team duration limit blocks slots if one fixed host reached limit", async () => {
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
      const { dateString: plus3DateString } = getDate({ dateIncrement: 3 });

      const scenarioData = {
        eventTypes: [
          {
            id: 1,
            length: 60,
            beforeEventBuffer: 0,
            afterEventBuffer: 0,
            team: {
              id: 1,
              durationLimits: { PER_DAY: 120 }, // 2 hours per day
            },
            schedulingType: SchedulingType.COLLECTIVE,
            users: [
              {
                id: 101,
              },
              {
                id: 102,
              },
            ],
          },
          {
            id: 2,
            length: 60,
            beforeEventBuffer: 0,
            afterEventBuffer: 0,
            team: {
              id: 1,
              durationLimits: { PER_DAY: 120 }, // 2 hours per day
            },
            schedulingType: SchedulingType.COLLECTIVE,
            users: [
              {
                id: 101,
              },
              {
                id: 102,
              },
            ],
          },
          {
            id: 3,
            length: 60,
            beforeEventBuffer: 0,
            afterEventBuffer: 0,
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [
              {
                id: 1,
                name: "All Day available",
                availability: [
                  {
                    userId: null,
                    eventTypeId: null,
                    days: [0, 1, 2, 3, 4, 5, 6],
                    startTime: new Date("1970-01-01T00:00:00.000Z"),
                    endTime: new Date("1970-01-01T23:59:59.999Z"),
                    date: null,
                  },
                ],
                timeZone: Timezones["+6:00"],
              },
            ],
          },
        ],
        bookings: [
          {
            userId: 101,
            eventTypeId: 1,
            startTime: `${plus2DateString}T08:00:00.000Z`,
            endTime: `${plus2DateString}T09:00:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
          {
            userId: 101,
            eventTypeId: 1,
            startTime: `${plus2DateString}T10:00:00.000Z`,
            endTime: `${plus2DateString}T11:00:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
        ],
      };

      await createBookingScenario(scenarioData);

      const availabilityEventTypeOne = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T00:00:00.000Z`,
          endTime: `${plus3DateString}T23:59:59.999Z`,
          timeZone: Timezones["+6:00"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      const availableSlotsInTz: dayjs.Dayjs[] = [];
      for (const date in availabilityEventTypeOne.slots) {
        availabilityEventTypeOne.slots[date].forEach((timeObj) => {
          availableSlotsInTz.push(dayjs(timeObj.time).tz(Timezones["+6:00"]));
        });
      }

      expect(availableSlotsInTz.filter((slot) => slot.format().startsWith(plus2DateString)).length).toBe(0);

      const availabilityEventTypeTwo = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 2,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T00:00:00.000Z`,
          endTime: `${plus3DateString}T23:59:59.999Z`,
          timeZone: Timezones["+6:00"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      const availableSlotsInTz2: dayjs.Dayjs[] = [];
      for (const date in availabilityEventTypeTwo.slots) {
        availabilityEventTypeTwo.slots[date].forEach((timeObj) => {
          availableSlotsInTz2.push(dayjs(timeObj.time).tz(Timezones["+6:00"]));
        });
      }

      expect(availableSlotsInTz2.filter((slot) => slot.format().startsWith(plus2DateString)).length).toBe(0);

      const availabilityUserEventType = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 3,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T00:00:00.000Z`,
          endTime: `${plus3DateString}T23:59:59.999Z`,
          timeZone: Timezones["+6:00"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      const availableSlotsInTz3: dayjs.Dayjs[] = [];
      for (const date in availabilityUserEventType.slots) {
        availabilityUserEventType.slots[date].forEach((timeObj) => {
          availableSlotsInTz3.push(dayjs(timeObj.time).tz(Timezones["+6:00"]));
        });
      }

      expect(
        availableSlotsInTz3.filter((slot) => slot.format().startsWith(plus2DateString)).length
      ).toBeGreaterThan(0);
    });

    test.skip("test that combined booking and duration limits work correctly", async () => {
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
      const { dateString: plus3DateString } = getDate({ dateIncrement: 3 });

      const scenarioData = {
        eventTypes: [
          {
            id: 1,
            length: 60,
            beforeEventBuffer: 0,
            afterEventBuffer: 0,
            bookingLimits: {
              PER_DAY: 3, // 3 bookings per day
            },
            durationLimits: {
              PER_DAY: 120, // 2 hours per day
            },
            users: [
              {
                id: 101,
              },
            ],
          },
          {
            id: 2,
            length: 30, // 30 minute event
            beforeEventBuffer: 0,
            afterEventBuffer: 0,
            bookingLimits: {
              PER_DAY: 2, // 2 bookings per day
            },
            durationLimits: {
              PER_DAY: 120, // 2 hours per day
            },
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [
              {
                id: 1,
                name: "All Day available",
                availability: [
                  {
                    userId: null,
                    eventTypeId: null,
                    days: [0, 1, 2, 3, 4, 5, 6],
                    startTime: new Date("1970-01-01T00:00:00.000Z"),
                    endTime: new Date("1970-01-01T23:59:59.999Z"),
                    date: null,
                  },
                ],
                timeZone: Timezones["+6:00"],
              },
            ],
          },
        ],
        bookings: [
          {
            userId: 101,
            eventTypeId: 1,
            startTime: `${plus2DateString}T08:00:00.000Z`,
            endTime: `${plus2DateString}T09:00:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
          {
            userId: 101,
            eventTypeId: 1,
            startTime: `${plus2DateString}T10:00:00.000Z`,
            endTime: `${plus2DateString}T11:00:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
          {
            userId: 101,
            eventTypeId: 2,
            startTime: `${plus2DateString}T12:00:00.000Z`,
            endTime: `${plus2DateString}T12:30:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
        ],
      };

      await createBookingScenario(scenarioData);

      const eventType1Availability = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T00:00:00.000Z`,
          endTime: `${plus3DateString}T23:59:59.999Z`,
          timeZone: Timezones["+6:00"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      const eventType2Availability = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 2,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T00:00:00.000Z`,
          endTime: `${plus3DateString}T23:59:59.999Z`,
          timeZone: Timezones["+6:00"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      let availableSlotsInTz: dayjs.Dayjs[] = [];
      for (const date in eventType1Availability.slots) {
        eventType1Availability.slots[date].forEach((timeObj) => {
          availableSlotsInTz.push(dayjs(timeObj.time).tz(Timezones["+6:00"]));
        });
      }

      expect(availableSlotsInTz.filter((slot) => slot.format().startsWith(plus2DateString)).length).toBe(0);

      availableSlotsInTz = [];
      for (const date in eventType2Availability.slots) {
        eventType2Availability.slots[date].forEach((timeObj) => {
          availableSlotsInTz.push(dayjs(timeObj.time).tz(Timezones["+6:00"]));
        });
      }

      expect(
        availableSlotsInTz.filter((slot) => slot.format().startsWith(plus2DateString)).length
      ).toBeGreaterThan(0);

      // Create a new booking scenario with an additional booking
      await createBookingScenario({
        eventTypes: scenarioData.eventTypes,
        users: scenarioData.users,
        bookings: [
          ...scenarioData.bookings,
          {
            userId: 101,
            eventTypeId: 2,
            startTime: `${plus2DateString}T14:00:00.000Z`,
            endTime: `${plus2DateString}T14:30:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
        ],
      });

      const eventType2AvailabilityUpdated = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 2,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T00:00:00.000Z`,
          endTime: `${plus3DateString}T23:59:59.999Z`,
          timeZone: Timezones["+6:00"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      availableSlotsInTz = [];
      for (const date in eventType2AvailabilityUpdated.slots) {
        eventType2AvailabilityUpdated.slots[date].forEach((timeObj) => {
          availableSlotsInTz.push(dayjs(timeObj.time).tz(Timezones["+6:00"]));
        });
      }

      expect(availableSlotsInTz.filter((slot) => slot.format().startsWith(plus2DateString)).length).toBe(0);
    });

    test("test that booking limit is working correctly if user is all day available and attendee is in different timezone than host", async () => {
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
      const { dateString: plus3DateString } = getDate({ dateIncrement: 3 });

      const scenarioData = {
        eventTypes: [
          {
            id: 1,
            length: 60,
            beforeEventBuffer: 0,
            afterEventBuffer: 0,
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
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [
              {
                id: 1,
                name: "All Day available",
                availability: [
                  {
                    userId: null,
                    eventTypeId: null,
                    days: [0, 1, 2, 3, 4, 5, 6],
                    startTime: new Date("1970-01-01T00:00:00.000Z"),
                    endTime: new Date("1970-01-01T23:59:59.999Z"),
                    date: null,
                  },
                ],
                timeZone: Timezones["+6:00"],
              },
            ],
          },
        ],
        // One bookings for each(E1 and E2) on plus2Date
        bookings: [
          {
            userId: 101,
            eventTypeId: 1,
            startTime: `${plus2DateString}T08:00:00.000Z`,
            endTime: `${plus2DateString}T09:00:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
        ],
      };

      await createBookingScenario(scenarioData);

      const thisUserAvailabilityBookingLimit = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T00:00:00.000Z`,
          endTime: `${plus3DateString}T23:59:59.999Z`,
          timeZone: Timezones["-11:00"], //attendee timezone
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      const availableSlotsInTz: dayjs.Dayjs[] = [];
      for (const date in thisUserAvailabilityBookingLimit.slots) {
        thisUserAvailabilityBookingLimit.slots[date].forEach((timeObj) => {
          availableSlotsInTz.push(dayjs(timeObj.time).tz(Timezones["+6:00"]));
        });
      }

      expect(availableSlotsInTz.filter((slot) => slot.format().startsWith(plus2DateString)).length).toBe(0); // 1 booking per day as limit
    });

    test("global team booking limit block slot if one fixed host reached limit", async () => {
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
      const { dateString: plus3DateString } = getDate({ dateIncrement: 3 });

      const scenarioData = {
        eventTypes: [
          {
            id: 1,
            length: 60,
            beforeEventBuffer: 0,
            afterEventBuffer: 0,
            team: {
              id: 1,
              bookingLimits: { PER_DAY: 1 },
            },
            schedulingType: SchedulingType.COLLECTIVE,
            users: [
              {
                id: 101,
              },
              {
                id: 102,
              },
            ],
          },
          {
            id: 2,
            length: 60,
            beforeEventBuffer: 0,
            afterEventBuffer: 0,
            team: {
              id: 1,
              bookingLimits: { PER_DAY: 1 },
            },
            schedulingType: SchedulingType.COLLECTIVE,
            users: [
              {
                id: 101,
              },
              {
                id: 102,
              },
            ],
          },
          {
            id: 3,
            length: 60,
            beforeEventBuffer: 0,
            afterEventBuffer: 0,
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [
              {
                id: 1,
                name: "All Day available",
                availability: [
                  {
                    userId: null,
                    eventTypeId: null,
                    days: [0, 1, 2, 3, 4, 5, 6],
                    startTime: new Date("1970-01-01T00:00:00.000Z"),
                    endTime: new Date("1970-01-01T23:59:59.999Z"),
                    date: null,
                  },
                ],
                timeZone: Timezones["+6:00"],
              },
            ],
          },
        ],
        bookings: [
          {
            userId: 101,
            eventTypeId: 1,
            startTime: `${plus2DateString}T08:00:00.000Z`,
            endTime: `${plus2DateString}T09:00:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
        ],
      };

      await createBookingScenario(scenarioData);

      const availabilityEventTypeOne = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T00:00:00.000Z`,
          endTime: `${plus3DateString}T23:59:59.999Z`,
          timeZone: Timezones["+6:00"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      const availableSlotsInTz: dayjs.Dayjs[] = [];
      for (const date in availabilityEventTypeOne.slots) {
        availabilityEventTypeOne.slots[date].forEach((timeObj) => {
          availableSlotsInTz.push(dayjs(timeObj.time).tz(Timezones["+6:00"]));
        });
      }

      expect(availableSlotsInTz.filter((slot) => slot.format().startsWith(plus2DateString)).length).toBe(0); // 1 booking per day as limit

      const availabilityEventTypeTwo = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 2,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T00:00:00.000Z`,
          endTime: `${plus3DateString}T23:59:59.999Z`,
          timeZone: Timezones["+6:00"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      for (const date in availabilityEventTypeTwo.slots) {
        availabilityEventTypeTwo.slots[date].forEach((timeObj) => {
          availableSlotsInTz.push(dayjs(timeObj.time).tz(Timezones["+6:00"]));
        });
      }

      expect(availableSlotsInTz.filter((slot) => slot.format().startsWith(plus2DateString)).length).toBe(0); // 1 booking per day as limit

      const availabilityUserEventType = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 3,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T00:00:00.000Z`,
          endTime: `${plus3DateString}T23:59:59.999Z`,
          timeZone: Timezones["+6:00"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      for (const date in availabilityUserEventType.slots) {
        availabilityUserEventType.slots[date].forEach((timeObj) => {
          availableSlotsInTz.push(dayjs(timeObj.time).tz(Timezones["+6:00"]));
        });
      }

      expect(availableSlotsInTz.filter((slot) => slot.format().startsWith(plus2DateString)).length).toBe(23);
    });

    test("global team booking limit blocks correct slots if attendee and host are in different timezone", async () => {
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
      const { dateString: plus3DateString } = getDate({ dateIncrement: 3 });

      const scenarioData = {
        eventTypes: [
          {
            id: 1,
            length: 60,
            beforeEventBuffer: 0,
            afterEventBuffer: 0,
            team: {
              id: 1,
              bookingLimits: { PER_DAY: 1 },
            },
            schedulingType: SchedulingType.COLLECTIVE,
            users: [
              {
                id: 101,
              },
              {
                id: 102,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [
              {
                id: 1,
                name: "All Day available",
                availability: [
                  {
                    userId: null,
                    eventTypeId: null,
                    days: [0, 1, 2, 3, 4, 5, 6],
                    startTime: new Date("1970-01-01T00:00:00.000Z"),
                    endTime: new Date("1970-01-01T23:59:59.999Z"),
                    date: null,
                  },
                ],
                timeZone: Timezones["+6:00"],
              },
            ],
          },
        ],
        bookings: [
          {
            userId: 101,
            eventTypeId: 1,
            startTime: `${plus2DateString}T08:00:00.000Z`,
            endTime: `${plus2DateString}T09:00:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
        ],
      };

      await createBookingScenario(scenarioData);

      const thisUserAvailabilityBookingLimit = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T00:00:00.000Z`,
          endTime: `${plus3DateString}T23:59:59.999Z`,
          timeZone: Timezones["-11:00"], // attendee timezone
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      const availableSlotsInTz: dayjs.Dayjs[] = [];
      for (const date in thisUserAvailabilityBookingLimit.slots) {
        thisUserAvailabilityBookingLimit.slots[date].forEach((timeObj) => {
          availableSlotsInTz.push(dayjs(timeObj.time).tz(Timezones["+6:00"]));
        });
      }

      expect(availableSlotsInTz.filter((slot) => slot.format().startsWith(plus2DateString)).length).toBe(0); // 1 booking per day as limit
    });

    test("booking limits use schedule timezone when set, falling back to user timezone", async () => {
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
      const { dateString: plus3DateString } = getDate({ dateIncrement: 3 });

      const scenarioData = {
        eventTypes: [
          {
            id: 1,
            length: 60,
            beforeEventBuffer: 0,
            afterEventBuffer: 0,
            bookingLimits: {
              PER_DAY: 1,
            },
            schedule: {
              id: 1,
              name: "Schedule with timezone",
              availability: [
                {
                  userId: null,
                  eventTypeId: null,
                  days: [0, 1, 2, 3, 4, 5, 6],
                  startTime: new Date("1970-01-01T00:00:00.000Z"),
                  endTime: new Date("1970-01-01T23:59:59.999Z"),
                  date: null,
                },
              ],
              timeZone: Timezones["+5:30"],
            },
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [
              {
                id: 2,
                name: "User schedule",
                availability: [
                  {
                    userId: null,
                    eventTypeId: null,
                    days: [0, 1, 2, 3, 4, 5, 6],
                    startTime: new Date("1970-01-01T00:00:00.000Z"),
                    endTime: new Date("1970-01-01T23:59:59.999Z"),
                    date: null,
                  },
                ],
                timeZone: Timezones["+6:00"],
              },
            ],
          },
        ],
        bookings: [
          {
            userId: 101,
            eventTypeId: 1,
            startTime: `${plus2DateString}T08:00:00.000Z`,
            endTime: `${plus2DateString}T09:00:00.000Z`,
            status: "ACCEPTED" as BookingStatus,
          },
        ],
      };

      await createBookingScenario(scenarioData);

      const availability = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T00:00:00.000Z`,
          endTime: `${plus3DateString}T23:59:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      const availableSlotsInScheduleTz: dayjs.Dayjs[] = [];
      for (const date in availability.slots) {
        availability.slots[date].forEach((timeObj) => {
          availableSlotsInScheduleTz.push(dayjs(timeObj.time).tz(Timezones["+5:30"]));
        });
      }

      expect(
        availableSlotsInScheduleTz.filter((slot) => slot.format().startsWith(plus2DateString)).length
      ).toBe(0);
    });

    test("a slot counts as being busy when the eventType is requiresConfirmation and requiresConfirmationWillBlockSlot", async () => {
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });

      await createBookingScenario({
        eventTypes: [
          // A default Event Type which this user owns
          {
            id: 2,
            length: 15,
            slotInterval: 45,
            users: [{ id: 101 }],
            requiresConfirmation: true,
            requiresConfirmationWillBlockSlot: true,
          },
          {
            id: 3,
            length: 15,
            slotInterval: 45,
            users: [{ id: 101 }],
            requiresConfirmation: true,
            requiresConfirmationWillBlockSlot: false,
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
          },
        ],
        bookings: [
          {
            userId: 101,
            attendees: [
              {
                email: "IntegrationTestUser102@example.com",
              },
            ],
            eventTypeId: 2,
            status: "PENDING",
            startTime: `${plus2DateString}T04:00:00.000Z`,
            endTime: `${plus2DateString}T04:15:00.000Z`,
          },
          {
            userId: 101,
            attendees: [
              {
                email: "IntegrationTestUser103@example.com",
              },
            ],
            eventTypeId: 3,
            status: "PENDING",
            startTime: `${plus2DateString}T05:00:00.000Z`,
            endTime: `${plus2DateString}T05:15:00.000Z`,
          },
        ],
      });

      // Requesting this user's availability for their
      // individual Event Type
      const thisUserAvailability = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 2,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      expect(thisUserAvailability).toHaveTimeSlots(
        [
          // `04:00:00.000Z`, // <- This slot should be occupied by the Pending Requires Confirmation booking blocking this slot
          `04:15:00.000Z`,
          `05:00:00.000Z`, // <- This slot should be available to book as this event type (id: 3) has requires confirmation without blocking the slot
          `05:45:00.000Z`,
          `06:30:00.000Z`,
          `07:15:00.000Z`,
          `08:00:00.000Z`,
          `08:45:00.000Z`,
          `09:30:00.000Z`,
          `10:15:00.000Z`,
          `11:00:00.000Z`,
          `11:45:00.000Z`,
        ],
        {
          dateString: plus2DateString,
        }
      );
    });

    test("Edge Case: Same day OOO entries that could accidentally be considered in past shouldn't crash the getSchedule", async () => {
      // Set a fixed date for testing
      vi.setSystemTime("2024-05-21T00:00:13Z");

      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: todayDateString } = getDate({ dateIncrement: 0 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });

      await createBookingScenario({
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
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
            outOfOffice: {
              dateRanges: [
                {
                  start: `${todayDateString}T00:00:00.000Z`,
                  end: `${todayDateString}T23:59:59.999Z`,
                },
              ],
            },
          },
        ],
      });

      const schedule = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      // Verify that we get slots for the requested dates
      expect(schedule).toHaveTimeSlots(
        [
          "04:00:00.000Z",
          "04:45:00.000Z",
          "05:30:00.000Z",
          "06:15:00.000Z",
          "07:00:00.000Z",
          "07:45:00.000Z",
          "08:30:00.000Z",
          "09:15:00.000Z",
          "10:00:00.000Z",
          "10:45:00.000Z",
          "11:30:00.000Z",
        ],
        {
          dateString: plus2DateString,
        }
      );
    });
  });

  describe("Team Event", () => {
    test("correctly identifies unavailable slots from calendar for all users in collective scheduling, considers bookings of users in other events as well", async () => {
      const { dateString: todayDateString } = getDate();

      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });

      await createBookingScenario({
        eventTypes: [
          // An event having two users with one accepted booking
          {
            id: 1,
            slotInterval: 45,
            schedulingType: SchedulingType.COLLECTIVE,
            length: 45,
            users: [
              {
                id: 101,
              },
              {
                id: 102,
              },
            ],
          },
          {
            id: 2,
            slotInterval: 45,
            length: 45,
            users: [
              {
                id: 102,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
          },
          {
            ...TestData.users.example,
            id: 102,
            schedules: [TestData.schedules.IstWorkHours],
          },
        ],
        bookings: [
          {
            userId: 101,
            eventTypeId: 1,
            status: "ACCEPTED",
            startTime: `${plus2DateString}T04:00:00.000Z`,
            endTime: `${plus2DateString}T04:15:00.000Z`,
          },
          {
            userId: 102,
            eventTypeId: 2,
            status: "ACCEPTED",
            startTime: `${plus2DateString}T05:30:00.000Z`,
            endTime: `${plus2DateString}T05:45:00.000Z`,
          },
        ],
      });

      const scheduleForTeamEventOnADayWithNoBooking = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${todayDateString}T18:30:00.000Z`,
          endTime: `${plus1DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: true,
          orgSlug: null,
        },
      });

      expect(scheduleForTeamEventOnADayWithNoBooking).toHaveTimeSlots(
        [
          `04:00:00.000Z`,
          `04:45:00.000Z`,
          `05:30:00.000Z`,
          `06:15:00.000Z`,
          `07:00:00.000Z`,
          `07:45:00.000Z`,
          `08:30:00.000Z`,
          `09:15:00.000Z`,
          `10:00:00.000Z`,
          `10:45:00.000Z`,
          `11:30:00.000Z`,
        ],
        {
          dateString: plus1DateString,
        }
      );

      const scheduleForTeamEventOnADayWithOneBookingForEachUser =
        await availableSlotsService.getAvailableSlots({
          input: {
            eventTypeId: 1,
            eventTypeSlug: "",
            startTime: `${plus1DateString}T18:30:00.000Z`,
            endTime: `${plus2DateString}T18:29:59.999Z`,
            timeZone: Timezones["+5:30"],
            isTeamEvent: true,
            orgSlug: null,
          },
        });

      // A user with blocked time in another event, still affects Team Event availability
      // It's a collective availability, so both user 101 and 102 are considered for timeslots
      expect(scheduleForTeamEventOnADayWithOneBookingForEachUser).toHaveTimeSlots(
        [
          //`04:00:00.000Z`, - Blocked with User 101
          `04:15:00.000Z`,
          //`05:00:00.000Z`, - Blocked with User 102 in event 2
          `05:45:00.000Z`,
          `06:30:00.000Z`,
          `07:15:00.000Z`,
          `08:00:00.000Z`,
          `08:45:00.000Z`,
          `09:30:00.000Z`,
          `10:15:00.000Z`,
          `11:00:00.000Z`,
          `11:45:00.000Z`,
        ],
        { dateString: plus2DateString }
      );
    });

    test("correctly identifies unavailable slots from calendar for all users in Round Robin scheduling, considers bookings of users in other events as well", async () => {
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
      const { dateString: plus3DateString } = getDate({ dateIncrement: 3 });

      await createBookingScenario({
        eventTypes: [
          // An event having two users with one accepted booking
          {
            id: 1,
            slotInterval: 45,
            length: 45,
            users: [
              {
                id: 101,
              },
              {
                id: 102,
              },
            ],
            schedulingType: "ROUND_ROBIN",
          },
          {
            id: 2,
            slotInterval: 45,
            length: 45,
            users: [
              {
                id: 102,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
          },
          {
            ...TestData.users.example,
            id: 102,
            schedules: [TestData.schedules.IstWorkHours],
          },
        ],
        bookings: [
          {
            userId: 101,
            eventTypeId: 1,
            status: "ACCEPTED",
            startTime: `${plus2DateString}T04:00:00.000Z`,
            endTime: `${plus2DateString}T04:15:00.000Z`,
          },
          {
            userId: 102,
            eventTypeId: 2,
            status: "ACCEPTED",
            startTime: `${plus2DateString}T05:30:00.000Z`,
            endTime: `${plus2DateString}T05:45:00.000Z`,
          },
          {
            userId: 101,
            eventTypeId: 1,
            status: "ACCEPTED",
            startTime: `${plus3DateString}T04:00:00.000Z`,
            endTime: `${plus3DateString}T04:15:00.000Z`,
          },
          {
            userId: 102,
            eventTypeId: 2,
            status: "ACCEPTED",
            startTime: `${plus3DateString}T04:00:00.000Z`,
            endTime: `${plus3DateString}T04:15:00.000Z`,
          },
        ],
      });
      const scheduleForTeamEventOnADayWithOneBookingForEachUserButOnDifferentTimeslots =
        await availableSlotsService.getAvailableSlots({
          input: {
            eventTypeId: 1,
            eventTypeSlug: "",
            startTime: `${plus1DateString}T18:30:00.000Z`,
            endTime: `${plus2DateString}T18:29:59.999Z`,
            timeZone: Timezones["+5:30"],
            isTeamEvent: true,
            orgSlug: null,
          },
        });
      // A user with blocked time in another event, still affects Team Event availability
      expect(scheduleForTeamEventOnADayWithOneBookingForEachUserButOnDifferentTimeslots).toHaveTimeSlots(
        [
          `04:15:00.000Z`,
          `05:45:00.000Z`,
          `06:30:00.000Z`,
          `07:15:00.000Z`,
          `08:00:00.000Z`,
          `08:45:00.000Z`,
          `09:30:00.000Z`,
          `10:15:00.000Z`,
          `11:00:00.000Z`,
          `11:45:00.000Z`,
        ],
        { dateString: plus2DateString }
      );

      const scheduleForTeamEventOnADayWithOneBookingForEachUserOnSameTimeSlot =
        await availableSlotsService.getAvailableSlots({
          input: {
            eventTypeId: 1,
            eventTypeSlug: "",
            startTime: `${plus2DateString}T18:30:00.000Z`,
            endTime: `${plus3DateString}T18:29:59.999Z`,
            timeZone: Timezones["+5:30"],
            isTeamEvent: true,
            orgSlug: null,
          },
        });
      // A user with blocked time in another event, still affects Team Event availability
      expect(scheduleForTeamEventOnADayWithOneBookingForEachUserOnSameTimeSlot).toHaveTimeSlots(
        [
          //`04:00:00.000Z`, // - Blocked with User 101 as well as User 102, so not available in Round Robin
          `04:15:00.000Z`,
          `05:00:00.000Z`,
          `05:45:00.000Z`,
          `06:30:00.000Z`,
          `07:15:00.000Z`,
          `08:00:00.000Z`,
          `08:45:00.000Z`,
          `09:30:00.000Z`,
          `10:15:00.000Z`,
          `11:00:00.000Z`,
          `11:45:00.000Z`,
        ],
        { dateString: plus3DateString }
      );
    });

    test("getSchedule can get slots of org's member event type when orgSlug, eventTypeSlug passed as input", async () => {
      const org = await createOrganization({ name: "acme", slug: "acme" });

      const organizer = getOrganizer({
        name: "Organizer",
        email: "organizer@example.com",
        id: 101,
        // So, that it picks the first schedule from the list
        defaultScheduleId: null,
        organizationId: org.id,
        // Has morning shift with some overlap with morning shift
        schedules: [TestData.schedules.IstWorkHours],
      });

      const scenario = await createBookingScenario(
        getScenarioData(
          {
            eventTypes: [
              {
                id: 1,
                slotInterval: 45,
                length: 45,
                userId: 101,
              },
            ],
            organizer,
          },
          { id: org.id }
        )
      );

      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });

      const getScheduleRes = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeSlug: scenario.eventTypes[0]?.slug,
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
          orgSlug: "acme",
          usernameList: [organizer.username],
        },
      });

      expect(getScheduleRes).toHaveTimeSlots(
        [
          `04:00:00.000Z`,
          `04:45:00.000Z`,
          `05:30:00.000Z`,
          `06:15:00.000Z`,
          `07:00:00.000Z`,
          `07:45:00.000Z`,
          `08:30:00.000Z`,
          `09:15:00.000Z`,
          `10:00:00.000Z`,
          `10:45:00.000Z`,
          `11:30:00.000Z`,
        ],
        { dateString: plus2DateString }
      );
    });
  });

  describe("Round robin event", async () => {
    test("correctly get slots for event with round robin hosts chosen schedule (non-default)", async () => {
      vi.setSystemTime("2024-05-21T00:00:13Z");

      const plus1DateString = "2024-05-22";
      const plus2DateString = "2024-05-23";

      // An event with no common schedule and hosts chosen schedule (non-default schedule)
      await createBookingScenario({
        eventTypes: [
          {
            id: 1,
            slotInterval: 60,
            length: 60,
            hosts: [
              {
                userId: 101,
                isFixed: false,
                scheduleId: 2,
              },
              {
                userId: 102,
                isFixed: false,
                scheduleId: 3,
              },
            ],
            schedulingType: "ROUND_ROBIN",
            schedule: null,
          },
        ],
        users: [
          {
            ...TestData.users.example,
            email: "example@example.com",
            id: 101,
            schedules: [TestData.schedules.IstMorningShift, TestData.schedules.IstEveningShift],
            defaultScheduleId: 1,
          },
          {
            ...TestData.users.example,
            email: "example1@example.com",
            id: 102,
            schedules: [TestData.schedules.IstEveningShift, TestData.schedules.IstMorningShift],
            defaultScheduleId: 4,
          },
        ],
        bookings: [],
      });

      const scheduleWithHostChoosenSch = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: true,
          teamMemberEmail: "test@test.com",
        },
      });

      // expect only slots of IstEveningShift , as this is the chosen schedule for hosts
      expect(scheduleWithHostChoosenSch).toHaveTimeSlots(
        [`11:30:00.000Z`, `12:30:00.000Z`, `13:30:00.000Z`, `14:30:00.000Z`, `15:30:00.000Z`],
        {
          dateString: plus2DateString,
        }
      );
    });
    test("correctly get slots for event with common schedule", async () => {
      vi.setSystemTime("2024-05-21T00:00:13Z");

      const plus1DateString = "2024-05-22";
      const plus2DateString = "2024-05-23";

      // An event with common schedule
      await createBookingScenario({
        eventTypes: [
          {
            id: 1,
            slotInterval: 60,
            length: 60,
            hosts: [
              {
                userId: 101,
                isFixed: false,
              },
              {
                userId: 102,
                isFixed: false,
              },
            ],
            schedule: TestData.schedules.IstEveningShift,
            schedulingType: "ROUND_ROBIN",
          },
        ],
        users: [
          {
            ...TestData.users.example,
            email: "example@example.com",
            id: 101,
            schedules: [TestData.schedules.IstMorningShift],
            defaultScheduleId: 1,
          },
          {
            ...TestData.users.example,
            email: "example1@example.com",
            id: 102,
            schedules: [TestData.schedules.IstMidShift],
            defaultScheduleId: 2,
          },
        ],
        bookings: [],
      });

      const scheduleWithEventCommonSch = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: true,
          teamMemberEmail: "test@test.com",
        },
      });

      // expect only slots of IstEveningShift , as this is the common schedule of event
      expect(scheduleWithEventCommonSch).toHaveTimeSlots(
        [`11:30:00.000Z`, `12:30:00.000Z`, `13:30:00.000Z`, `14:30:00.000Z`, `15:30:00.000Z`],
        {
          dateString: plus2DateString,
        }
      );
    });

    test("Reschedule: should show timeslots of the same host if rescheduleWithSameRoundRobinHost is true", async () => {
      vi.setSystemTime("2024-05-21T00:00:13Z");

      const plus1DateString = "2024-05-22";
      const plus2DateString = "2024-05-23";

      // An event with common schedule
      await createBookingScenario({
        eventTypes: [
          {
            id: 1,
            slotInterval: 60,
            length: 60,
            rescheduleWithSameRoundRobinHost: true,
            hosts: [
              {
                userId: 101,
                isFixed: false,
              },
              {
                userId: 102,
                isFixed: false,
              },
            ],
            schedulingType: "ROUND_ROBIN",
          },
        ],
        users: [
          {
            ...TestData.users.example,
            email: "example@example.com",
            id: 101,
            schedules: [TestData.schedules.IstEveningShift],
            defaultScheduleId: 1,
          },
          {
            ...TestData.users.example,
            email: "example1@example.com",
            id: 102,
            schedules: [TestData.schedules.IstMorningShift],
            defaultScheduleId: 2,
          },
        ],
        bookings: [
          {
            uid: "BOOKING_TO_RESCHEDULE_UID",
            userId: 101,
            attendees: [
              {
                email: "IntegrationTestUser102@example.com",
              },
            ],
            eventTypeId: 1,
            status: "ACCEPTED",
            startTime: `${plus2DateString}T04:00:00.000Z`,
            endTime: `${plus2DateString}T04:15:00.000Z`,
          },
        ],
      });

      const schedule = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: true,
          rescheduleUid: "BOOKING_TO_RESCHEDULE_UID",
        },
      });

      // With EE removal, rescheduleWithSameRoundRobinHost no longer filters to same host - all hosts' slots shown
      expect(schedule).toHaveTimeSlots(
        [
          `04:30:00.000Z`,
          `05:30:00.000Z`,
          `06:30:00.000Z`,
          `07:30:00.000Z`,
          `08:30:00.000Z`,
          `09:30:00.000Z`,
          `10:30:00.000Z`,
          `11:30:00.000Z`,
          `12:30:00.000Z`,
          `13:30:00.000Z`,
          `14:30:00.000Z`,
          `15:30:00.000Z`,
        ],
        {
          dateString: plus2DateString,
        }
      );
    });

    test("Reschedule: should show timeslots as per routedTeamMemberIds(instead of same host) even if rescheduleWithSameRoundRobinHost is true but it is a rerouting scenario", async () => {
      vi.setSystemTime("2024-05-21T00:00:13Z");

      const plus1DateString = "2024-05-22";
      const plus2DateString = "2024-05-23";

      // An event with common schedule
      await createBookingScenario({
        eventTypes: [
          {
            id: 1,
            slotInterval: 60,
            length: 60,
            rescheduleWithSameRoundRobinHost: true,
            hosts: [
              {
                userId: 101,
                isFixed: false,
              },
              {
                userId: 102,
                isFixed: false,
              },
            ],
            schedulingType: "ROUND_ROBIN",
          },
        ],
        users: [
          {
            ...TestData.users.example,
            email: "example@example.com",
            id: 101,
            schedules: [TestData.schedules.IstEveningShift],
            defaultScheduleId: 1,
          },
          {
            ...TestData.users.example,
            email: "example1@example.com",
            id: 102,
            schedules: [TestData.schedules.IstMorningShift],
            defaultScheduleId: 2,
          },
        ],
        bookings: [
          {
            uid: "BOOKING_TO_RESCHEDULE_UID",
            userId: 101,
            attendees: [
              {
                email: "IntegrationTestUser102@example.com",
              },
            ],
            eventTypeId: 1,
            status: "ACCEPTED",
            startTime: `${plus2DateString}T04:00:00.000Z`,
            endTime: `${plus2DateString}T04:15:00.000Z`,
          },
        ],
      });

      const schedule = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: true,
          rescheduleUid: "BOOKING_TO_RESCHEDULE_UID",
          routedTeamMemberIds: [102],
        },
      });

      // expect only slots of IstEveningShift as this is the slots for the original host of the booking
      expect(schedule).toHaveTimeSlots(
        expectedSlotsForSchedule.IstMorningShift.interval["1hr"].allPossibleSlotsStartingAt430,
        {
          dateString: plus2DateString,
        }
      );
    });
  });

  describe("Empty working hours - early return optimization", () => {
    test("returns no slots when workingHours is empty", async () => {
      vi.setSystemTime("2024-05-21T00:00:13Z");

      const plus1DateString = "2024-05-22";
      const plus2DateString = "2024-05-23";

      await createBookingScenario({
        eventTypes: [
          {
            id: 1,
            slotInterval: 60,
            length: 60,
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [TestData.schedules.EmptyAvailability],
          },
        ],
        bookings: [],
      });

      const schedule = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      expect(schedule).toHaveDateDisabled({
        dateString: plus2DateString,
      });
    });

    test("returns slots only for date override when workingHours is empty but date override exists", async () => {
      vi.setSystemTime("2024-05-21T00:00:13Z");

      const plus1DateString = "2024-05-22";
      const plus2DateString = "2024-05-23";

      await createBookingScenario({
        eventTypes: [
          {
            id: 1,
            slotInterval: 60,
            length: 60,
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [
              {
                name: "Empty schedule with date override",
                availability: [
                  {
                    days: [],
                    startTime: new Date("1970-01-01T09:00:00.000Z"),
                    endTime: new Date("1970-01-01T12:00:00.000Z"),
                    date: plus2DateString,
                  },
                ],
                timeZone: Timezones["+5:30"],
              },
            ],
          },
        ],
        bookings: [],
      });

      const schedule = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus2DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      expect(schedule).toHaveTimeSlots([`03:30:00.000Z`, `04:30:00.000Z`, `05:30:00.000Z`], {
        dateString: plus2DateString,
      });
    });

    test("returns slots only for date overrides when workingHours is empty but multiple date overrides exist", async () => {
      vi.setSystemTime("2024-05-21T00:00:13Z");

      const plus1DateString = "2024-05-22";
      const plus2DateString = "2024-05-23";
      const plus3DateString = "2024-05-24";

      await createBookingScenario({
        eventTypes: [
          {
            id: 1,
            slotInterval: 60,
            length: 60,
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [
              {
                name: "Empty schedule with multiple date overrides",
                availability: [
                  {
                    days: [],
                    startTime: new Date("1970-01-01T09:00:00.000Z"),
                    endTime: new Date("1970-01-01T11:00:00.000Z"),
                    date: plus2DateString,
                  },
                  {
                    days: [],
                    startTime: new Date("1970-01-01T14:00:00.000Z"),
                    endTime: new Date("1970-01-01T16:00:00.000Z"),
                    date: plus3DateString,
                  },
                ],
                timeZone: Timezones["+5:30"],
              },
            ],
          },
        ],
        bookings: [],
      });

      const schedule = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus3DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      expect(schedule).toHaveTimeSlots([`03:30:00.000Z`, `04:30:00.000Z`], {
        dateString: plus2DateString,
      });

      expect(schedule).toHaveTimeSlots([`08:30:00.000Z`, `09:30:00.000Z`], {
        dateString: plus3DateString,
      });
    });

    test("returns no slots for dates without date override when workingHours is empty", async () => {
      vi.setSystemTime("2024-05-21T00:00:13Z");

      const plus1DateString = "2024-05-22";
      const plus2DateString = "2024-05-23";
      const plus3DateString = "2024-05-24";

      await createBookingScenario({
        eventTypes: [
          {
            id: 1,
            slotInterval: 60,
            length: 60,
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        users: [
          {
            ...TestData.users.example,
            id: 101,
            schedules: [
              {
                name: "Empty schedule with date override only on plus3",
                availability: [
                  {
                    days: [],
                    startTime: new Date("1970-01-01T09:00:00.000Z"),
                    endTime: new Date("1970-01-01T12:00:00.000Z"),
                    date: plus3DateString,
                  },
                ],
                timeZone: Timezones["+5:30"],
              },
            ],
          },
        ],
        bookings: [],
      });

      const schedule = await availableSlotsService.getAvailableSlots({
        input: {
          eventTypeId: 1,
          eventTypeSlug: "",
          startTime: `${plus1DateString}T18:30:00.000Z`,
          endTime: `${plus3DateString}T18:29:59.999Z`,
          timeZone: Timezones["+5:30"],
          isTeamEvent: false,
          orgSlug: null,
        },
      });

      expect(schedule).toHaveDateDisabled({
        dateString: plus2DateString,
      });

      expect(schedule).toHaveTimeSlots([`03:30:00.000Z`, `04:30:00.000Z`, `05:30:00.000Z`], {
        dateString: plus3DateString,
      });
    });
  });
});
