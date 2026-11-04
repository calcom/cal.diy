import prismaMock from "@calcom/testing/lib/__mocks__/prisma";

import {
  getBooker,
  TestData,
  getOrganizer,
  createBookingScenario,
  getGoogleCalendarCredential,
  Timezones,
  getScenarioData,
  mockSuccessfulVideoMeetingCreation,
  BookingLocations,
  getDate,
  getMockBookingAttendee,
  mockCalendarToHaveNoBusySlots,
  getStripeAppCredential,
  mockPaymentApp,
} from "@calcom/testing/lib/bookingScenario/bookingScenario";
import { createMockNextJsRequest } from "@calcom/testing/lib/bookingScenario/createMockNextJsRequest";
import { getMockRequestDataForBooking } from "@calcom/testing/lib/bookingScenario/getMockRequestDataForBooking";
import { getMockRequestDataForCancelBooking } from "@calcom/testing/lib/bookingScenario/getMockRequestDataForCancelBooking";
import { setupAndTeardown } from "@calcom/testing/lib/bookingScenario/setupAndTeardown";

import { describe, test, vi, expect } from "vitest";

import { appStoreMetadata } from "@calcom/app-store/apps.metadata.generated";
import * as emailManager from "@calcom/emails/email-manager";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { SchedulingType } from "@calcom/prisma/enums";
import { BookingStatus } from "@calcom/prisma/enums";

import { getNewBookingHandler } from "../../handleNewBooking/test/getNewBookingHandler";
import * as handleSeatsModule from "../handleSeats";

describe("handleSeats", () => {
  setupAndTeardown();

  describe("Correct parameters being passed into handleSeats from handleNewBooking", () => {
    vi.mock("./handleSeats");

    test("On new booking handleSeats is not called", async () => {
      const handleNewBooking = getNewBookingHandler();
      const spy = vi.spyOn(handleSeatsModule, "default");
      spy.mockClear();

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
              seatsPerTimeSlot: 3,
            },
          ],
          organizer,
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

      await handleNewBooking({
        bookingData: mockBookingData,
      });

      expect(spy).toHaveBeenCalledTimes(1);
    });

    test("handleSeats is called when a new attendee is added", async () => {
      const spy = vi.spyOn(handleSeatsModule, "default");
      spy.mockClear();
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

      const bookingId = 1;
      const bookingUid = "abc123";
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const bookingStartTime = `${plus1DateString}T04:00:00Z`;
      const bookingEndTime = `${plus1DateString}T04:30:00Z`;
      const bookingScenario = await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slug: "seated-event",
              slotInterval: 30,
              length: 30,
              users: [
                {
                  id: 101,
                },
              ],
              seatsPerTimeSlot: 3,
              seatsShowAttendees: false,
            },
          ],
          bookings: [
            {
              id: bookingId,
              uid: bookingUid,
              eventTypeId: 1,
              status: BookingStatus.ACCEPTED,
              startTime: bookingStartTime,
              endTime: bookingEndTime,
              metadata: {
                videoCallUrl: "https://existing-daily-video-call-url.example.com",
              },
              references: [
                {
                  type: appStoreMetadata.dailyvideo.type,
                  uid: "MOCK_ID",
                  meetingId: "MOCK_ID",
                  meetingPassword: "MOCK_PASS",
                  meetingUrl: "http://mock-dailyvideo.example.com",
                  credentialId: null,
                },
              ],
            },
          ],
          organizer,
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

      const reqBookingUser = "seatedAttendee";

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: BookingLocations.CalVideo },
          },
          bookingUid: bookingUid,
          user: reqBookingUser,
        },
      });

      const { req } = createMockNextJsRequest({
        method: "POST",
        body: mockBookingData,
      });

      const createdBooking = await handleNewBooking({
        bookingData: mockBookingData,
      });

      expect(createdBooking.metadata).toHaveProperty("videoCallUrl");

      const handleSeatsCall = spy.mock.calls[0][0];

      expect(handleSeatsCall).toEqual(
        expect.objectContaining({
          bookerEmail: booker.email,
          reqBodyUser: reqBookingUser,
          tAttendees: expect.any(Function),
          additionalNotes: expect.anything(),
          noEmail: undefined,
        })
      );

      const bookingScenarioEventType = bookingScenario.eventTypes[0];
      expect(handleSeatsCall.eventTypeInfo).toEqual(
        expect.objectContaining({
          eventTitle: bookingScenarioEventType.title,
          eventDescription: bookingScenarioEventType.description,
          length: bookingScenarioEventType.length,
        })
      );

      expect(handleSeatsCall.eventType).toEqual(
        expect.objectContaining({
          id: bookingScenarioEventType.id,
          slug: bookingScenarioEventType.slug,
          seatsPerTimeSlot: bookingScenarioEventType.seatsPerTimeSlot,
          seatsShowAttendees: bookingScenarioEventType.seatsShowAttendees,
        })
      );

      expect(handleSeatsCall.evt).toEqual(
        expect.objectContaining({
          startTime: bookingStartTime,
        })
      );

      expect(handleSeatsCall.invitee).toEqual([
        expect.objectContaining({
          email: booker.email,
          name: booker.name,
        }),
      ]);
    });

    test("handleSeats is called on rescheduling a seated event", async () => {
      const spy = vi.spyOn(handleSeatsModule, "default");
      spy.mockClear();
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

      const bookingId = 1;
      const bookingUid = "abc123";
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
      const bookingStartTime = `${plus1DateString}T04:00:00Z`;
      const bookingEndTime = `${plus1DateString}T04:30:00Z`;
      const bookingScenario = await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slug: "seated-event",
              slotInterval: 30,
              length: 30,
              users: [
                {
                  id: 101,
                },
              ],
              seatsPerTimeSlot: 3,
              seatsShowAttendees: false,
            },
          ],
          bookings: [
            {
              id: bookingId,
              uid: bookingUid,
              eventTypeId: 1,
              status: BookingStatus.ACCEPTED,
              startTime: bookingStartTime,
              endTime: bookingEndTime,
              metadata: {
                videoCallUrl: "https://existing-daily-video-call-url.example.com",
              },
              references: [
                {
                  type: appStoreMetadata.dailyvideo.type,
                  uid: "MOCK_ID",
                  meetingId: "MOCK_ID",
                  meetingPassword: "MOCK_PASS",
                  meetingUrl: "http://mock-dailyvideo.example.com",
                  credentialId: null,
                },
              ],
            },
          ],
          organizer,
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

      const reqBookingUser = "seatedAttendee";

      const mockBookingData = getMockRequestDataForBooking({
        data: {
          rescheduleUid: bookingUid,
          eventTypeId: 1,
          responses: {
            email: booker.email,
            name: booker.name,
            location: { optionValue: "", value: BookingLocations.CalVideo },
          },
          bookingUid: bookingUid,
          user: reqBookingUser,
        },
      });

      await handleNewBooking({
        bookingData: mockBookingData,
      });

      const handleSeatsCall = spy.mock.calls[0][0];

      expect(handleSeatsCall).toEqual(
        expect.objectContaining({
          rescheduleUid: bookingUid,
          bookerEmail: booker.email,
          reqBodyUser: reqBookingUser,
          tAttendees: expect.any(Function),
          additionalNotes: expect.anything(),
          noEmail: undefined,
        })
      );

      const bookingScenarioEventType = bookingScenario.eventTypes[0];
      expect(handleSeatsCall.eventTypeInfo).toEqual(
        expect.objectContaining({
          eventTitle: bookingScenarioEventType.title,
          eventDescription: bookingScenarioEventType.description,
          length: bookingScenarioEventType.length,
        })
      );

      expect(handleSeatsCall.eventType).toEqual(
        expect.objectContaining({
          id: bookingScenarioEventType.id,
          slug: bookingScenarioEventType.slug,
          seatsPerTimeSlot: bookingScenarioEventType.seatsPerTimeSlot,
          seatsShowAttendees: bookingScenarioEventType.seatsShowAttendees,
        })
      );

      expect(handleSeatsCall.evt).toEqual(
        expect.objectContaining({
          startTime: bookingStartTime,
        })
      );

      expect(handleSeatsCall.invitee).toEqual([
        expect.objectContaining({
          email: booker.email,
          name: booker.name,
        }),
      ]);
    });
  });

  describe("As an attendee", () => {
    describe("Creating a new booking", () => {
      test("stores the subsequent seat's paymentUid on its BookingSeat (so the success page shows the right per-seat price)", async () => {
        const handleNewBooking = getNewBookingHandler();

        const booker = getBooker({ email: "seat2@example.com", name: "Seat 2" });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
          credentials: [getGoogleCalendarCredential(), getStripeAppCredential()],
        });

        const bookingId = 1;
        const bookingUid = "paid-seated-link";
        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slug: "paid-seated-event",
                slotInterval: 30,
                length: 30,
                users: [{ id: 101 }],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
                metadata: { apps: { stripe: { price: 100, enabled: true, currency: "usd" } } },
              },
            ],
            bookings: [
              {
                id: bookingId,
                uid: bookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: `${plus1DateString}T04:00:00Z`,
                endTime: `${plus1DateString}T04:30:00Z`,
                metadata: { videoCallUrl: "https://existing-daily-video-call-url.example.com" },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: { referenceUid: "booking-seat-1", data: {} },
                  }),
                ],
              },
            ],
            organizer,
            apps: [TestData.apps["stripe-payment"]],
            // Seat 1 already has its own payment, so the booking has more than one payment and a
            // bookingId-only lookup would be ambiguous — the new seat must link to its own payment.
            payment: [
              {
                uid: "SEAT_1_PAYMENT_UID",
                bookingId,
                amount: 100,
                fee: 0,
                currency: "usd",
                success: true,
                refunded: false,
                data: {},
                externalId: "seat_1_external_id",
                appId: "stripe",
              },
            ],
          })
        );

        mockSuccessfulVideoMeetingCreation({
          metadataLookupKey: "dailyvideo",
          videoMeetingData: { id: "MOCK_ID", password: "MOCK_PASS", url: "http://mock-dailyvideo.example.com/meeting-1" },
        });
        mockPaymentApp({ metadataLookupKey: "stripe", appStoreLookupKey: "stripepayment" });

        await handleNewBooking({
          bookingData: getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
              bookingUid,
              user: "seatedAttendee",
            },
          }),
        });

        // The new seat's payment should be linked on its BookingSeat so the success page can resolve
        // this seat's own amount instead of the first seat's.
        const newSeat = await prismaMock.bookingSeat.findFirst({
          where: { attendee: { email: booker.email } },
          select: { metadata: true },
        });
        const newSeatPaymentUid = (newSeat?.metadata as { paymentUid?: string } | null)?.paymentUid;

        // Must point to this seat's own payment, not seat 1's pre-seeded payment.
        expect(newSeatPaymentUid).toBe("MOCK_PAYMENT_UID");
        expect(newSeatPaymentUid).not.toBe("SEAT_1_PAYMENT_UID");
      });

      test("Attendee should be added to existing seated event", async () => {
        const handleNewBooking = getNewBookingHandler();

        const booker = getBooker({
          email: "seat2@example.com",
          name: "Seat 2",
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const bookingId = 1;
        const bookingUid = "abc123";
        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const bookingStartTime = `${plus1DateString}T04:00:00Z`;
        const bookingEndTime = `${plus1DateString}T04:30:00Z`;
        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slug: "seated-event",
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: bookingId,
                uid: bookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: bookingStartTime,
                endTime: bookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
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

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            bookingUid: bookingUid,
            user: reqBookingUser,
          },
        });

        await handleNewBooking({
          bookingData: mockBookingData,
        });

        const newAttendee = await prismaMock.attendee.findFirst({
          where: {
            email: booker.email,
            bookingId: bookingId,
          },
          include: {
            bookingSeat: true,
          },
        });

        // Check for the existence of the new attendee w/ booking seat
        expect(newAttendee?.bookingSeat).toEqual(
          expect.objectContaining({
            referenceUid: expect.any(String),
            data: expect.any(Object),
            bookingId: bookingId,
          })
        );
      });

      // Testing in case of a wave of people book a time slot at the same time
      test("Attendee should be added to existing seated event when bookingUid is not present", async () => {
        const handleNewBooking = getNewBookingHandler();

        const booker = getBooker({
          email: "seat2@example.com",
          name: "Seat 2",
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const bookingId = 1;
        const bookingUid = "abc123";
        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const bookingStartTime = `${plus1DateString}T04:00:00Z`;
        const bookingEndTime = `${plus1DateString}T04:30:00Z`;
        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slug: "seated-event",
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: bookingId,
                uid: bookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: bookingStartTime,
                endTime: bookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
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

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            user: reqBookingUser,
          },
        });

        await handleNewBooking({
          bookingData: mockBookingData,
        });

        const newAttendee = await prismaMock.attendee.findFirst({
          where: {
            email: booker.email,
            bookingId: bookingId,
          },
          include: {
            bookingSeat: true,
          },
        });

        // Check for the existence of the new attendee w/ booking seat
        expect(newAttendee?.bookingSeat).toEqual(
          expect.objectContaining({
            referenceUid: expect.any(String),
            data: expect.any(Object),
            bookingId: bookingId,
          })
        );
      });

      test("If attendee is already a part of the booking then throw an error", async () => {
        const handleNewBooking = getNewBookingHandler();

        const booker = getBooker({
          email: "seat1@example.com",
          name: "Seat 1",
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const bookingId = 1;
        const bookingUid = "abc123";
        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const bookingStartTime = `${plus1DateString}T04:00:00Z`;
        const bookingEndTime = `${plus1DateString}T04:30:00Z`;
        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slug: "seated-event",
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: bookingId,
                uid: bookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: bookingStartTime,
                endTime: bookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@example.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
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

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            bookingUid: bookingUid,
            user: reqBookingUser,
          },
        });

        await expect(() =>
          handleNewBooking({
            bookingData: mockBookingData,
          })
        ).rejects.toThrowError(ErrorCode.AlreadySignedUpForBooking);
      });

      test("If event is already full, fail", async () => {
        const handleNewBooking = getNewBookingHandler();

        const booker = getBooker({
          email: "seat3@example.com",
          name: "Seat 3",
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const bookingId = 1;
        const bookingUid = "abc123";
        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const bookingStartTime = `${plus1DateString}T04:00:00Z`;
        const bookingEndTime = `${plus1DateString}T04:30:00Z`;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slug: "seated-event",
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 2,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: bookingId,
                uid: bookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: bookingStartTime,
                endTime: bookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                  getMockBookingAttendee({
                    id: 2,
                    name: "Seat 2",
                    email: "seat2@test.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-2",
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
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

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            bookingUid: bookingUid,
            user: reqBookingUser,
          },
        });

        await expect(() =>
          handleNewBooking({
            bookingData: mockBookingData,
          })
        ).rejects.toThrowError(ErrorCode.BookingSeatsFull);
      });

      test("Verify Seat Availability Calculation Based on Booked Seats, Not Total Attendees", async () => {
        const handleNewBooking = getNewBookingHandler();

        const booker = getBooker({
          email: "seat2@example.com",
          name: "Seat 2",
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          defaultScheduleId: null,
          schedules: [TestData.schedules.IstMorningShift],
          credentials: [getGoogleCalendarCredential()],
          selectedCalendars: [TestData.selectedCalendars.google],
          destinationCalendar: {
            integration: TestData.apps["google-calendar"].type,
            externalId: "organizer@google-calendar.com",
          },
        });

        const otherTeamMembers = [
          {
            name: "Other Team Member 1",
            username: "other-team-member-1",
            timeZone: Timezones["+5:30"],
            defaultScheduleId: null,
            email: "other-team-member-1@example.com",
            id: 102,
            schedules: [TestData.schedules.IstEveningShift],
            credentials: [getGoogleCalendarCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
            destinationCalendar: {
              integration: TestData.apps["google-calendar"].type,
              externalId: "other-team-member-1@google-calendar.com",
            },
          },
        ];

        const bookingId = 1;
        const bookingUid = "abc123";
        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const bookingStartTime = `${plus1DateString}T04:00:00Z`;
        const bookingEndTime = `${plus1DateString}T04:30:00Z`;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slug: "collective-team-seated-event",
                slotInterval: 30,
                length: 30,
                schedulingType: SchedulingType.COLLECTIVE,
                users: [
                  {
                    id: 101,
                  },
                  {
                    id: 102,
                  },
                ],
                destinationCalendar: {
                  integration: TestData.apps["google-calendar"].type,
                  externalId: "event-type-1@google-calendar.com",
                },
                seatsPerTimeSlot: 2,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: bookingId,
                uid: bookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: bookingStartTime,
                endTime: bookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Other Team Member 1",
                    email: "other-team-member-1@example.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                  }),
                  getMockBookingAttendee({
                    id: 2,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
            usersApartFromOrganizer: otherTeamMembers,
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

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            bookingUid: bookingUid,
            user: reqBookingUser,
          },
        });

        await handleNewBooking({
          bookingData: mockBookingData,
        });

        const newAttendee = await prismaMock.attendee.findFirst({
          where: {
            email: booker.email,
            bookingId: bookingId,
          },
          include: {
            bookingSeat: true,
          },
        });

        // Check for the existence of the new attendee with booking seat
        expect(newAttendee?.bookingSeat).toEqual(
          expect.objectContaining({
            referenceUid: expect.any(String),
            data: expect.any(Object),
            bookingId: bookingId,
          })
        );

        // Verify that the booking seat count is now 2 out of 2
        const bookingSeatCount = await prismaMock.bookingSeat.count({
          where: {
            bookingId: bookingId,
          },
        });

        expect(bookingSeatCount).toBe(2);
      });
    });

    describe("Rescheduling a booking", () => {
      test("When rescheduling to an existing booking, move attendee", async () => {
        const handleNewBooking = getNewBookingHandler();

        const attendeeToReschedule = getMockBookingAttendee({
          id: 2,
          name: "Seat 2",
          email: "seat2@test.com",
          locale: "en",

          timeZone: "America/Toronto",
          bookingSeat: {
            referenceUid: "booking-seat-2",
            data: {},
          },
        });

        const booker = getBooker({
          email: attendeeToReschedule.email,
          name: attendeeToReschedule.name,
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const firstBookingId = 1;
        const firstBookingUid = "abc123";
        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const firstBookingStartTime = `${plus1DateString}T04:00:00Z`;
        const firstBookingEndTime = `${plus1DateString}T04:30:00Z`;

        const secondBookingId = 2;
        const secondBookingUid = "def456";
        const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
        const secondBookingStartTime = `${plus2DateString}T04:00:00Z`;
        const secondBookingEndTime = `${plus2DateString}T04:30:00Z`;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slug: "seated-event",
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: firstBookingId,
                uid: firstBookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: firstBookingStartTime,
                endTime: firstBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                  attendeeToReschedule,
                ],
              },
              {
                id: secondBookingId,
                uid: secondBookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: secondBookingStartTime,
                endTime: secondBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 3,
                    name: "Seat 3",
                    email: "seat3@test.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-3",
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
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

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            rescheduleUid: "booking-seat-2",
            start: secondBookingStartTime,
            end: secondBookingEndTime,
            user: reqBookingUser,
          },
        });

        await handleNewBooking({
          bookingData: mockBookingData,
        });

        // Ensure that the attendee is no longer a part of the old booking
        const oldBookingAttendees = await prismaMock.attendee.findMany({
          where: {
            bookingId: firstBookingId,
          },
          select: {
            id: true,
          },
        });

        expect(oldBookingAttendees).not.toContain({ id: attendeeToReschedule.id });
        expect(oldBookingAttendees).toHaveLength(1);

        // Ensure that the attendee is a part of the new booking
        const newBookingAttendees = await prismaMock.attendee.findMany({
          where: {
            bookingId: secondBookingId,
          },
          select: {
            email: true,
          },
        });

        expect(newBookingAttendees).toContainEqual({ email: attendeeToReschedule.email });
        expect(newBookingAttendees).toHaveLength(2);

        // Ensure that the attendeeSeat is also updated to the new booking
        const attendeeSeat = await prismaMock.bookingSeat.findFirst({
          where: {
            attendeeId: attendeeToReschedule.id,
          },
          select: {
            bookingId: true,
          },
        });

        expect(attendeeSeat?.bookingId).toEqual(secondBookingId);
      });

      test("When rescheduling to an existing booking, reschedule email includes meeting URL", async () => {
        const handleNewBooking = getNewBookingHandler();
        const sendRescheduledSeatEmailSpy = vi.spyOn(emailManager, "sendRescheduledSeatEmailAndSMS");

        const attendeeToReschedule = getMockBookingAttendee({
          id: 2,
          name: "Seat 2",
          email: "seat2@test.com",
          locale: "en",
          timeZone: "America/Toronto",
          bookingSeat: {
            referenceUid: "booking-seat-2",
            data: {},
          },
        });

        const booker = getBooker({
          email: attendeeToReschedule.email,
          name: attendeeToReschedule.name,
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const firstBookingId = 1;
        const firstBookingUid = "abc123";
        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const firstBookingStartTime = `${plus1DateString}T04:00:00Z`;
        const firstBookingEndTime = `${plus1DateString}T04:30:00Z`;

        const secondBookingId = 2;
        const secondBookingUid = "def456";
        const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
        const secondBookingStartTime = `${plus2DateString}T04:00:00Z`;
        const secondBookingEndTime = `${plus2DateString}T04:30:00Z`;

        const meetingUrl = "http://mock-dailyvideo.example.com/meeting-with-url";

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slug: "seated-event",
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: firstBookingId,
                uid: firstBookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: firstBookingStartTime,
                endTime: firstBookingEndTime,
                metadata: {
                  videoCallUrl: meetingUrl,
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: meetingUrl,
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                  attendeeToReschedule,
                ],
              },
              {
                id: secondBookingId,
                uid: secondBookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: secondBookingStartTime,
                endTime: secondBookingEndTime,
                metadata: {
                  videoCallUrl: meetingUrl,
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID_2",
                    meetingId: "MOCK_ID_2",
                    meetingPassword: "MOCK_PASS_2",
                    meetingUrl: meetingUrl,
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 3,
                    name: "Seat 3",
                    email: "seat3@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-3",
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
          })
        );

        mockSuccessfulVideoMeetingCreation({
          metadataLookupKey: "dailyvideo",
          videoMeetingData: {
            id: "MOCK_ID",
            password: "MOCK_PASS",
            url: meetingUrl,
          },
        });

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            rescheduleUid: "booking-seat-2",
            start: secondBookingStartTime,
            end: secondBookingEndTime,
            user: reqBookingUser,
          },
        });

        await handleNewBooking({
          bookingData: mockBookingData,
        });

        expect(sendRescheduledSeatEmailSpy).toHaveBeenCalled();
        const calEvent = sendRescheduledSeatEmailSpy.mock.calls[0][0];
        expect(calEvent.videoCallData).toBeDefined();
        expect(calEvent.videoCallData?.url).toBe(meetingUrl);
      });

      test("When rescheduling to an empty timeslot, reschedule email includes meeting URL", async () => {
        const handleNewBooking = getNewBookingHandler();
        const sendRescheduledSeatEmailSpy = vi.spyOn(emailManager, "sendRescheduledSeatEmailAndSMS");

        const attendeeToReschedule = getMockBookingAttendee({
          id: 2,
          name: "Seat 2",
          email: "seat2@test.com",
          locale: "en",
          timeZone: "America/Toronto",
          bookingSeat: {
            referenceUid: "booking-seat-2",
            data: {},
          },
        });

        const booker = getBooker({
          email: attendeeToReschedule.email,
          name: attendeeToReschedule.name,
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const firstBookingId = 1;
        const firstBookingUid = "abc123";
        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const firstBookingStartTime = `${plus1DateString}T04:00:00Z`;
        const firstBookingEndTime = `${plus1DateString}T04:30:00Z`;

        const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
        const secondBookingStartTime = `${plus2DateString}T04:00:00Z`;
        const secondBookingEndTime = `${plus2DateString}T04:30:00Z`;

        const meetingUrl = "http://mock-dailyvideo.example.com/meeting-with-url";

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slug: "seated-event",
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: firstBookingId,
                uid: firstBookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: firstBookingStartTime,
                endTime: firstBookingEndTime,
                metadata: {
                  videoCallUrl: meetingUrl,
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: meetingUrl,
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                  attendeeToReschedule,
                ],
              },
            ],
            organizer,
          })
        );

        mockSuccessfulVideoMeetingCreation({
          metadataLookupKey: "dailyvideo",
          videoMeetingData: {
            id: "NEW_MOCK_ID",
            password: "NEW_MOCK_PASS",
            url: "http://mock-dailyvideo.example.com/new-meeting",
          },
        });

        mockCalendarToHaveNoBusySlots("googlecalendar", {
          create: {
            id: "GOOGLE_CALENDAR_EVENT_ID",
            iCalUID: "MOCKED_GOOGLE_CALENDAR_ICS_ID",
          },
        });

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            rescheduleUid: "booking-seat-2",
            start: secondBookingStartTime,
            end: secondBookingEndTime,
            user: reqBookingUser,
          },
        });

        await handleNewBooking({
          bookingData: mockBookingData,
        });

        expect(sendRescheduledSeatEmailSpy).toHaveBeenCalled();
        const calEvent = sendRescheduledSeatEmailSpy.mock.calls[0][0];
        expect(calEvent.videoCallData).toBeDefined();
        expect(calEvent.videoCallData?.url).toBe(meetingUrl);
      });

      test("When rescheduling to an empty timeslot, create a new booking", async () => {
        const handleNewBooking = getNewBookingHandler();

        const attendeeToReschedule = getMockBookingAttendee({
          id: 2,
          name: "Seat 2",
          email: "seat2@test.com",
          locale: "en",

          timeZone: "America/Toronto",
          bookingSeat: {
            referenceUid: "booking-seat-2",
            data: {},
          },
        });

        const booker = getBooker({
          email: attendeeToReschedule.email,
          name: attendeeToReschedule.name,
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const firstBookingId = 1;
        const firstBookingUid = "abc123";
        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const firstBookingStartTime = `${plus1DateString}T04:00:00Z`;
        const firstBookingEndTime = `${plus1DateString}T04:30:00Z`;

        const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
        const secondBookingStartTime = `${plus2DateString}T04:00:00Z`;
        const secondBookingEndTime = `${plus2DateString}T04:30:00Z`;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slug: "seated-event",
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: firstBookingId,
                uid: firstBookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: firstBookingStartTime,
                endTime: firstBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                  attendeeToReschedule,
                ],
              },
            ],
            organizer,
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

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            rescheduleUid: "booking-seat-2",
            start: secondBookingStartTime,
            end: secondBookingEndTime,
            user: reqBookingUser,
          },
        });

        const { req } = createMockNextJsRequest({
          method: "POST",
          body: mockBookingData,
        });

        const createdBooking = await handleNewBooking({
          bookingData: mockBookingData,
        });

        // Ensure that the attendee is no longer a part of the old booking
        const oldBookingAttendees = await prismaMock.attendee.findMany({
          where: {
            bookingId: firstBookingId,
          },
          select: {
            id: true,
          },
        });

        expect(oldBookingAttendees).not.toContain({ id: attendeeToReschedule.id });
        expect(oldBookingAttendees).toHaveLength(1);

        expect(createdBooking.id).not.toEqual(firstBookingId);

        // Ensure that the attendee and bookingSeat is also updated to the new booking
        const attendee = await prismaMock.attendee.findFirst({
          where: {
            bookingId: createdBooking.id,
          },
          include: {
            bookingSeat: true,
          },
        });

        expect(attendee?.bookingSeat?.bookingId).toEqual(createdBooking.id);
      });

      test("When last attendee is rescheduled, delete old booking", async () => {
        const handleNewBooking = getNewBookingHandler();

        const attendeeToReschedule = getMockBookingAttendee({
          id: 2,
          name: "Seat 2",
          email: "seat2@test.com",
          locale: "en",

          timeZone: "America/Toronto",
          bookingSeat: {
            referenceUid: "booking-seat-2",
            data: {},
          },
        });

        const booker = getBooker({
          email: attendeeToReschedule.email,
          name: attendeeToReschedule.name,
        });

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const firstBookingId = 1;
        const firstBookingUid = "abc123";
        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const firstBookingStartTime = `${plus1DateString}T04:00:00Z`;
        const firstBookingEndTime = `${plus1DateString}T04:30:00Z`;

        const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
        const secondBookingStartTime = `${plus2DateString}T04:00:00Z`;
        const secondBookingEndTime = `${plus2DateString}T04:30:00Z`;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slug: "seated-event",
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: firstBookingId,
                uid: firstBookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: firstBookingStartTime,
                endTime: firstBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [attendeeToReschedule],
              },
            ],
            organizer,
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

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            rescheduleUid: "booking-seat-2",
            start: secondBookingStartTime,
            end: secondBookingEndTime,
            user: reqBookingUser,
          },
        });

        const createdBooking = await handleNewBooking({
          bookingData: mockBookingData,
        });

        // Ensure that the old booking is cancelled
        const oldBooking = await prismaMock.booking.findFirst({
          where: {
            id: firstBookingId,
          },
          select: {
            status: true,
          },
        });

        expect(oldBooking?.status).toEqual(BookingStatus.CANCELLED);

        // Ensure that the attendee and attendeeSeat is also updated to the new booking
        const attendeeSeat = await prismaMock.attendee.findFirst({
          where: {
            bookingId: createdBooking.id,
          },
          include: {
            bookingSeat: true,
          },
        });

        expect(attendeeSeat?.bookingSeat?.bookingId).toEqual(createdBooking.id);
      });
    });

    describe("Canceling a booking", async () => {
      test("When canceling a booking, only remove that single attendee", async () => {
        const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking"))
          .default;

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const bookingId = 1;
        const bookingUid = "abc123";
        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const bookingStartTime = `${plus1DateString}T04:00:00Z`;
        const bookingEndTime = `${plus1DateString}T04:30:00Z`;

        const attendeeIdToBeCancelled = 2;
        const bookingSeatToBeCancelledUid = "booking-seat-2";

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slug: "seated-event",
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 4,
                seatsShowAttendees: false,
                owner: organizer.id,
              },
            ],
            bookings: [
              {
                id: bookingId,
                uid: bookingUid,
                eventTypeId: 1,
                userId: organizer.id,
                status: BookingStatus.ACCEPTED,
                startTime: bookingStartTime,
                endTime: bookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                  getMockBookingAttendee({
                    id: attendeeIdToBeCancelled,
                    name: "Seat 2",
                    email: "seat2@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: bookingSeatToBeCancelledUid,
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
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

        const mockCancelBookingData = getMockRequestDataForCancelBooking({
          id: bookingId,
          uid: bookingUid,
          seatReferenceUid: bookingSeatToBeCancelledUid,
        });

        await handleCancelBooking({
          bookingData: {
            ...mockCancelBookingData,
            cancellationReason: "test cancellation reason",
          },
          userId: organizer.id,
        });

        // Ensure that the booking has been cancelled
        const cancelledBooking = await prismaMock.booking.findFirst({
          where: {
            id: bookingId,
          },
          select: {
            status: true,
          },
        });

        // Check that the booking is still accepted
        expect(cancelledBooking?.status).toEqual(BookingStatus.ACCEPTED);

        // Check that the booking does not contain the cancelled attendee
        const attendees = await prismaMock.attendee.findMany({
          where: {
            bookingId,
          },
          select: {
            id: true,
          },
        });

        expect(attendees).not.toContain({ id: attendeeIdToBeCancelled });

        const bookingSeats = await prismaMock.bookingSeat.findMany({
          where: {
            bookingId,
          },
          select: {
            id: true,
          },
        });

        expect(bookingSeats).not.toContain({ referenceUid: bookingSeatToBeCancelledUid });
      });

      test("When last attendee cancels a booking, delete event", async () => {
        const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking"))
          .default;

        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });

        const bookingId = 1;
        const bookingUid = "abc123";
        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const bookingStartTime = `${plus1DateString}T04:00:00Z`;
        const bookingEndTime = `${plus1DateString}T04:30:00Z`;

        const attendeeIdToBeCancelled = 1;
        const bookingSeatToBeCancelledUid = "booking-seat-1";

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slug: "seated-event",
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 4,
                seatsShowAttendees: false,
                owner: organizer.id,
              },
            ],
            bookings: [
              {
                id: bookingId,
                uid: bookingUid,
                eventTypeId: 1,
                userId: organizer.id,
                status: BookingStatus.ACCEPTED,
                startTime: bookingStartTime,
                endTime: bookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: attendeeIdToBeCancelled,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: bookingSeatToBeCancelledUid,
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
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

        const mockCancelBookingData = getMockRequestDataForCancelBooking({
          id: bookingId,
          uid: bookingUid,
          seatReferenceUid: bookingSeatToBeCancelledUid,
        });

        await handleCancelBooking({
          bookingData: {
            ...mockCancelBookingData,
            cancellationReason: "test cancellation reason",
          },
          userId: organizer.id,
        });

        // Ensure that the booking has been cancelled
        const cancelledBooking = await prismaMock.booking.findFirst({
          where: {
            id: bookingId,
          },
          select: {
            status: true,
          },
        });

        // Check that the booking is still accepted
        expect(cancelledBooking?.status).toEqual(BookingStatus.CANCELLED);

        // Check that the booking does not contain the cancelled attendee
        const attendees = await prismaMock.attendee.findMany({
          where: {
            bookingId,
          },
          select: {
            id: true,
          },
        });

        expect(attendees).not.toContain({ id: attendeeIdToBeCancelled });

        const bookingSeats = await prismaMock.bookingSeat.findMany({
          where: {
            bookingId,
          },
          select: {
            id: true,
          },
        });

        expect(bookingSeats).not.toContain({ referenceUid: bookingSeatToBeCancelledUid });
      });
    });
  });

  describe("As an owner", () => {
    describe("Rescheduling a booking", () => {
      test("When rescheduling to new timeslot, ensure all attendees are moved", async () => {
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

        const firstBookingId = 1;
        const firstBookingUid = "abc123";
        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const firstBookingStartTime = `${plus1DateString}T04:00:00Z`;
        const firstBookingEndTime = `${plus1DateString}T04:30:00Z`;

        const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
        const secondBookingStartTime = `${plus2DateString}T04:00:00Z`;
        const secondBookingEndTime = `${plus2DateString}T04:30:00Z`;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slug: "seated-event",
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: firstBookingId,
                uid: firstBookingUid,
                eventTypeId: 1,
                userId: organizer.id,
                status: BookingStatus.ACCEPTED,
                startTime: firstBookingStartTime,
                endTime: firstBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                  getMockBookingAttendee({
                    id: 2,
                    name: "Seat 2",
                    email: "seat2@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-2",
                      data: {},
                    },
                  }),
                  getMockBookingAttendee({
                    id: 3,
                    name: "Seat 3",
                    email: "seat3@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-3",
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
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

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            rescheduleUid: firstBookingUid,
            start: secondBookingStartTime,
            end: secondBookingEndTime,
            user: reqBookingUser,
          },
        });

        const rescheduledBooking = await handleNewBooking({
          bookingData: mockBookingData,
          userId: organizer.id,
        });

        // Ensure that the booking has been moved
        expect(rescheduledBooking?.startTime).toEqual(secondBookingStartTime);
        expect(rescheduledBooking?.endTime).toEqual(secondBookingEndTime);

        // Ensure that the attendees are still a part of the event
        const attendees = await prismaMock.attendee.findMany({
          where: {
            bookingId: rescheduledBooking?.id,
          },
        });

        expect(attendees).toHaveLength(3);

        // Ensure that the bookingSeats are still a part of the event
        const bookingSeats = await prismaMock.bookingSeat.findMany({
          where: {
            bookingId: rescheduledBooking?.id,
          },
        });

        expect(bookingSeats).toHaveLength(3);
      });

      test("When rescheduling to existing booking, merge attendees ", async () => {
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

        const firstBookingId = 1;
        const firstBookingUid = "abc123";
        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const firstBookingStartTime = `${plus1DateString}T04:00:00Z`;
        const firstBookingEndTime = `${plus1DateString}T04:30:00Z`;

        const secondBookingId = 2;
        const secondBookingUid = "def456";
        const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
        const secondBookingStartTime = `${plus2DateString}T04:00:00Z`;
        const secondBookingEndTime = `${plus2DateString}T04:30:00Z`;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slug: "seated-event",
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 4,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: firstBookingId,
                uid: firstBookingUid,
                eventTypeId: 1,
                userId: organizer.id,
                status: BookingStatus.ACCEPTED,
                startTime: firstBookingStartTime,
                endTime: firstBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                  getMockBookingAttendee({
                    id: 2,
                    name: "Seat 2",
                    email: "seat2@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-2",
                      data: {},
                    },
                  }),
                ],
              },
              {
                id: secondBookingId,
                uid: secondBookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: secondBookingStartTime,
                endTime: secondBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 3,
                    name: "Seat 3",
                    email: "seat3@test.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-3",
                      data: {},
                    },
                  }),
                  getMockBookingAttendee({
                    id: 4,
                    name: "Seat 4",
                    email: "seat4@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-4",
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
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

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            rescheduleUid: firstBookingUid,
            start: secondBookingStartTime,
            end: secondBookingEndTime,
            user: reqBookingUser,
          },
        });

        const rescheduledBooking = await handleNewBooking({
          bookingData: mockBookingData,
          userId: organizer.id,
        });

        // Ensure that the booking has been moved
        expect(rescheduledBooking?.startTime).toEqual(new Date(secondBookingStartTime));
        expect(rescheduledBooking?.endTime).toEqual(new Date(secondBookingEndTime));

        // Ensure that the attendees are still a part of the event
        const attendees = await prismaMock.attendee.findMany({
          where: {
            bookingId: rescheduledBooking?.id,
          },
        });

        expect(attendees).toHaveLength(4);

        // Ensure that the bookingSeats are still a part of the event
        const bookingSeats = await prismaMock.bookingSeat.findMany({
          where: {
            bookingId: rescheduledBooking?.id,
          },
        });

        expect(bookingSeats).toHaveLength(4);

        // Ensure that the previous booking has been canceled
        const originalBooking = await prismaMock.booking.findFirst({
          where: {
            id: firstBookingId,
          },
          select: {
            status: true,
          },
        });

        expect(originalBooking?.status).toEqual(BookingStatus.CANCELLED);
      });
      test("When merging more attendees than seats, fail ", async () => {
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

        const firstBookingId = 1;
        const firstBookingUid = "abc123";
        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const firstBookingStartTime = `${plus1DateString}T04:00:00Z`;
        const firstBookingEndTime = `${plus1DateString}T04:30:00Z`;

        const secondBookingId = 2;
        const secondBookingUid = "def456";
        const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
        const secondBookingStartTime = `${plus2DateString}T04:00:00Z`;
        const secondBookingEndTime = `${plus2DateString}T04:30:00Z`;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slug: "seated-event",
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: firstBookingId,
                uid: firstBookingUid,
                eventTypeId: 1,
                userId: organizer.id,
                status: BookingStatus.ACCEPTED,
                startTime: firstBookingStartTime,
                endTime: firstBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                  getMockBookingAttendee({
                    id: 2,
                    name: "Seat 2",
                    email: "seat2@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-2",
                      data: {},
                    },
                  }),
                ],
              },
              {
                id: secondBookingId,
                uid: secondBookingUid,
                eventTypeId: 1,
                status: BookingStatus.ACCEPTED,
                startTime: secondBookingStartTime,
                endTime: secondBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 3,
                    name: "Seat 3",
                    email: "seat3@test.com",
                    locale: "en",

                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-3",
                      data: {},
                    },
                  }),
                  getMockBookingAttendee({
                    id: 4,
                    name: "Seat 4",
                    email: "seat4@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-4",
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
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

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            rescheduleUid: firstBookingUid,
            start: secondBookingStartTime,
            end: secondBookingEndTime,
            user: reqBookingUser,
          },
        });

        // const rescheduledBooking = await handleNewBooking(req);
        await expect(() =>
          handleNewBooking({
            bookingData: mockBookingData,
            userId: organizer.id,
          })
        ).rejects.toThrowError(ErrorCode.NotEnoughAvailableSeats);
      });

      test("When trying to reschedule in a non-available slot, throw an error", async () => {
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

        const firstBookingId = 1;
        const firstBookingUid = "abc123";
        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const firstBookingStartTime = `${plus1DateString}T04:00:00Z`;
        const firstBookingEndTime = `${plus1DateString}T04:30:00Z`;

        const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
        // Non-available time slot chosen (7:30PM - 8:00PM IST) while rescheduling
        const secondBookingStartTime = `${plus2DateString}T14:00:00Z`;
        const secondBookingEndTime = `${plus2DateString}T14:30:00Z`;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slug: "seated-event",
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 3,
                seatsShowAttendees: false,
              },
            ],
            bookings: [
              {
                id: firstBookingId,
                uid: firstBookingUid,
                eventTypeId: 1,
                userId: organizer.id,
                status: BookingStatus.ACCEPTED,
                startTime: firstBookingStartTime,
                endTime: firstBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                    noShow: false,
                  }),
                  getMockBookingAttendee({
                    id: 2,
                    name: "Seat 2",
                    email: "seat2@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-2",
                      data: {},
                    },
                    noShow: false,
                  }),
                  getMockBookingAttendee({
                    id: 3,
                    name: "Seat 3",
                    email: "seat3@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-3",
                      data: {},
                    },
                    noShow: false,
                  }),
                ],
              },
            ],
            organizer,
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

        const reqBookingUser = "seatedAttendee";

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            rescheduleUid: firstBookingUid,
            start: secondBookingStartTime,
            end: secondBookingEndTime,
            user: reqBookingUser,
          },
        });

        await expect(() =>
          handleNewBooking({
            bookingData: mockBookingData,
            userId: organizer.id,
          })
        ).rejects.toThrowError(ErrorCode.NoAvailableUsersFound);
      });
    });

    describe("Cancelling a booking", () => {
      test("When owner cancels booking, cancel booking for all attendees", async () => {
        const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking"))
          .default;

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

        const firstBookingId = 1;
        const firstBookingUid = "abc123";
        const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
        const firstBookingStartTime = `${plus1DateString}T04:00:00Z`;
        const firstBookingEndTime = `${plus1DateString}T04:30:00Z`;

        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slug: "seated-event",
                slotInterval: 30,
                length: 30,
                users: [
                  {
                    id: 101,
                  },
                ],
                seatsPerTimeSlot: 4,
                seatsShowAttendees: false,
                owner: organizer.id,
              },
            ],
            bookings: [
              {
                id: firstBookingId,
                uid: firstBookingUid,
                eventTypeId: 1,
                userId: organizer.id,
                status: BookingStatus.ACCEPTED,
                startTime: firstBookingStartTime,
                endTime: firstBookingEndTime,
                metadata: {
                  videoCallUrl: "https://existing-daily-video-call-url.example.com",
                },
                references: [
                  {
                    type: appStoreMetadata.dailyvideo.type,
                    uid: "MOCK_ID",
                    meetingId: "MOCK_ID",
                    meetingPassword: "MOCK_PASS",
                    meetingUrl: "http://mock-dailyvideo.example.com",
                    credentialId: null,
                  },
                ],
                attendees: [
                  getMockBookingAttendee({
                    id: 1,
                    name: "Seat 1",
                    email: "seat1@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-1",
                      data: {},
                    },
                  }),
                  getMockBookingAttendee({
                    id: 2,
                    name: "Seat 2",
                    email: "seat2@test.com",
                    locale: "en",
                    timeZone: "America/Toronto",
                    bookingSeat: {
                      referenceUid: "booking-seat-2",
                      data: {},
                    },
                  }),
                ],
              },
            ],
            organizer,
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

        const mockBookingData = getMockRequestDataForBooking({
          data: {
            id: firstBookingId,
            eventTypeId: 1,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            rescheduleUid: firstBookingUid,
            cancelledBy: organizer.email,
          },
        });

        await handleCancelBooking({
          bookingData: {
            ...mockBookingData,
            cancellationReason: "test cancellation reason",
          },
          userId: organizer.id,
        });

        // Ensure that the booking has been cancelled
        const cancelledBooking = await prismaMock.booking.findFirst({
          where: {
            id: firstBookingId,
          },
          select: {
            status: true,
            cancelledBy: true,
          },
        });

        expect(cancelledBooking?.status).toEqual(BookingStatus.CANCELLED);
        expect(cancelledBooking?.cancelledBy).toEqual(organizer.email);
      });
    });
  });
});
