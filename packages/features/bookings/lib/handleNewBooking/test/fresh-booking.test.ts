/**
 * These tests are integration tests that test the flow from receiving a api/book/event request and then verifying
 * - database entries created in In-MEMORY DB using prismock
 * - emails sent by checking the testEmails global variable
 * - webhooks fired by mocking fetch
 * - APIs of various apps called by mocking those apps' modules
 *
 * They don't intend to test what the apps logic should do, but rather test if the apps are called with the correct data. For testing that, once should write tests within each app.
 */
import prismaMock from "@calcom/testing/lib/__mocks__/prisma";
import {
  BookingLocations,
  createBookingScenario,
  getAppleCalendarCredential,
  getBooker,
  getDate,
  getGoogleCalendarCredential,
  getGoogleMeetCredential,
  getOrganizer,
  getScenarioData,
  getStripeAppCredential,
  getZoomAppCredential,
  MockError,
  mockCalendar,
  mockCalendarToCrashOnCreateEvent,
  mockCalendarToHaveNoBusySlots,
  mockErrorOnVideoMeetingCreation,
  mockPaymentApp,
  mockSuccessfulVideoMeetingCreation,
  mockVideoAppToCrashOnCreateMeeting,
  TestData,
} from "@calcom/testing/lib/bookingScenario/bookingScenario";
import process from "node:process";
import { appStoreMetadata } from "@calcom/app-store/appStoreMetaData";
import { createWatchlistEntry } from "@calcom/features/watchlist/lib/testUtils";
import { WEBAPP_URL, WEBSITE_URL } from "@calcom/lib/constants";
import { ErrorCode } from "@calcom/lib/errorCodes";
import type { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { resetTestEmails } from "@calcom/lib/testEmails";
import { distributedTracing } from "@calcom/lib/tracing/factory";
import { BookingStatus, CreationSource, SchedulingType, WatchlistType } from "@calcom/prisma/enums";
import {
  expectAwaitingPaymentEmails,
  expectBookingCreatedWebhookToHaveBeenFired,
  expectBookingPaymentIntiatedWebhookToHaveBeenFired,
  expectBookingRequestedEmails,
  expectBookingRequestedWebhookToHaveBeenFired,
  expectBookingToBeInDatabase,
  expectBookingTrackingToBeInDatabase,
  expectBrokenIntegrationEmails,
  expectICalUIDAsString,
  expectSuccessfulBookingCreationEmails,
  expectSuccessfulCalendarEventCreationInCalendar,
} from "@calcom/testing/lib/bookingScenario/expects";
import { getMockRequestDataForBooking } from "@calcom/testing/lib/bookingScenario/getMockRequestDataForBooking";
import { setupAndTeardown } from "@calcom/testing/lib/bookingScenario/setupAndTeardown";
import { testWithAndWithoutOrg } from "@calcom/testing/lib/bookingScenario/test";
import { test } from "@calcom/testing/lib/fixtures/fixtures";
import type { Request, Response } from "express";
import type { NextApiRequest, NextApiResponse } from "next";
import { describe, expect } from "vitest";
import type Stripe from "stripe";
import { getNewBookingHandler } from "./getNewBookingHandler";

const log = logger.getSubLogger({ prefix: ["[fresh-booking.test]"] });

async function mockPaymentSuccessWebhookFromStripe({ externalId }: { externalId: string }) {
  const { handlePaymentSuccess } = await import("@calcom/app-store/_utils/payments/handlePaymentSuccess");
  let webhookResponse = null;
  try {
    // Look up the payment by externalId (simulating what the old Stripe webhook handler did)
    const payment = await prismaMock.payment.findFirst({
      where: { externalId },
      select: { id: true, bookingId: true },
    });
    if (!payment) {
      throw new Error(`Payment not found for externalId: ${externalId}`);
    }
    const traceContext = distributedTracing.createTrace("test_stripe_webhook");
    await handlePaymentSuccess({
      paymentId: payment.id,
      bookingId: payment.bookingId,
      appSlug: "stripe",
      traceContext,
    });
  } catch (e) {
    log.silly("mockPaymentSuccessWebhookFromStripe:catch", JSON.stringify(e));
    webhookResponse = e as HttpError;
  }
  return { webhookResponse };
}

export type CustomNextApiRequest = NextApiRequest & Request;

export type CustomNextApiResponse = NextApiResponse & Response;
// Local test runs sometime gets too slow
const timeout = process.env.CI ? 5000 : 20000;

describe("handleNewBooking", () => {
  setupAndTeardown();

  describe("Fresh/New Booking:", () => {
    testWithAndWithoutOrg(
      `should create a successful booking with Cal Video(Daily Video) if no explicit location is provided
          1. Should create a booking in the database
          2. Should send emails to the booker as well as organizer
          3. Should create a booking in the event's destination calendar
          4. Should trigger BOOKING_CREATED webhook
    `,
      async ({ emails, org }) => {
        const handleNewBooking = getNewBookingHandler();
        const booker = getBooker({
          email: "booker@example.com",
          name: "Booker",
        });

        const organizerOtherEmail = "organizer2@example.com";
        const organizerDestinationCalendarEmailOnEventType = "organizerEventTypeEmail@example.com";

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
          credentials: [getGoogleCalendarCredential()],
          selectedCalendars: [TestData.selectedCalendars.google],
          destinationCalendar: {
            integration: "google_calendar",
            externalId: "organizer@google-calendar.com",
            primaryEmail: organizerOtherEmail,
          },
        });

        await createBookingScenario(
          getScenarioData(
            {
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
                  slotInterval: 30,
                  length: 30,
                  useEventTypeDestinationCalendarEmail: true,
                  users: [
                    {
                      id: 101,
                    },
                  ],
                  destinationCalendar: {
                    integration: "google_calendar",
                    externalId: "event-type-1@google-calendar.com",
                    primaryEmail: organizerDestinationCalendarEmailOnEventType,
                  },
                },
              ],
              organizer,
              apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
            },
            org?.organization
              ? {
                  ...org.organization,
                  profileUsername: "username-in-org",
                }
              : null
          )
        );

        const orgProfiles = await prismaMock.profile.findMany({
          where: {
            organizationId: org?.organization.id ?? undefined,
          },
        });
        const orgProfile = orgProfiles[0];

        mockSuccessfulVideoMeetingCreation({
          metadataLookupKey: "dailyvideo",
          videoMeetingData: {
            id: "MOCK_ID",
            password: "MOCK_PASS",
            url: `http://mock-dailyvideo.example.com/meeting-1`,
          },
        });

        const calendarMock = await mockCalendarToHaveNoBusySlots("googlecalendar", {
          create: {
            id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID",
          },
        });

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            user: orgProfile ? orgProfile.username : organizer.username,
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
          },
        });

        const createdBooking = await handleNewBooking({
          bookingData: mockBookingData,
        });

        expect(createdBooking.responses).toEqual(
          expect.objectContaining({
            email: booker.email,
            name: booker.name,
          })
        );

        expect(createdBooking).toEqual(
          expect.objectContaining({
            location: BookingLocations.CalVideo,
          })
        );

        await expectBookingToBeInDatabase({
          description: "",
          uid: createdBooking.uid!,
          eventTypeId: mockBookingData.eventTypeId,
          status: BookingStatus.ACCEPTED,
          references: [
            {
              type: appStoreMetadata.dailyvideo.type,
              uid: "MOCK_ID",
              meetingId: "MOCK_ID",
              meetingPassword: "MOCK_PASS",
              meetingUrl: "http://mock-dailyvideo.example.com/meeting-1",
            },
            {
              type: appStoreMetadata.googlecalendar.type,
              uid: "MOCKED_GOOGLE_CALENDAR_EVENT_ID",
              meetingId: "MOCKED_GOOGLE_CALENDAR_EVENT_ID",
              meetingPassword: "MOCK_PASSWORD",
            },
          ],
          iCalUID: createdBooking.iCalUID,
        });

        expectSuccessfulCalendarEventCreationInCalendar(calendarMock, {
          calendarId: "event-type-1@google-calendar.com",
          videoCallUrl: "http://mock-dailyvideo.example.com/meeting-1",
        });

        const iCalUID = expectICalUIDAsString(createdBooking.iCalUID);

        expectSuccessfulBookingCreationEmails({
          booking: {
            uid: createdBooking.uid!,
            urlOrigin: WEBAPP_URL,
          },
          booker,
          organizer,
          emails,
          iCalUID,
          destinationEmail: organizerDestinationCalendarEmailOnEventType,
        });

        expectBookingCreatedWebhookToHaveBeenFired({
          booker,
          organizer: {
            ...organizer,
            ...(orgProfile?.username ? { usernameInOrg: orgProfile?.username } : null),
          },
          location: BookingLocations.CalVideo,
          subscriberUrl: "http://my-webhook.example.com",
          videoCallUrl: `${WEBAPP_URL}/video/${createdBooking.uid}`,
        });
      },
      timeout
    );

    describe("Calendar events should be created in the appropriate calendar", () => {
      test(
        `should create a successful booking in the first connected calendar i.e. using the first credential(in the scenario when there is no event-type or organizer destination calendar)
          1. Should create a booking in the database
          2. Should send emails to the booker as well as organizer
          3. Should fallback to creating the booking in the first connected Calendar when neither event nor organizer has a destination calendar - This doesn't practically happen because organizer is always required to have a schedule set
          3. Should trigger BOOKING_CREATED webhook
    `,

        async ({ emails }) => {
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
              apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
            })
          );

          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "dailyvideo",
            videoMeetingData: {
              id: "MOCK_ID",
              password: "MOCK_PASS",
              url: `http://mock-dailyvideo.example.com/meeting-1`,
            },
          });

          // Mock a Scenario where iCalUID isn't returned by Google Calendar in which case booking UID is used as the ics UID
          const calendarMock = await mockCalendarToHaveNoBusySlots("googlecalendar", {
            create: {
              id: "GOOGLE_CALENDAR_EVENT_ID",
              uid: "MOCK_ID",
            },
          });

          const mockBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
            },
          });

          const createdBooking = await handleNewBooking({
            bookingData: mockBookingData,
          });
          expect(createdBooking.responses).toEqual(
            expect.objectContaining({
              email: booker.email,
              name: booker.name,
            })
          );

          expect(createdBooking).toEqual(
            expect.objectContaining({
              location: BookingLocations.CalVideo,
            })
          );

          await expectBookingToBeInDatabase({
            description: "",

            uid: createdBooking.uid!,
            eventTypeId: mockBookingData.eventTypeId,
            status: BookingStatus.ACCEPTED,
            references: [
              {
                type: appStoreMetadata.dailyvideo.type,
                uid: "MOCK_ID",
                meetingId: "MOCK_ID",
                meetingPassword: "MOCK_PASS",
                meetingUrl: "http://mock-dailyvideo.example.com/meeting-1",
              },
              {
                type: appStoreMetadata.googlecalendar.type,
                uid: "GOOGLE_CALENDAR_EVENT_ID",
                meetingId: "GOOGLE_CALENDAR_EVENT_ID",
                meetingPassword: "MOCK_PASSWORD",
              },
            ],
            iCalUID: createdBooking.iCalUID,
          });

          expectSuccessfulCalendarEventCreationInCalendar(calendarMock, {
            videoCallUrl: "http://mock-dailyvideo.example.com/meeting-1",
            // We won't be sending evt.destinationCalendar in this case.
            // Google Calendar in this case fallbacks to the "primary" calendar - https://github.com/calcom/cal.diy/blob/7d5dad7fea78ff24dddbe44f1da5d7e08e1ff568/packages/app-store/googlecalendar/lib/CalendarService.ts#L217
            // Not sure if it's the correct behaviour. Right now, it isn't possible to have an organizer with connected calendar but no destination calendar - As soon as the Google Calendar app is installed, a destination calendar is created.
            calendarId: null,
          });

          const iCalUID = expectICalUIDAsString(createdBooking.iCalUID);

          expectSuccessfulBookingCreationEmails({
            booking: {
              uid: createdBooking.uid!,
            },
            booker,
            organizer,
            emails,
            iCalUID,
          });
          expectBookingCreatedWebhookToHaveBeenFired({
            booker,
            organizer,
            location: BookingLocations.CalVideo,
            subscriberUrl: "http://my-webhook.example.com",
            videoCallUrl: `${WEBAPP_URL}/video/${createdBooking.uid}`,
          });
        },
        timeout
      );

      test(
        `should create a successful booking in the organizer calendar(in the scenario when event type doesn't have destination calendar)
          1. Should create a booking in the database
          2. Should send emails to the booker as well as organizer
          3. Should fallback to create a booking in the Organizer Calendar if event doesn't have destination calendar
          3. Should trigger BOOKING_CREATED webhook
    `,

        async ({ emails }) => {
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
            destinationCalendar: {
              integration: "google_calendar",
              externalId: "organizer@google-calendar.com",
            },
          });
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
              apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
            })
          );

          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "dailyvideo",
            videoMeetingData: {
              id: "MOCK_ID",
              password: "MOCK_PASS",
              url: `http://mock-dailyvideo.example.com/meeting-1`,
            },
          });

          const calendarMock = await mockCalendarToHaveNoBusySlots("googlecalendar", {
            create: {
              uid: "MOCK_ID",
              id: "GOOGLE_CALENDAR_EVENT_ID",
            },
          });

          const mockBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
            },
          });

          const createdBooking = await handleNewBooking({
            bookingData: mockBookingData,
          });
          expect(createdBooking.responses).toEqual(
            expect.objectContaining({
              email: booker.email,
              name: booker.name,
            })
          );

          expect(createdBooking).toEqual(
            expect.objectContaining({
              location: BookingLocations.CalVideo,
            })
          );

          await expectBookingToBeInDatabase({
            description: "",

            uid: createdBooking.uid!,
            eventTypeId: mockBookingData.eventTypeId,
            status: BookingStatus.ACCEPTED,
            references: [
              {
                type: appStoreMetadata.dailyvideo.type,
                uid: "MOCK_ID",
                meetingId: "MOCK_ID",
                meetingPassword: "MOCK_PASS",
                meetingUrl: "http://mock-dailyvideo.example.com/meeting-1",
              },
              {
                type: appStoreMetadata.googlecalendar.type,
                uid: "GOOGLE_CALENDAR_EVENT_ID",
                meetingId: "GOOGLE_CALENDAR_EVENT_ID",
                meetingPassword: "MOCK_PASSWORD",
              },
            ],
            iCalUID: createdBooking.iCalUID,
          });

          expectSuccessfulCalendarEventCreationInCalendar(calendarMock, {
            calendarId: "organizer@google-calendar.com",
            videoCallUrl: "http://mock-dailyvideo.example.com/meeting-1",
          });

          const iCalUID = expectICalUIDAsString(createdBooking.iCalUID);

          expectSuccessfulBookingCreationEmails({
            booking: {
              uid: createdBooking.uid!,
            },
            booker,
            organizer,
            emails,
            iCalUID,
          });

          expectBookingCreatedWebhookToHaveBeenFired({
            booker,
            organizer,
            location: BookingLocations.CalVideo,
            subscriberUrl: "http://my-webhook.example.com",
            videoCallUrl: `${WEBAPP_URL}/video/${createdBooking.uid}`,
          });
        },
        timeout
      );

      test(
        `an error in creating a calendar event should not stop the booking creation and should still send the booking emails`,

        async ({ emails }) => {
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
            destinationCalendar: {
              integration: "google_calendar",
              externalId: "organizer@google-calendar.com",
            },
          });
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
              apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
            })
          );

          const _calendarMock = mockCalendarToCrashOnCreateEvent("googlecalendar");

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
          });
          expect(createdBooking.responses).toEqual(
            expect.objectContaining({
              email: booker.email,
              name: booker.name,
            })
          );

          expect(createdBooking).toEqual(
            expect.objectContaining({
              location: "New York",
            })
          );

          await expectBookingToBeInDatabase({
            description: "",

            uid: createdBooking.uid!,
            eventTypeId: mockBookingData.eventTypeId,
            status: BookingStatus.ACCEPTED,
            references: [
              {
                type: appStoreMetadata.googlecalendar.type,
                // A reference is still created in case of event creation failure, with nullish values. Not sure what's the purpose for this.
                uid: "",
                meetingId: null,
                meetingPassword: null,
                meetingUrl: null,
              },
            ],
          });

          const iCalUID = expectICalUIDAsString(createdBooking.iCalUID);

          expectSuccessfulBookingCreationEmails({
            booking: {
              uid: createdBooking.uid!,
            },
            booker,
            organizer,
            emails,
            iCalUID,
          });

          // FIXME: We should send Broken Integration emails on calendar event creation failure
          // expectCalendarEventCreationFailureEmails({ booker, organizer, emails });

          expectBookingCreatedWebhookToHaveBeenFired({
            booker,
            organizer,
            location: "New York",
            subscriberUrl: "http://my-webhook.example.com",
          });
        },
        timeout
      );

      test(
        "If destination calendar has no credential ID due to some reason, it should create the event in first connected calendar instead",

        async ({ emails }) => {
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
            destinationCalendar: {
              integration: "google_calendar",
              externalId: "organizer@google-calendar.com",
            },
          });

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
              apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
            })
          );

          // await prismaMock.destinationCalendar.update({
          //   where: {
          //     userId: organizer.id,
          //   },
          //   data: {
          //     credentialId: null,
          //   },
          // });
          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "dailyvideo",
            videoMeetingData: {
              id: "MOCK_ID",
              password: "MOCK_PASS",
              url: `http://mock-dailyvideo.example.com/meeting-1`,
            },
          });

          const calendarMock = await mockCalendarToHaveNoBusySlots("googlecalendar", {
            create: {
              uid: "MOCK_ID",
              id: "GOOGLE_CALENDAR_EVENT_ID",
            },
          });

          const mockBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
            },
          });

          const createdBooking = await handleNewBooking({
            bookingData: mockBookingData,
          });

          expect(createdBooking.responses).toEqual(
            expect.objectContaining({
              email: booker.email,
              name: booker.name,
            })
          );

          expect(createdBooking).toEqual(
            expect.objectContaining({
              location: BookingLocations.CalVideo,
            })
          );

          await expectBookingToBeInDatabase({
            description: "",

            uid: createdBooking.uid!,
            eventTypeId: mockBookingData.eventTypeId,
            status: BookingStatus.ACCEPTED,
            references: [
              {
                type: appStoreMetadata.dailyvideo.type,
                uid: "MOCK_ID",
                meetingId: "MOCK_ID",
                meetingPassword: "MOCK_PASS",
                meetingUrl: "http://mock-dailyvideo.example.com/meeting-1",
              },
              {
                type: appStoreMetadata.googlecalendar.type,
                uid: "GOOGLE_CALENDAR_EVENT_ID",
                meetingId: "GOOGLE_CALENDAR_EVENT_ID",
                meetingPassword: "MOCK_PASSWORD",
              },
            ],
            iCalUID: createdBooking.iCalUID,
          });


          expectSuccessfulCalendarEventCreationInCalendar(calendarMock, {
            calendarId: "organizer@google-calendar.com",
            videoCallUrl: "http://mock-dailyvideo.example.com/meeting-1",
          });

          const iCalUID = expectICalUIDAsString(createdBooking.iCalUID);

          expectSuccessfulBookingCreationEmails({
            booking: {
              uid: createdBooking.uid!,
            },
            booker,
            organizer,
            emails,
            iCalUID,
          });

          expectBookingCreatedWebhookToHaveBeenFired({
            booker,
            organizer,
            location: BookingLocations.CalVideo,
            subscriberUrl: "http://my-webhook.example.com",
            videoCallUrl: `${WEBAPP_URL}/video/${createdBooking.uid}`,
          });
        },
        timeout
      );

      test(
        "If destination calendar is there for Google Calendar but there are no Google Calendar credentials but there is an Apple Calendar credential connected, it should create the event in Apple Calendar",

        async ({ emails }) => {
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
            credentials: [getAppleCalendarCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
            destinationCalendar: {
              integration: "google_calendar",
              externalId: "organizer@google-calendar.com",
            },
          });

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
              apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
            })
          );

          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "dailyvideo",
            videoMeetingData: {
              id: "MOCK_ID",
              password: "MOCK_PASS",
              url: `http://mock-dailyvideo.example.com/meeting-1`,
            },
          });

          const calendarMock = await mockCalendarToHaveNoBusySlots("applecalendar", {
            create: {
              uid: "MOCK_ID",
              id: "MOCKED_APPLE_CALENDAR_EVENT_ID",
              iCalUID: "MOCKED_APPLE_CALENDAR_ICS_ID",
            },
          });

          const mockBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
            },
          });

          const createdBooking = await handleNewBooking({
            bookingData: mockBookingData,
          });

          expect(createdBooking.responses).toEqual(
            expect.objectContaining({
              email: booker.email,
              name: booker.name,
            })
          );

          expect(createdBooking).toEqual(
            expect.objectContaining({
              location: BookingLocations.CalVideo,
            })
          );

          await expectBookingToBeInDatabase({
            description: "",

            uid: createdBooking.uid!,
            eventTypeId: mockBookingData.eventTypeId,
            status: BookingStatus.ACCEPTED,
            references: [
              {
                type: appStoreMetadata.dailyvideo.type,
                uid: "MOCK_ID",
                meetingId: "MOCK_ID",
                meetingPassword: "MOCK_PASS",
                meetingUrl: "http://mock-dailyvideo.example.com/meeting-1",
              },
              {
                type: appStoreMetadata.applecalendar.type,
                uid: "MOCKED_APPLE_CALENDAR_EVENT_ID",
                meetingId: "MOCKED_APPLE_CALENDAR_EVENT_ID",
                meetingPassword: "MOCK_PASSWORD",
              },
            ],
          });

          expectSuccessfulCalendarEventCreationInCalendar(calendarMock, {
            calendarId: "organizer@google-calendar.com",
            videoCallUrl: "http://mock-dailyvideo.example.com/meeting-1",
          });

          expectSuccessfulBookingCreationEmails({
            booking: {
              uid: createdBooking.uid!,
            },
            booker,
            organizer,
            emails,
            iCalUID: "MOCKED_APPLE_CALENDAR_ICS_ID",
          });

          expectBookingCreatedWebhookToHaveBeenFired({
            booker,
            organizer,
            location: BookingLocations.CalVideo,
            subscriberUrl: "http://my-webhook.example.com",
            videoCallUrl: `${WEBAPP_URL}/video/${createdBooking.uid}`,
          });
        },
        timeout
      );
    });

    describe("Event's first location should be used when location is unspecied", () => {
      test(
        `should create a successful booking with right location app when event has location option as video client`,

        async ({ emails }) => {
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
            credentials: [getZoomAppCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
          });

          const mockBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
              },
            },
          });

          const scenarioData = getScenarioData({
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
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                locations: [
                  {
                    type: BookingLocations.ZoomVideo,
                  },
                ],
              },
            ],
            organizer,
            apps: [TestData.apps.zoomvideo],
          });
          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "zoomvideo",
          });
          await createBookingScenario(scenarioData);
          const createdBooking = await handleNewBooking({
            bookingData: mockBookingData,
          });
          expect(createdBooking).toEqual(
            expect.objectContaining({
              location: BookingLocations.ZoomVideo,
            })
          );
          const iCalUID = expectICalUIDAsString(createdBooking.iCalUID);
          expectSuccessfulBookingCreationEmails({
            booking: {
              uid: createdBooking.uid!,
            },
            booker,
            organizer,
            emails,
            iCalUID,
          });
          expectBookingCreatedWebhookToHaveBeenFired({
            booker,
            organizer,
            location: BookingLocations.ZoomVideo,
            subscriberUrl: "http://my-webhook.example.com",
            videoCallUrl: "http://mock-zoomvideo.example.com",
          });
        },
        timeout
      );
      test(
        `should create a successful booking with right location when event's location is not a conferencing app
        `,
        //test with inPerson event type

        async ({ emails }) => {
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
            credentials: [],
            selectedCalendars: [TestData.selectedCalendars.google],
          });

          const mockedBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
              },
            },
          });

          const scenarioData = getScenarioData({
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
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                locations: [{ type: "inPerson", address: "Seoul" }],
              },
            ],
            organizer,
            apps: [TestData.apps["daily-video"]],
          });
          await createBookingScenario(scenarioData);
          const createdBooking = await handleNewBooking({
            bookingData: mockedBookingData,
          });
          expect(createdBooking).toEqual(
            expect.objectContaining({
              location: "Seoul",
            })
          );
          const iCalUID = expectICalUIDAsString(createdBooking.iCalUID);
          expectSuccessfulBookingCreationEmails({
            booking: {
              uid: createdBooking.uid!,
            },
            booker,
            organizer,
            emails,
            iCalUID,
          });
          expectBookingCreatedWebhookToHaveBeenFired({
            booker,
            organizer,
            location: "Seoul",
            subscriberUrl: "http://my-webhook.example.com",
          });
        },
        timeout
      );
      test(
        `should create a successful booking with organizer default conferencing app when event's location is not set`,

        async ({ emails }) => {
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
            credentials: [getZoomAppCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
            metadata: {
              defaultConferencingApp: {
                appSlug: "zoom",
              },
            },
          });

          const mockedBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
              },
            },
          });

          const scenarioData = getScenarioData({
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
            apps: [TestData.apps.zoomvideo, TestData.apps["daily-video"]],
          });
          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "zoomvideo",
          });
          await createBookingScenario(scenarioData);
          const createdBooking = await handleNewBooking({
            bookingData: mockedBookingData,
          });
          expect(createdBooking).toEqual(
            expect.objectContaining({
              location: BookingLocations.ZoomVideo,
            })
          );
          const iCalUID = expectICalUIDAsString(createdBooking.iCalUID);
          expectSuccessfulBookingCreationEmails({
            booking: {
              uid: createdBooking.uid!,
            },
            booker,
            organizer,
            emails,
            iCalUID,
          });
          expectBookingCreatedWebhookToHaveBeenFired({
            booker,
            organizer,
            location: BookingLocations.ZoomVideo,
            subscriberUrl: "http://my-webhook.example.com",
            videoCallUrl: "http://mock-zoomvideo.example.com",
          });
        },
        timeout
      );

      test(
        `should fallback to Cal Video when organizer's default conferencing app is Google Meet but destination calendar is NOT Google Calendar`,
        async ({ emails }) => {
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
            credentials: [getGoogleMeetCredential()],
            selectedCalendars: [TestData.selectedCalendars.office365],
            destinationCalendar: {
              integration: "office365_calendar",
              externalId: "organizer@outlook.com",
            },
            metadata: {
              defaultConferencingApp: {
                appSlug: "google-meet",
              },
            },
          });

          const scenarioData = getScenarioData({
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
            apps: [
              TestData.apps["google-meet"],
              TestData.apps["daily-video"],
              TestData.apps["office365-calendar"],
            ],
          });

          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "dailyvideo",
            videoMeetingData: {
              id: "MOCK_ID",
              password: "MOCK_PASS",
              url: "http://mock-dailyvideo.example.com/meeting-1",
            },
          });

          await createBookingScenario(scenarioData);

          const mockedBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
              },
            },
          });

          const createdBooking = await handleNewBooking({
            bookingData: mockedBookingData,
          });

          // Should fallback to Cal Video instead of Google Meet
          expect(createdBooking).toEqual(
            expect.objectContaining({
              location: BookingLocations.CalVideo,
            })
          );
        },
        timeout
      );

      test(
        `should use Google Meet when organizer's default conferencing app is Google Meet and destination calendar IS Google Calendar`,
        async ({ emails }) => {
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
            credentials: [getGoogleCalendarCredential(), getGoogleMeetCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
            destinationCalendar: {
              integration: "google_calendar",
              externalId: "organizer@google-calendar.com",
            },
            metadata: {
              defaultConferencingApp: {
                appSlug: "google-meet",
              },
            },
          });

          const scenarioData = getScenarioData({
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
            apps: [
              TestData.apps["google-calendar"],
              TestData.apps["google-meet"],
              TestData.apps["daily-video"],
            ],
          });

          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "googlevideo",
          });

          await mockCalendarToHaveNoBusySlots("googlecalendar", {
            create: {
              id: "GOOGLE_CALENDAR_EVENT_ID",
              uid: "MOCK_ID",
              appSpecificData: {
                googleCalendar: {
                  hangoutLink: "https://meet.google.com/test-meeting",
                },
              },
            },
          });

          await createBookingScenario(scenarioData);

          const mockedBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
              },
            },
          });

          const createdBooking = await handleNewBooking({
            bookingData: mockedBookingData,
          });

          // Should use Google Meet since Google Calendar is the destination calendar
          expect(createdBooking).toEqual(
            expect.objectContaining({
              location: BookingLocations.GoogleMeet,
            })
          );
        },
        timeout
      );
    });

    describe("Video Meeting Creation", () => {
      test(
        `should create a successful booking with Zoom if used`,

        async ({ emails }) => {
          const handleNewBooking = getNewBookingHandler();
          const subscriberUrl = "http://my-webhook.example.com";
          const booker = getBooker({
            email: "booker@example.com",
            name: "Booker",
          });

          const organizer = getOrganizer({
            name: "Organizer",
            email: "organizer@example.com",
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
            credentials: [getZoomAppCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
          });
          await createBookingScenario(
            getScenarioData({
              organizer,
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
              apps: [TestData.apps.zoomvideo],
              webhooks: [
                {
                  userId: organizer.id,
                  eventTriggers: ["BOOKING_CREATED"],
                  subscriberUrl,
                  active: true,
                  eventTypeId: 1,
                  appId: null,
                },
              ],
            })
          );
          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "zoomvideo",
          });

          const mockedBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.ZoomVideo },
              },
            },
          });

          const createdBooking = await handleNewBooking({
            bookingData: mockedBookingData,
          });

          const iCalUID = expectICalUIDAsString(createdBooking.iCalUID);

          expectSuccessfulBookingCreationEmails({
            booking: {
              uid: createdBooking.uid!,
            },
            booker,
            organizer,
            emails,
            iCalUID,
          });

          expectBookingCreatedWebhookToHaveBeenFired({
            booker,
            organizer,
            location: BookingLocations.ZoomVideo,
            subscriberUrl,
            videoCallUrl: "http://mock-zoomvideo.example.com",
          });
        },
        timeout
      );

      test(
        `Booking should still be created using calvideo, if error occurs with zoom`,

        async ({ emails }) => {
          const handleNewBooking = getNewBookingHandler();
          const subscriberUrl = "http://my-webhook.example.com";
          const booker = getBooker({
            email: "booker@example.com",
            name: "Booker",
          });

          const organizer = getOrganizer({
            name: "Organizer",
            email: "organizer@example.com",
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
            credentials: [getZoomAppCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
          });
          await createBookingScenario(
            getScenarioData({
              organizer,
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
              apps: [TestData.apps.zoomvideo, TestData.apps["daily-video"]],
              webhooks: [
                {
                  userId: organizer.id,
                  eventTriggers: ["BOOKING_CREATED"],
                  subscriberUrl,
                  active: true,
                  eventTypeId: 1,
                  appId: null,
                },
              ],
            })
          );

          mockVideoAppToCrashOnCreateMeeting({
            metadataLookupKey: "zoomvideo",
          });

          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "dailyvideo",
            videoMeetingData: {
              id: "MOCK_ID",
              password: "MOCK_PASS",
              url: `http://mock-dailyvideo.example.com/meeting-1`,
            },
          });

          const mockedBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.ZoomVideo },
              },
            },
          });

          const createdBooking = await handleNewBooking({
            bookingData: mockedBookingData,
          });

          expect(createdBooking).toEqual(
            expect.objectContaining({
              location: BookingLocations.CalVideo,
            })
          );
          expectBrokenIntegrationEmails({ organizer, emails });
          expectBookingCreatedWebhookToHaveBeenFired({
            booker,
            organizer,
            location: BookingLocations.CalVideo,
            subscriberUrl,
            videoCallUrl: `${WEBAPP_URL}/video/${createdBooking.uid}`,
          });
        },
        timeout
      );
    });

    describe("Event length check during booking", () => {
      test(
        `should fail if the time difference between a booking's start and end times is not equal to the event length.`,
        async () => {
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

          const mockedBookingData = getMockRequestDataForBooking({
            data: {
              start: `${getDate({ dateIncrement: 1 }).dateString}T05:00:00.000Z`,
              end: `${getDate({ dateIncrement: 1 }).dateString}T05:15:00.000Z`,
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: "New York" },
              },
            },
          });

          await expect(
            async () =>
              await handleNewBooking({
                bookingData: mockedBookingData,
              })
          ).rejects.toThrowError("Invalid event length");
        },
        timeout
      );
    });

    describe("UTM tracking tests", () => {
      test(
        "should create a booking with UTM tracking",
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        async ({ emails }) => {
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
            credentials: [getZoomAppCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
          });

          const tracking = {
            utm_source: "source test",
            utm_medium: "medium test",
            utm_campaign: "campaign test",
            utm_term: "term test",
            utm_content: "content test",
          };

          const mockedBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
              },
              tracking,
            },
          });

          const scenarioData = getScenarioData({
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
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                locations: [
                  {
                    type: BookingLocations.ZoomVideo,
                  },
                ],
              },
            ],
            organizer,
            apps: [TestData.apps.zoomvideo],
          });

          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "zoomvideo",
          });
          await createBookingScenario(scenarioData);
          const createdBooking = await handleNewBooking({
            bookingData: mockedBookingData,
          });

          expectBookingTrackingToBeInDatabase(tracking, createdBooking.uid!);
        },
        timeout
      );
    });

    describe("Creation source tests", () => {
      test(
        `should create a booking with creation source as WEBAPP`,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        async ({ emails }) => {
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
            credentials: [getZoomAppCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
          });

          const mockedBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
              },
              creationSource: CreationSource.WEBAPP,
            },
          });

          const scenarioData = getScenarioData({
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
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                locations: [
                  {
                    type: BookingLocations.ZoomVideo,
                  },
                ],
              },
            ],
            organizer,
            apps: [TestData.apps.zoomvideo],
          });

          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "zoomvideo",
          });
          await createBookingScenario(scenarioData);
          const createdBooking = await handleNewBooking({
            bookingData: mockedBookingData,
          });
          expect(createdBooking).toEqual(
            expect.objectContaining({
              creationSource: CreationSource.WEBAPP,
            })
          );
        },
        timeout
      );
    });

    describe(
      "Availability Check during booking",
      () => {
        test(
          `should fail a booking if there is already a Cal.diy booking overlapping the time`,
          async () => {
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
              // credentials: [getGoogleCalendarCredential()],
              // selectedCalendars: [TestData.selectedCalendars.google],
            });

            const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
            const uidOfOverlappingBooking = "harWv3eHgconAED2j4gcVhP";
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
                bookings: [
                  {
                    uid: uidOfOverlappingBooking,
                    eventTypeId: 1,
                    userId: 101,
                    status: BookingStatus.ACCEPTED,
                    startTime: `${plus1DateString}T05:00:00.000Z`,
                    endTime: `${plus1DateString}T05:30:00.000Z`,
                  },
                ],
                organizer,
              })
            );

            const mockBookingData = getMockRequestDataForBooking({
              data: {
                start: `${getDate({ dateIncrement: 1 }).dateString}T05:00:00.000Z`,
                end: `${getDate({ dateIncrement: 1 }).dateString}T05:30:00.000Z`,
                eventTypeId: 1,
                responses: {
                  email: booker.email,
                  name: booker.name,
                  location: { optionValue: "", value: "New York" },
                },
              },
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
          `should fail a booking if there is already a booking in the organizer's selectedCalendars(Single Calendar) with the overlapping time`,
          async () => {
            const handleNewBooking = getNewBookingHandler();
            const organizerId = 101;
            const booker = getBooker({
              email: "booker@example.com",
              name: "Booker",
            });

            const organizer = getOrganizer({
              name: "Organizer",
              email: "organizer@example.com",
              id: organizerId,
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

            mockCalendar("googlecalendar", {
              create: {
                uid: "MOCK_ID",
                iCalUID: "MOCKED_GOOGLE_CALENDAR_ICS_ID",
              },
              busySlots: [
                {
                  start: `${plus1DateString}T05:00:00.000Z`,
                  end: `${plus1DateString}T05:15:00.000Z`,
                },
              ],
            });

            const mockBookingData = getMockRequestDataForBooking({
              data: {
                start: `${getDate({ dateIncrement: 1 }).dateString}T05:00:00.000Z`,
                end: `${getDate({ dateIncrement: 1 }).dateString}T05:30:00.000Z`,
                eventTypeId: 1,
                responses: {
                  email: booker.email,
                  name: booker.name,
                  location: { optionValue: "", value: "New York" },
                },
              },
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
          `should allow a booking even if there is already a booking in the organizer's selectedCalendars(Single Calendar) with the overlapping time but useEventLevelSelectedCalendars is false and SelectedCalendar is for an event`,
          async () => {
            const handleNewBooking = getNewBookingHandler();
            const organizerId = 101;
            const eventTypeId = 1;
            const useEventLevelSelectedCalendars = false;
            const booker = getBooker({
              email: "booker@example.com",
              name: "Booker",
            });

            const organizer = getOrganizer({
              name: "Organizer",
              email: "organizer@example.com",
              id: organizerId,
              schedules: [TestData.schedules.IstWorkHours],
              credentials: [getGoogleCalendarCredential()],
              selectedCalendars: [{ ...TestData.selectedCalendars.google, eventTypeId }],
            });

            const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

            await createBookingScenario(
              getScenarioData({
                eventTypes: [
                  {
                    id: eventTypeId,
                    slotInterval: 30,
                    length: 30,
                    useEventLevelSelectedCalendars,
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

            const _calendarMock = mockCalendar("googlecalendar", {
              create: {
                uid: "MOCK_ID",
                iCalUID: "MOCKED_GOOGLE_CALENDAR_ICS_ID",
              },
              busySlots: [
                {
                  start: `${plus1DateString}T05:00:00.000Z`,
                  end: `${plus1DateString}T05:15:00.000Z`,
                },
              ],
            });

            const mockBookingData = getMockRequestDataForBooking({
              data: {
                start: `${getDate({ dateIncrement: 1 }).dateString}T05:00:00.000Z`,
                end: `${getDate({ dateIncrement: 1 }).dateString}T05:30:00.000Z`,
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
            });
            expectBookingToBeInDatabase({
              description: "",

              uid: createdBooking.uid!,
              eventTypeId: mockBookingData.eventTypeId,
              status: BookingStatus.ACCEPTED,
            });
          },
          timeout
        );

        describe("Event level selected calendars - useEventLevelSelectedCalendars:true", () => {
          test(
            `should fail a booking if there is already a booking in the organizer's selectedCalendars(Single Calendar) with the overlapping time as chosen in the event type`,
            async () => {
              const handleNewBooking = getNewBookingHandler();

              const organizerId = 101;
              const eventTypeId = 1;
              const useEventLevelSelectedCalendars = true;
              const booker = getBooker({
                email: "booker@example.com",
                name: "Booker",
              });

              const organizer = getOrganizer({
                name: "Organizer",
                email: "organizer@example.com",
                id: organizerId,
                schedules: [TestData.schedules.IstWorkHours],
                credentials: [getGoogleCalendarCredential()],
                selectedCalendars: [{ ...TestData.selectedCalendars.google, eventTypeId }],
              });

              const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

              await createBookingScenario(
                getScenarioData({
                  eventTypes: [
                    {
                      id: eventTypeId,
                      slotInterval: 30,
                      length: 30,
                      useEventLevelSelectedCalendars,
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

              const _calendarMock = mockCalendar("googlecalendar", {
                create: {
                  uid: "MOCK_ID",
                  iCalUID: "MOCKED_GOOGLE_CALENDAR_ICS_ID",
                },
                busySlots: [
                  {
                    start: `${plus1DateString}T05:00:00.000Z`,
                    end: `${plus1DateString}T05:15:00.000Z`,
                  },
                ],
              });

              const mockBookingData = getMockRequestDataForBooking({
                data: {
                  start: `${getDate({ dateIncrement: 1 }).dateString}T05:00:00.000Z`,
                  end: `${getDate({ dateIncrement: 1 }).dateString}T05:30:00.000Z`,
                  eventTypeId: 1,
                  responses: {
                    email: booker.email,
                    name: booker.name,
                    location: { optionValue: "", value: "New York" },
                  },
                },
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
            `should allow a booking even if there is already a booking in the organizer's selectedCalendars(Single Calendar) with the overlapping time and useEventLevelSelectedCalendars is true but the selectedCalendar is of different eventType`,
            async () => {
              const handleNewBooking = getNewBookingHandler();

              const organizerId = 101;
              const eventTypeId = 1;
              const anotherEventTypeId = 2;

              const useEventLevelSelectedCalendars = true;
              const booker = getBooker({
                email: "booker@example.com",
                name: "Booker",
              });

              const organizer = getOrganizer({
                name: "Organizer",
                email: "organizer@example.com",
                id: organizerId,
                schedules: [TestData.schedules.IstWorkHours],
                credentials: [getGoogleCalendarCredential()],
                selectedCalendars: [
                  { ...TestData.selectedCalendars.google, eventTypeId: anotherEventTypeId },
                ],
              });

              const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

              await createBookingScenario(
                getScenarioData({
                  eventTypes: [
                    {
                      id: eventTypeId,
                      slotInterval: 30,
                      length: 30,
                      useEventLevelSelectedCalendars,
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

              const _calendarMock = mockCalendar("googlecalendar", {
                create: {
                  uid: "MOCK_ID",
                  iCalUID: "MOCKED_GOOGLE_CALENDAR_ICS_ID",
                },
                busySlots: [
                  {
                    start: `${plus1DateString}T05:00:00.000Z`,
                    end: `${plus1DateString}T05:15:00.000Z`,
                  },
                ],
              });

              const mockBookingData = getMockRequestDataForBooking({
                data: {
                  start: `${getDate({ dateIncrement: 1 }).dateString}T05:00:00.000Z`,
                  end: `${getDate({ dateIncrement: 1 }).dateString}T05:30:00.000Z`,
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
              });
              expectBookingToBeInDatabase({
                description: "",

                uid: createdBooking.uid!,
                eventTypeId: mockBookingData.eventTypeId,
                status: BookingStatus.ACCEPTED,
              });
            },
            timeout
          );
        });
      },
      timeout
    );

    describe("Event Type that requires confirmation", () => {
      test(
        `should create a booking request for event that requires confirmation
            1. Should create a booking in the database with status PENDING
            2. Should send emails to the booker as well as organizer for booking request and awaiting approval
            3. Should trigger BOOKING_REQUESTED webhook
    `,

        async ({ emails }) => {
          const handleNewBooking = getNewBookingHandler();
          const subscriberUrl = "http://my-webhook.example.com";
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
          const scenarioData = getScenarioData({
            webhooks: [
              {
                userId: organizer.id,
                eventTriggers: ["BOOKING_CREATED"],
                subscriberUrl,
                active: true,
                eventTypeId: 1,
                appId: null,
              },
            ],
            eventTypes: [
              {
                id: 1,
                slotInterval: 30,
                requiresConfirmation: true,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
              },
            ],
            organizer,
            apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
          });
          await createBookingScenario(scenarioData);

          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "dailyvideo",
          });

          mockCalendarToHaveNoBusySlots("googlecalendar", {
            create: {
              iCalUID: "MOCKED_GOOGLE_CALENDAR_ICS_ID",
            },
          });

          const mockBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
            },
          });

          const createdBooking = await handleNewBooking({
            bookingData: mockBookingData,
          });

          expect(createdBooking.responses).toEqual(
            expect.objectContaining({
              email: booker.email,
              name: booker.name,
            })
          );

          expect(createdBooking).toEqual(
            expect.objectContaining({
              location: BookingLocations.CalVideo,
            })
          );

          await expectBookingToBeInDatabase({
            description: "",

            uid: createdBooking.uid!,
            eventTypeId: mockBookingData.eventTypeId,
            status: BookingStatus.PENDING,
          });

          expectBookingRequestedEmails({
            booker,
            organizer,
            emails,
          });

          expectBookingRequestedWebhookToHaveBeenFired({
            booker,
            organizer,
            location: BookingLocations.CalVideo,
            subscriberUrl,
            eventType: scenarioData.eventTypes[0],
          });
        },
        timeout
      );

      /**
       * NOTE: We might want to think about making the bookings get ACCEPTED automatically if the booker is the organizer of the event-type. This is a design decision it seems for now.
       */
      test(
        `should make a fresh booking in PENDING state even when the booker is the organizer of the event-type
        1. Should create a booking in the database with status PENDING
        2. Should send emails to the booker as well as organizer for booking request and awaiting approval
        3. Should trigger BOOKING_REQUESTED webhook
    `,

        async ({ emails }) => {
          const handleNewBooking = getNewBookingHandler();
          const subscriberUrl = "http://my-webhook.example.com";
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
          const scenarioData = getScenarioData({
            webhooks: [
              {
                userId: organizer.id,
                eventTriggers: ["BOOKING_CREATED"],
                subscriberUrl,
                active: true,
                eventTypeId: 1,
                appId: null,
              },
            ],
            eventTypes: [
              {
                id: 1,
                slotInterval: 30,
                requiresConfirmation: true,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
              },
            ],
            organizer,
            apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
          });
          await createBookingScenario(scenarioData);

          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "dailyvideo",
          });

          mockCalendarToHaveNoBusySlots("googlecalendar", {
            create: {
              iCalUID: "MOCKED_GOOGLE_CALENDAR_ICS_ID",
            },
          });

          const mockBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
            },
          });

          const createdBooking = await handleNewBooking({
            bookingData: mockBookingData,
            userId: organizer.id,
          });

          await expectBookingToBeInDatabase({
            description: "",

            uid: createdBooking.uid!,
            eventTypeId: mockBookingData.eventTypeId,
            status: BookingStatus.PENDING,
            location: BookingLocations.CalVideo,
            responses: expect.objectContaining({
              email: booker.email,
              name: booker.name,
            }),
          });

          expectBookingRequestedEmails({
            booker,
            organizer,
            emails,
          });

          expectBookingRequestedWebhookToHaveBeenFired({
            booker,
            organizer,
            location: BookingLocations.CalVideo,
            subscriberUrl,
            eventType: scenarioData.eventTypes[0],
          });
        },
        timeout
      );

      test(
        `should create a booking for event that requires confirmation based on a booking notice duration threshold, if threshold is not met
            1. Should create a booking in the database with status ACCEPTED
            2. Should send emails to the booker as well as organizer
            3. Should trigger BOOKING_CREATED webhook
    `,

        async ({ emails }) => {
          const handleNewBooking = getNewBookingHandler();
          const booker = getBooker({
            email: "booker@example.com",
            name: "Booker",
          });
          const subscriberUrl = "http://my-webhook.example.com";

          const organizer = getOrganizer({
            name: "Organizer",
            email: "organizer@example.com",
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
            credentials: [getGoogleCalendarCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
          });

          await createBookingScenario(
            getScenarioData({
              webhooks: [
                {
                  userId: organizer.id,
                  eventTriggers: ["BOOKING_CREATED"],
                  subscriberUrl,
                  active: true,
                  eventTypeId: 1,
                  appId: null,
                },
              ],
              eventTypes: [
                {
                  id: 1,
                  slotInterval: 30,
                  requiresConfirmation: true,
                  metadata: {
                    requiresConfirmationThreshold: {
                      time: 30,
                      unit: "minutes",
                    },
                  },
                  length: 30,
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

          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "dailyvideo",
          });

          mockCalendarToHaveNoBusySlots("googlecalendar", {});

          const mockBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
            },
          });

          const createdBooking = await handleNewBooking({
            bookingData: mockBookingData,
          });
          expect(createdBooking.responses).toEqual(
            expect.objectContaining({
              email: booker.email,
              name: booker.name,
            })
          );

          expect(createdBooking).toEqual(
            expect.objectContaining({
              location: BookingLocations.CalVideo,
            })
          );

          await expectBookingToBeInDatabase({
            description: "",

            uid: createdBooking.uid!,
            eventTypeId: mockBookingData.eventTypeId,
            status: BookingStatus.ACCEPTED,
            iCalUID: createdBooking.iCalUID,
          });

          const iCalUID = expectICalUIDAsString(createdBooking.iCalUID);

          expectSuccessfulBookingCreationEmails({
            booking: {
              uid: createdBooking.uid!,
            },
            booker,
            organizer,
            emails,
            iCalUID,
          });

          expectBookingCreatedWebhookToHaveBeenFired({
            booker,
            organizer,
            location: BookingLocations.CalVideo,
            subscriberUrl,
            videoCallUrl: `${WEBAPP_URL}/video/${createdBooking.uid}`,
          });
        },
        timeout
      );

      test(
        `should create a booking for event that requires confirmation based on a booking notice duration threshold, if threshold IS MET
            1. Should create a booking in the database with status PENDING
            2. Should send emails to the booker as well as organizer for booking request and awaiting approval
            3. Should trigger BOOKING_REQUESTED webhook
    `,

        async ({ emails }) => {
          const handleNewBooking = getNewBookingHandler();
          const subscriberUrl = "http://my-webhook.example.com";
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
          const scenarioData = getScenarioData({
            webhooks: [
              {
                userId: organizer.id,
                eventTriggers: ["BOOKING_CREATED"],
                subscriberUrl,
                active: true,
                eventTypeId: 1,
                appId: null,
              },
            ],
            eventTypes: [
              {
                id: 1,
                slotInterval: 30,
                requiresConfirmation: true,
                metadata: {
                  requiresConfirmationThreshold: {
                    time: 120,
                    unit: "hours",
                  },
                },
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
              },
            ],
            organizer,
            apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
          });

          await createBookingScenario(scenarioData);

          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "dailyvideo",
          });

          mockCalendarToHaveNoBusySlots("googlecalendar", {});

          const mockBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
            },
          });

          const createdBooking = await handleNewBooking({
            bookingData: mockBookingData,
          });
          expect(createdBooking.responses).toEqual(
            expect.objectContaining({
              email: booker.email,
              name: booker.name,
            })
          );

          expect(createdBooking).toEqual(
            expect.objectContaining({
              location: BookingLocations.CalVideo,
            })
          );

          await expectBookingToBeInDatabase({
            description: "",

            uid: createdBooking.uid!,
            eventTypeId: mockBookingData.eventTypeId,
            status: BookingStatus.PENDING,
            iCalUID: createdBooking.iCalUID,
          });

          expectBookingRequestedEmails({ booker, organizer, emails });

          expectBookingRequestedWebhookToHaveBeenFired({
            booker,
            organizer,
            location: BookingLocations.CalVideo,
            subscriberUrl,
            eventType: scenarioData.eventTypes[0],
          });
        },
        timeout
      );
    });

    // FIXME: We shouldn't throw error here, the behaviour should be fixed.
    test(
      `if booking with Cal Video(Daily Video) fails, booking creation fails with uncaught error`,
      async () => {
        const handleNewBooking = getNewBookingHandler();
        const booker = getBooker({
          email: "booker@example.org",
          name: "Booker",
        });
        const organizer = TestData.users.example;

        await createBookingScenario({
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
          users: [
            {
              ...organizer,
              id: 101,
              schedules: [TestData.schedules.IstWorkHours],
              credentials: [getGoogleCalendarCredential()],
              selectedCalendars: [TestData.selectedCalendars.google],
            },
          ],
          apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
        });

        mockErrorOnVideoMeetingCreation({
          metadataLookupKey: "dailyvideo",
        });

        mockCalendarToHaveNoBusySlots("googlecalendar");

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
          },
        });

        try {
          await handleNewBooking({
            bookingData: mockBookingData,
          });
        } catch (e) {
          expect(e).toBeInstanceOf(MockError);
          expect((e as { message: string }).message).toBe("Error creating Video meeting");
        }
      },
      timeout
    );

    test(
      `should create a successful booking when location is provided as label of an option(Done for Organizer Address)
      1. Should create a booking in the database
      2. Should send emails to the booker as well as organizer
      3. Should trigger BOOKING_CREATED webhook
    `,

      async ({ emails }) => {
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

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            user: organizer.username,
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: "New York" },
            },
          },
        });

        const scenarioData = getScenarioData({
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
          apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
        });

        mockCalendarToHaveNoBusySlots("googlecalendar", {});
        await createBookingScenario(scenarioData);

        const createdBooking = await handleNewBooking({
          bookingData: mockBookingData,
        });
        expect(createdBooking.responses).toEqual(
          expect.objectContaining({
            email: booker.email,
            name: booker.name,
          })
        );

        expect(createdBooking).toEqual(
          expect.objectContaining({
            location: "New York",
          })
        );

        await expectBookingToBeInDatabase({
          description: "",

          uid: createdBooking.uid!,
          eventTypeId: mockBookingData.eventTypeId,
          status: BookingStatus.ACCEPTED,
          iCalUID: createdBooking.iCalUID,
        });

        const iCalUID = expectICalUIDAsString(createdBooking.iCalUID);

        expectSuccessfulBookingCreationEmails({
          booking: {
            uid: createdBooking.uid!,
          },
          booker,
          organizer,
          emails,
          iCalUID,
        });
        expectBookingCreatedWebhookToHaveBeenFired({
          booker,
          organizer,
          location: "New York",
          subscriberUrl: "http://my-webhook.example.com",
        });
      },
      timeout
    );

    describe("Paid Events", () => {
      test(
        `Event Type that doesn't require confirmation
            1. Should create a booking in the database with status PENDING
            2. Should send email to the booker for Payment request
            3. Should trigger BOOKING_PAYMENT_INITIATED webhook
            5. Once payment is successful, should trigger BOOKING_CREATED webhook
      `,

        async ({ emails }) => {
          const handleNewBooking = getNewBookingHandler();
          const booker = getBooker({
            email: "booker@example.com",
            name: "Booker",
          });          const organizer = getOrganizer({
            name: "Organizer",
            email: "organizer@example.com",
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
            credentials: [getGoogleCalendarCredential(), getStripeAppCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
          });
          const scenarioData = getScenarioData({
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
                title: "Paid Event",
                description: "It's a test Paid Event",
                slotInterval: 30,
                requiresConfirmation: false,
                metadata: {
                  apps: {
                    // EventType is connected to stripe.
                    stripe: {
                      price: 100,
                      enabled: true,
                      currency: "inr" /*, credentialId: 57*/,
                    },
                  },
                },
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
              },
            ],
            organizer,
            apps: [
              TestData.apps["google-calendar"],
              TestData.apps["daily-video"],
              TestData.apps["stripe-payment"],
            ],
          });
          await createBookingScenario(scenarioData);
          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "dailyvideo",
          });
          const { paymentUid, externalId } = mockPaymentApp({
            metadataLookupKey: "stripe",
            appStoreLookupKey: "stripepayment",
          });
          mockCalendarToHaveNoBusySlots("googlecalendar");
          const mockBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
            },
          });

          const createdBooking = await handleNewBooking({
            bookingData: mockBookingData,
          });

          expect(createdBooking).toEqual(
            expect.objectContaining({
              location: BookingLocations.CalVideo,
              paymentUid: paymentUid,
            })
          );

          await expectBookingToBeInDatabase({
            description: "",
            location: BookingLocations.CalVideo,

            uid: createdBooking.uid!,
            eventTypeId: mockBookingData.eventTypeId,
            status: BookingStatus.PENDING,
            responses: expect.objectContaining({
              email: booker.email,
              name: booker.name,
            }),
          });

          expectAwaitingPaymentEmails({ organizer, booker, emails });

          expectBookingPaymentIntiatedWebhookToHaveBeenFired({
            booker,
            organizer,
            location: BookingLocations.CalVideo,
            subscriberUrl: "http://my-webhook.example.com",

            paymentId: createdBooking.paymentId!,
          });

          const { webhookResponse } = await mockPaymentSuccessWebhookFromStripe({ externalId });

          expect(webhookResponse?.statusCode).toBe(200);
          await expectBookingToBeInDatabase({
            description: "",

            uid: createdBooking.uid!,
            eventTypeId: mockBookingData.eventTypeId,
            status: BookingStatus.ACCEPTED,
          });

          expectBookingCreatedWebhookToHaveBeenFired({
            booker,
            organizer,
            location: BookingLocations.CalVideo,
            subscriberUrl: "http://my-webhook.example.com",
            videoCallUrl: `${WEBAPP_URL}/video/${createdBooking.uid}`,
            paidEvent: true,
          });
        },
        timeout
      );
      // TODO: We should introduce a new state BOOKING.PAYMENT_PENDING that can clearly differentiate b/w pending confirmation(stuck on Organizer) and pending payment(stuck on booker)
      test(
        `Event Type that requires confirmation
            1. Should create a booking in the database with status PENDING
            2. Should send email to the booker for Payment request
            3. Should trigger BOOKING_PAYMENT_INITIATED webhook
            5. Once payment is successful, should trigger BOOKING_REQUESTED webhook
            7. Booking should still stay in pending state
      `,

        async ({ emails }) => {          const handleNewBooking = getNewBookingHandler();
          const subscriberUrl = "http://my-webhook.example.com";
          const booker = getBooker({
            email: "booker@example.com",
            name: "Booker",
          });

          const organizer = getOrganizer({
            name: "Organizer",
            email: "organizer@example.com",
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
            credentials: [getGoogleCalendarCredential(), getStripeAppCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
          });

          const scenarioData = getScenarioData({
            webhooks: [
              {
                userId: organizer.id,
                eventTriggers: ["BOOKING_CREATED"],
                subscriberUrl,
                active: true,
                eventTypeId: 1,
                appId: null,
              },
            ],
            eventTypes: [
              {
                id: 1,
                slotInterval: 30,
                requiresConfirmation: true,
                metadata: {
                  apps: {
                    stripe: {
                      price: 100,
                      enabled: true,
                      currency: "inr" /*, credentialId: 57*/,
                    },
                  },
                },
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
              },
            ],
            organizer,
            apps: [
              TestData.apps["google-calendar"],
              TestData.apps["daily-video"],
              TestData.apps["stripe-payment"],
            ],
          });
          await createBookingScenario(scenarioData);
          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "dailyvideo",
          });
          const { paymentUid, externalId } = mockPaymentApp({
            metadataLookupKey: "stripe",
            appStoreLookupKey: "stripepayment",
          });
          mockCalendarToHaveNoBusySlots("googlecalendar");

          const mockBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
            },
          });
          const createdBooking = await handleNewBooking({
            bookingData: mockBookingData,
          });

          expect(createdBooking.responses).toEqual(
            expect.objectContaining({
              email: booker.email,
              name: booker.name,
            })
          );
          expect(createdBooking).toEqual(
            expect.objectContaining({
              location: BookingLocations.CalVideo,
              paymentUid: paymentUid,
            })
          );
          await expectBookingToBeInDatabase({
            description: "",

            uid: createdBooking.uid!,
            eventTypeId: mockBookingData.eventTypeId,
            status: BookingStatus.PENDING,
          });

          expectAwaitingPaymentEmails({
            organizer,
            booker,
            emails,
            subject: "complete_your_booking_subject",
          });
          expectBookingPaymentIntiatedWebhookToHaveBeenFired({
            booker,
            organizer,
            location: BookingLocations.CalVideo,
            subscriberUrl: "http://my-webhook.example.com",

            paymentId: createdBooking.paymentId!,
          });
          // FIXME: Right now we need to reset the test Emails because email expects only tests first email content for an email address
          // Reset Test Emails to test for more Emails
          resetTestEmails();
          const { webhookResponse } = await mockPaymentSuccessWebhookFromStripe({ externalId });

          expect(webhookResponse?.statusCode).toBe(200);
          await expectBookingToBeInDatabase({
            description: "",

            uid: createdBooking.uid!,
            eventTypeId: mockBookingData.eventTypeId,
            status: BookingStatus.PENDING,
          });

          expectBookingRequestedEmails({
            booker,
            organizer,
            emails,
          });
          expectBookingRequestedWebhookToHaveBeenFired({
            booker,
            organizer,
            location: BookingLocations.CalVideo,
            subscriberUrl,
            paidEvent: true,
            eventType: scenarioData.eventTypes[0],
          });
        },
        timeout
      );
      test(
        `cannot book same slot multiple times `,

        async ({ emails }) => {
          const handleNewBooking = getNewBookingHandler();
          const booker = getBooker({
            email: "booker@example.com",
            name: "Booker",
          });

          const organizerOtherEmail = "organizer2@example.com";
          const organizerDestinationCalendarEmailOnEventType = "organizerEventTypeEmail@example.com";

          const organizer = getOrganizer({
            name: "Organizer",
            email: "organizer@example.com",
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
            credentials: [getGoogleCalendarCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
            destinationCalendar: {
              integration: "google_calendar",
              externalId: "organizer@google-calendar.com",
              primaryEmail: organizerOtherEmail,
            },
          });

          await createBookingScenario(
            getScenarioData({
              eventTypes: [
                {
                  id: 1,
                  slotInterval: 30,
                  length: 30,
                  useEventTypeDestinationCalendarEmail: true,
                  users: [
                    {
                      id: 101,
                    },
                  ],
                  destinationCalendar: {
                    integration: "google_calendar",
                    externalId: "event-type-1@google-calendar.com",
                    primaryEmail: organizerDestinationCalendarEmailOnEventType,
                  },
                },
              ],
              organizer,
              apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
            })
          );

          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "dailyvideo",
            videoMeetingData: {
              id: "MOCK_ID",
              password: "MOCK_PASS",
              url: `http://mock-dailyvideo.example.com/meeting-1`,
            },
          });

          const calendarMock = await mockCalendarToHaveNoBusySlots("googlecalendar", {
            create: {
              id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID",
            },
          });

          const mockBookingData = getMockRequestDataForBooking({
            data: {
              user: organizer.username,
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
            },
          });

          const createdBooking = await handleNewBooking({
            bookingData: mockBookingData,
          });

          expect(createdBooking.responses).toEqual(
            expect.objectContaining({
              email: booker.email,
              name: booker.name,
            })
          );

          expect(createdBooking).toEqual(
            expect.objectContaining({
              location: BookingLocations.CalVideo,
            })
          );

          await expectBookingToBeInDatabase({
            description: "",

            uid: createdBooking.uid!,
            eventTypeId: mockBookingData.eventTypeId,
            status: BookingStatus.ACCEPTED,
            references: [
              {
                type: appStoreMetadata.dailyvideo.type,
                uid: "MOCK_ID",
                meetingId: "MOCK_ID",
                meetingPassword: "MOCK_PASS",
                meetingUrl: "http://mock-dailyvideo.example.com/meeting-1",
              },
              {
                type: appStoreMetadata.googlecalendar.type,
                uid: "MOCKED_GOOGLE_CALENDAR_EVENT_ID",
                meetingId: "MOCKED_GOOGLE_CALENDAR_EVENT_ID",
                meetingPassword: "MOCK_PASSWORD",
              },
            ],
            iCalUID: createdBooking.iCalUID,
          });

          expectSuccessfulCalendarEventCreationInCalendar(calendarMock, {
            calendarId: "event-type-1@google-calendar.com",
            videoCallUrl: "http://mock-dailyvideo.example.com/meeting-1",
          });

          const iCalUID = expectICalUIDAsString(createdBooking.iCalUID);

          expectSuccessfulBookingCreationEmails({
            booking: {
              uid: createdBooking.uid!,
              urlOrigin: WEBAPP_URL,
            },
            booker,
            organizer,
            emails,
            iCalUID,
            destinationEmail: organizerDestinationCalendarEmailOnEventType,
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
        `Payment retry scenario - should return existing payment UID and prevent duplicate bookings when retrying canceled payment`,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        async ({ emails }) => {
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
            credentials: [getGoogleCalendarCredential(), getStripeAppCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
          });

          const scenarioData = getScenarioData({
            eventTypes: [
              {
                id: 1,
                title: "Paid Event",
                description: "It's a test Paid Event",
                slotInterval: 30,
                requiresConfirmation: false,
                metadata: {
                  apps: {
                    stripe: {
                      price: 100,
                      enabled: true,
                      currency: "usd",
                    },
                  },
                },
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
              },
            ],
            organizer,
            apps: [TestData.apps["stripe-payment"]],
          });

          await createBookingScenario(scenarioData);
          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "dailyvideo",
          });
          const { paymentUid: _paymentUid } = mockPaymentApp({
            metadataLookupKey: "stripe",
            appStoreLookupKey: "stripepayment",
          });
          mockCalendarToHaveNoBusySlots("googlecalendar");

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

          const firstBooking = await handleNewBooking({
            bookingData: mockBookingData,
          });

          expect(firstBooking).toEqual(
            expect.objectContaining({
              paymentUid: expect.any(String),
              paymentRequired: true,
              uid: expect.any(String),
            })
          );

          const firstBookingInDb = await prismaMock.booking.findUnique({
            where: { uid: firstBooking.uid },
            include: { payment: true },
          });

          expect(firstBookingInDb).toBeTruthy();
          expect(firstBookingInDb?.payment).toHaveLength(1);
          expect(firstBookingInDb?.paid).toBe(false);

          const secondBooking = await handleNewBooking({
            bookingData: mockBookingData,
          });

          expect(secondBooking.uid).toBe(firstBooking.uid);
          expect(secondBooking.paymentUid).toBe(firstBooking.paymentUid);
          expect(secondBooking.paymentRequired).toBe(true);

          const bookingsInDb = await prismaMock.booking.findMany({
            where: {
              eventTypeId: 1,
              attendees: {
                some: {
                  email: booker.email,
                },
              },
            },
            include: { payment: true },
          });

          expect(bookingsInDb).toHaveLength(1);
          expect(bookingsInDb[0].payment).toHaveLength(1);
          expect(bookingsInDb[0].uid).toBe(firstBooking.uid);
        },
        timeout
      );
    });
  });

  describe("Returning original booking", () => {
    test("Return the original booking if a request is made twice by the same attendee when a booking requires confirmation", async () => {
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

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          user: organizer.username,
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
          },
        },
      });

      const scenarioData = getScenarioData({
        eventTypes: [
          {
            id: 1,
            slotInterval: 30,
            length: 30,
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
      });

      await createBookingScenario(scenarioData);

      const response = await handleNewBooking({
        bookingData: mockBookingData,
      });

      const secondResponse = await handleNewBooking({
        bookingData: mockBookingData,
      });

      expect(secondResponse.id).toEqual(response.id);
    });
    test("Return the original booking if request is made by the same attendee for a round robin event", async () => {
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

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          user: organizer.username,
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
          },
        },
      });

      const scenarioData = getScenarioData({
        eventTypes: [
          {
            id: 1,
            slotInterval: 30,
            length: 30,
            requiresConfirmation: true,
            schedulingType: SchedulingType.ROUND_ROBIN,
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        organizer,
        apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
      });

      await createBookingScenario(scenarioData);

      const response = await handleNewBooking({
        bookingData: mockBookingData,
      });

      const secondResponse = await handleNewBooking({
        bookingData: mockBookingData,
      });

      expect(secondResponse.id).toEqual(response.id);
    });
  });

  describe("Blocked users", () => {
    test("user is locked", async () => {
      const handleNewBooking = getNewBookingHandler();
      const booker = getBooker({
        email: "booker@example.com",
        name: "Booker",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        email: "user@lockeduser.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
        locked: true,
      });

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          user: organizer.username,
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
          },
        },
      });

      const scenarioData = getScenarioData({
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
      });

      await createBookingScenario(scenarioData);

      await expect(
        async () =>
          await handleNewBooking({
            bookingData: mockBookingData,
          })
      ).rejects.toThrowError("eventTypeUser.notFound");
    });

    test("username is critical in watchlist", async () => {
      const handleNewBooking = getNewBookingHandler();
      const booker = getBooker({
        email: "booker@example.com",
        name: "Booker",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        username: "spammer",
        email: "spam@spammer.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
        locked: true,
      });

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          user: organizer.username,
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
          },
        },
      });

      const scenarioData = getScenarioData({
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
      });

      await createBookingScenario(scenarioData);

      await createWatchlistEntry({
        type: WatchlistType.USERNAME,
        value: organizer.username,
      });

      await expect(
        async () =>
          await handleNewBooking({
            bookingData: mockBookingData,
          })
      ).rejects.toThrowError("eventTypeUser.notFound");
    });

    test("domain is critical in watchlist", async () => {
      const handleNewBooking = getNewBookingHandler();
      const booker = getBooker({
        email: "booker@example.com",
        name: "Booker",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        username: "spammer",
        email: "spam@spammer.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
        locked: true,
      });

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          user: organizer.username,
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
          },
        },
      });

      const scenarioData = getScenarioData({
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
      });

      await createBookingScenario(scenarioData);

      await createWatchlistEntry({
        type: WatchlistType.DOMAIN,
        value: "spammer.com",
      });

      await expect(
        async () =>
          await handleNewBooking({
            bookingData: mockBookingData,
          })
      ).rejects.toThrowError("eventTypeUser.notFound");
    });

    test("domain is critical in watchlist", async () => {
      const handleNewBooking = getNewBookingHandler();
      const booker = getBooker({
        email: "booker@example.com",
        name: "Booker",
      });

      const organizer = getOrganizer({
        name: "Organizer",
        username: "spammer",
        email: "spam@spammer.com",
        id: 101,
        schedules: [TestData.schedules.IstWorkHours],
        credentials: [getGoogleCalendarCredential()],
        selectedCalendars: [TestData.selectedCalendars.google],
        locked: true,
      });

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          user: organizer.username,
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: "New York" },
          },
        },
      });

      const scenarioData = getScenarioData({
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
      });

      await createBookingScenario(scenarioData);

      await createWatchlistEntry({
        type: WatchlistType.EMAIL,
        value: "spam@spammer.com",
      });

      await expect(
        async () =>
          await handleNewBooking({
            bookingData: mockBookingData,
          })
      ).rejects.toThrowError("eventTypeUser.notFound");
    });
  });

  test.todo("CRM calendar events creation verification");
});
