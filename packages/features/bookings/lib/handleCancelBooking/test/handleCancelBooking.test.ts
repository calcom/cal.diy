import {
  BookingLocations,
  createBookingScenario,
  getBooker,
  getGoogleCalendarCredential,
  getOrganizer,
  getScenarioData,
  mockCalendarToHaveNoBusySlots,
  mockSuccessfulVideoMeetingCreation,
  TestData,
  getDate,
} from "@calcom/testing/lib/bookingScenario/bookingScenario";
import {
  expectBookingCancelledWebhookToHaveBeenFired,
} from "@calcom/testing/lib/bookingScenario/expects";
import { setupAndTeardown } from "@calcom/testing/lib/bookingScenario/setupAndTeardown";

import { describe, expect, vi } from "vitest";

import { processPaymentRefund } from "@calcom/features/bookings/lib/payment/processPaymentRefund";
import { BookingStatus } from "@calcom/prisma/enums";
import prismock from "@calcom/testing/lib/__mocks__/prisma";
import { test } from "@calcom/testing/lib/fixtures/fixtures";

vi.mock("@calcom/features/bookings/lib/payment/processPaymentRefund", () => ({
  processPaymentRefund: vi.fn(),
}));

describe("Cancel Booking", () => {
  setupAndTeardown();

  test("Should trigger BOOKING_CANCELLED webhook", async ({ emails }) => {
    const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

    const uidOfBookingToBeCancelled = "h5Wv3eHgconAED2j4gcVhP";
    const idOfBookingToBeCancelled = 1020;
    const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

    await createBookingScenario(
      getScenarioData({
        webhooks: [
          {
            userId: organizer.id,
            eventTriggers: ["BOOKING_CANCELLED"],
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
        bookings: [
          {
            id: idOfBookingToBeCancelled,
            uid: uidOfBookingToBeCancelled,
            attendees: [
              {
                email: booker.email,
                timeZone: "Asia/Kolkata",
              },
            ],
            eventTypeId: 1,
            userId: 101,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            status: BookingStatus.ACCEPTED,
            startTime: `${plus1DateString}T05:00:00.000Z`,
            endTime: `${plus1DateString}T05:15:00.000Z`,
            metadata: {
              videoCallUrl: "https://existing-daily-video-call-url.example.com",
            },
          },
        ],
        organizer,
        apps: [TestData.apps["daily-video"]],
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

    mockCalendarToHaveNoBusySlots("googlecalendar", {
      create: {
        id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID",
      },
    });

    await handleCancelBooking({
      bookingData: {
        id: idOfBookingToBeCancelled,
        uid: uidOfBookingToBeCancelled,
        cancelledBy: organizer.email,
        cancellationReason: "No reason",
      },
    });

    expectBookingCancelledWebhookToHaveBeenFired({
      booker,
      organizer,
      location: BookingLocations.CalVideo,
      subscriberUrl: "http://my-webhook.example.com",
      payload: {
        cancelledBy: organizer.email,
        organizer: {
          id: organizer.id,
          username: organizer.username,
          email: organizer.email,
          name: organizer.name,
          timeZone: organizer.timeZone,
        },
      },
    });
  });

  test("Should throw when cancelling a non-existing booking", async () => {
    const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

    await expect(
      handleCancelBooking({
        bookingData: {
          id: 99999,
          uid: "non-existing-uid",
          cancelledBy: "someone@example.com",
          cancellationReason: "No reason",
        },
      })
    ).rejects.toThrow("Booking not found.");
  });

  test("Should call processPaymentRefund", async () => {
    const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

    const uidOfBookingToBeCancelled = "h5Wv3eHgconAED2j4gcVhP";
    const idOfBookingToBeCancelled = 1020;
    const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
    const booking = {
      id: idOfBookingToBeCancelled,
      uid: uidOfBookingToBeCancelled,
      eventTypeId: 1,
      userId: 101,
      responses: {
        email: booker.email,
        name: booker.name,
        location: { optionValue: "", value: BookingLocations.CalVideo },
      },
      status: BookingStatus.ACCEPTED,
      startTime: `${plus1DateString}T05:00:00.000Z`,
      endTime: `${plus1DateString}T05:15:00.000Z`,
      metadata: {
        videoCallUrl: "https://existing-daily-video-call-url.example.com",
      },
      attendees: [
        {
          timeZone: "Asia/Kolkata",
          email: booker.email,
        },
      ],
    };

    await createBookingScenario(
      getScenarioData({
        webhooks: [
          {
            userId: organizer.id,
            eventTriggers: ["BOOKING_CANCELLED"],
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
        payment: [
          {
            amount: 12,
            bookingId: idOfBookingToBeCancelled,
            currency: "usd",
            data: {},
            externalId: "ext_id",
            fee: 12,
            refunded: false,
            success: true,
            uid: uidOfBookingToBeCancelled,
          },
        ],
        bookings: [booking],
        organizer,
        apps: [TestData.apps["daily-video"]],
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

    mockCalendarToHaveNoBusySlots("googlecalendar", {
      create: {
        id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID",
      },
    });

    await handleCancelBooking({
      bookingData: {
        id: idOfBookingToBeCancelled,
        uid: uidOfBookingToBeCancelled,
        cancelledBy: organizer.email,
        cancellationReason: "No reason",
      },
    });

    expectBookingCancelledWebhookToHaveBeenFired({
      booker,
      organizer,
      location: BookingLocations.CalVideo,
      subscriberUrl: "http://my-webhook.example.com",
      payload: {
        cancelledBy: organizer.email,
        organizer: {
          id: organizer.id,
          username: organizer.username,
          email: organizer.email,
          name: organizer.name,
          timeZone: organizer.timeZone,
        },
      },
    });

    expect(processPaymentRefund).toHaveBeenCalled();
  });

  test("Should pass all seat payments to processPaymentRefund when fully cancelling a paid seated booking", async () => {
    const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

    const uidOfBookingToBeCancelled = "seated-multi-pay-cancel";
    const idOfBookingToBeCancelled = 1099;
    const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
    const booking = {
      id: idOfBookingToBeCancelled,
      uid: uidOfBookingToBeCancelled,
      eventTypeId: 1,
      userId: 101,
      responses: {
        email: booker.email,
        name: booker.name,
        location: { optionValue: "", value: BookingLocations.CalVideo },
      },
      status: BookingStatus.ACCEPTED,
      startTime: `${plus1DateString}T05:00:00.000Z`,
      endTime: `${plus1DateString}T05:15:00.000Z`,
      metadata: {
        videoCallUrl: "https://existing-daily-video-call-url.example.com",
      },
      attendees: [{ timeZone: "Asia/Kolkata", email: booker.email }],
    };

    await createBookingScenario(
      getScenarioData({
        eventTypes: [
          {
            id: 1,
            slotInterval: 30,
            length: 30,
            seatsPerTimeSlot: 3,
            users: [{ id: 101 }],
          },
        ],
        // Two seats on the same booking → two Payment rows sharing one bookingId.
        payment: [
          {
            amount: 1000,
            bookingId: idOfBookingToBeCancelled,
            currency: "usd",
            data: {},
            externalId: "ext_seat_1",
            fee: 0,
            refunded: false,
            success: true,
            uid: "seat-1-pay",
          },
          {
            amount: 5000,
            bookingId: idOfBookingToBeCancelled,
            currency: "usd",
            data: {},
            externalId: "ext_seat_2",
            fee: 0,
            refunded: false,
            success: true,
            uid: "seat-2-pay",
          },
        ],
        bookings: [booking],
        organizer,
        apps: [TestData.apps["daily-video"]],
      })
    );
    mockSuccessfulVideoMeetingCreation({
      metadataLookupKey: "dailyvideo",
      videoMeetingData: { id: "MOCK_ID", password: "MOCK_PASS", url: `http://mock-dailyvideo.example.com/meeting-1` },
    });
    mockCalendarToHaveNoBusySlots("googlecalendar", {
      create: { id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID" },
    });

    // Full cancel (no seatReferenceUid) by the host. Clear first so the count is order-independent.
    vi.mocked(processPaymentRefund).mockClear();
    await handleCancelBooking({
      bookingData: {
        id: idOfBookingToBeCancelled,
        uid: uidOfBookingToBeCancelled,
        cancelledBy: organizer.email,
        cancellationReason: "No reason",
      },
    });

    expect(processPaymentRefund).toHaveBeenCalledTimes(1);
    const refundArg = vi.mocked(processPaymentRefund).mock.calls[0][0];
    expect(refundArg.booking.payment).toHaveLength(2);
    expect(refundArg.booking.payment.map((p) => p.externalId).sort()).toEqual(["ext_seat_1", "ext_seat_2"]);
  });

  test("Should block cancelling past bookings", async () => {
    const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

    const uidOfBookingToBeCancelled = "past-booking";
    const idOfBookingToBeCancelled = 3040;
    const { dateString: minus1DateString } = getDate({ dateIncrement: -1 });

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
            id: idOfBookingToBeCancelled,
            uid: uidOfBookingToBeCancelled,
            eventTypeId: 1,
            userId: 101,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            status: BookingStatus.ACCEPTED,
            startTime: `${minus1DateString}T05:00:00.000Z`,
            endTime: `${minus1DateString}T05:30:00.000Z`,
          },
        ],
        organizer,
        apps: [TestData.apps["daily-video"]],
      })
    );

    // This should throw an error with current implementation
    await expect(
      handleCancelBooking({
        bookingData: {
          id: idOfBookingToBeCancelled,
          uid: uidOfBookingToBeCancelled,
          cancelledBy: organizer.email,
          cancellationReason: "Testing past booking cancellation",
        },
      })
    ).rejects.toThrow("Cannot cancel a booking that has already ended");
  });

  test("Should block canceling bookings without a cancellation reason when cancelledBy is set to the host", async () => {
    const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

    const uidOfBookingToBeCancelled = "cancelled-booking";
    const idOfBookingToBeCancelled = 3040;
    const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

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
            id: idOfBookingToBeCancelled,
            uid: uidOfBookingToBeCancelled,
            eventTypeId: 1,
            userId: 101,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            status: BookingStatus.ACCEPTED,
            startTime: `${plus1DateString}T05:00:00.000Z`,
            endTime: `${plus1DateString}T05:30:00.000Z`,
          },
        ],
        organizer,
        apps: [TestData.apps["daily-video"]],
      })
    );

    // This should throw an error with current implementation
    await expect(
      handleCancelBooking({
        bookingData: {
          id: idOfBookingToBeCancelled,
          uid: uidOfBookingToBeCancelled,
          cancelledBy: organizer.email,
        },
      })
    ).rejects.toThrow("Cancellation reason is required");
  });

  test("Should not charge cancellation fee when organizer cancels booking", async () => {
    const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

    const uidOfBookingToBeCancelled = "cancellation-fee-organizer-test";
    const idOfBookingToBeCancelled = 4050;
    const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

    await createBookingScenario(
      getScenarioData({
        eventTypes: [
          {
            id: 1,
            slotInterval: 30,
            length: 30,
            users: [{ id: 101 }],
            metadata: {
              apps: {
                stripe: {
                  enabled: true,
                  paymentOption: "HOLD",
                  price: 1000,
                  currency: "usd",
                  cancellationFeeEnabled: true,
                  cancellationFeeTimeValue: 2,
                  cancellationFeeTimeUnit: "hours",
                },
              },
            },
          },
        ],
        bookings: [
          {
            id: idOfBookingToBeCancelled,
            uid: uidOfBookingToBeCancelled,
            eventTypeId: 1,
            userId: 101,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            status: BookingStatus.ACCEPTED,
            startTime: `${plus1DateString}T05:00:00.000Z`,
            endTime: `${plus1DateString}T05:30:00.000Z`,
            attendees: [
              {
                email: booker.email,
                timeZone: "Asia/Kolkata",
              },
            ],
          },
        ],
        payment: [
          {
            amount: 1000,
            bookingId: idOfBookingToBeCancelled,
            currency: "usd",
            data: {},
            externalId: "ext_id_cancellation",
            fee: 0,
            refunded: false,
            success: false,
            uid: uidOfBookingToBeCancelled,
            paymentOption: "HOLD",
          },
        ],
        organizer,
        apps: [TestData.apps["daily-video"]],
      })
    );

    mockSuccessfulVideoMeetingCreation({
      metadataLookupKey: "dailyvideo",
      videoMeetingData: {
        id: "MOCK_ID",
        password: "MOCK_PASS",
        url: `http://mock-dailyvideo.example.com/meeting-cancellation`,
      },
    });

    mockCalendarToHaveNoBusySlots("googlecalendar", {
      create: {
        id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID_CANCELLATION",
      },
    });

    const result = await handleCancelBooking({
      bookingData: {
        id: idOfBookingToBeCancelled,
        uid: uidOfBookingToBeCancelled,
        cancelledBy: organizer.email,
        cancellationReason: "No reason",
      },
    });

    expect(result.success).toBe(true);
  });

  test("Should not charge cancellation fee when team admin cancels booking", async () => {
    const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

    const booker = getBooker({
      email: "booker@example.com",
      name: "Booker",
    });

    const organizer = getOrganizer({
      name: "Team Admin",
      email: "admin@example.com",
      id: 101,
      schedules: [TestData.schedules.IstWorkHours],
      credentials: [getGoogleCalendarCredential()],
      selectedCalendars: [TestData.selectedCalendars.google],
    });

    const teamMember = getOrganizer({
      name: "Team Member",
      email: "member@example.com",
      id: 102,
      schedules: [TestData.schedules.IstWorkHours],
      credentials: [getGoogleCalendarCredential()],
      selectedCalendars: [TestData.selectedCalendars.google],
    });

    const uidOfBookingToBeCancelled = "cancellation-fee-team-admin-test";
    const idOfBookingToBeCancelled = 4060;
    const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

    await createBookingScenario(
      getScenarioData({
        eventTypes: [
          {
            id: 2,
            slotInterval: 30,
            length: 30,
            teamId: 1,
            users: [{ id: 101 }, { id: 102 }],
            hosts: [
              { userId: 101, isFixed: false },
              { userId: 102, isFixed: false },
            ],
            metadata: {
              apps: {
                stripe: {
                  enabled: true,
                  paymentOption: "HOLD",
                  price: 1000,
                  currency: "usd",
                  cancellationFeeEnabled: true,
                  cancellationFeeTimeValue: 1,
                  cancellationFeeTimeUnit: "hours",
                },
              },
            },
          },
        ],
        bookings: [
          {
            id: idOfBookingToBeCancelled,
            uid: uidOfBookingToBeCancelled,
            eventTypeId: 2,
            userId: 102,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            status: BookingStatus.ACCEPTED,
            startTime: `${plus1DateString}T05:00:00.000Z`,
            endTime: `${plus1DateString}T05:30:00.000Z`,
            attendees: [
              {
                email: booker.email,
                timeZone: "Asia/Kolkata",
              },
            ],
          },
        ],
        payment: [
          {
            amount: 1000,
            bookingId: idOfBookingToBeCancelled,
            currency: "usd",
            data: {},
            externalId: "ext_id_team_cancellation",
            fee: 0,
            refunded: false,
            success: false,
            uid: uidOfBookingToBeCancelled,
            paymentOption: "HOLD",
          },
        ],
        users: [organizer, teamMember],
        apps: [TestData.apps["daily-video"]],
      })
    );

    mockSuccessfulVideoMeetingCreation({
      metadataLookupKey: "dailyvideo",
      videoMeetingData: {
        id: "MOCK_ID",
        password: "MOCK_PASS",
        url: `http://mock-dailyvideo.example.com/meeting-team-cancellation`,
      },
    });

    mockCalendarToHaveNoBusySlots("googlecalendar", {
      create: {
        id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID_TEAM_CANCELLATION",
      },
    });

    const result = await handleCancelBooking({
      bookingData: {
        id: idOfBookingToBeCancelled,
        uid: uidOfBookingToBeCancelled,
        cancelledBy: organizer.email,
        cancellationReason: "No reason",
      },
    });

    expect(result.success).toBe(true);
  });

  test("Should charge cancellation fee when attendee cancels within time threshold", async () => {
    const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

    const uidOfBookingToBeCancelled = "cancellation-fee-attendee-test";
    const idOfBookingToBeCancelled = 4070;

    const now = new Date();
    const startTime = new Date(now.getTime() + 30 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

    await createBookingScenario(
      getScenarioData({
        eventTypes: [
          {
            id: 1,
            slotInterval: 30,
            length: 30,
            users: [{ id: 101 }],
            metadata: {
              apps: {
                stripe: {
                  enabled: true,
                  paymentOption: "HOLD",
                  price: 1000,
                  currency: "usd",
                  cancellationFeeEnabled: true,
                  cancellationFeeTimeValue: 1,
                  cancellationFeeTimeUnit: "hours",
                },
              },
            },
          },
        ],
        bookings: [
          {
            id: idOfBookingToBeCancelled,
            uid: uidOfBookingToBeCancelled,
            eventTypeId: 1,
            userId: 101,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            status: BookingStatus.ACCEPTED,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            attendees: [
              {
                email: booker.email,
                timeZone: "Asia/Kolkata",
              },
            ],
          },
        ],
        payment: [
          {
            amount: 1000,
            bookingId: idOfBookingToBeCancelled,
            currency: "usd",
            data: {},
            externalId: "ext_id_attendee_cancellation",
            fee: 0,
            refunded: false,
            success: false,
            uid: uidOfBookingToBeCancelled,
            paymentOption: "HOLD",
            appId: "stripe",
          },
        ],
        organizer,
        apps: [TestData.apps["daily-video"]],
      })
    );

    mockSuccessfulVideoMeetingCreation({
      metadataLookupKey: "dailyvideo",
      videoMeetingData: {
        id: "MOCK_ID",
        password: "MOCK_PASS",
        url: `http://mock-dailyvideo.example.com/meeting-attendee-cancellation`,
      },
    });

    mockCalendarToHaveNoBusySlots("googlecalendar", {
      create: {
        id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID_ATTENDEE_CANCELLATION",
      },
    });

    const result = await handleCancelBooking({
      bookingData: {
        id: idOfBookingToBeCancelled,
        uid: uidOfBookingToBeCancelled,
        cancelledBy: booker.email,
        cancellationReason: "Attendee cancelled within time threshold",
      },
      userId: 999,
    });

    expect(result.success).toBe(true);
  });

  test("Should trigger BOOKING_CANCELLED webhook with username for bookings", async () => {
    const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

    const booker = getBooker({
      email: "booker@example.com",
      name: "Booker",
    });

    const organizer = getOrganizer({
      name: "Organizer",
      email: "organizer@example.com",
      id: 101,
      username: "organizer-username",
      schedules: [TestData.schedules.IstWorkHours],
      credentials: [getGoogleCalendarCredential()],
      selectedCalendars: [TestData.selectedCalendars.google],
    });

    const uidOfBookingToBeCancelled = "org-booking-uid";
    const idOfBookingToBeCancelled = 5080;
    const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

    await createBookingScenario(
      getScenarioData(
        {
          webhooks: [
            {
              userId: organizer.id,
              eventTriggers: ["BOOKING_CANCELLED"],
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
          bookings: [
            {
              id: idOfBookingToBeCancelled,
              uid: uidOfBookingToBeCancelled,
              attendees: [
                {
                  email: booker.email,
                },
              ],
              eventTypeId: 1,
              userId: 101,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
              status: BookingStatus.ACCEPTED,
              startTime: `${plus1DateString}T05:00:00.000Z`,
              endTime: `${plus1DateString}T05:15:00.000Z`,
              metadata: {
                videoCallUrl: "https://existing-daily-video-call-url.example.com",
              },
            },
          ],
          organizer,
          apps: [TestData.apps["daily-video"]],
        },
        {
          id: 1,
          profileUsername: "username-in-org",
        }
      )
    );

    mockSuccessfulVideoMeetingCreation({
      metadataLookupKey: "dailyvideo",
      videoMeetingData: {
        id: "MOCK_ID",
        password: "MOCK_PASS",
        url: `http://mock-dailyvideo.example.com/meeting-org`,
      },
    });

    mockCalendarToHaveNoBusySlots("googlecalendar", {
      create: {
        id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID_ORG",
      },
    });

    await handleCancelBooking({
      bookingData: {
        id: idOfBookingToBeCancelled,
        uid: uidOfBookingToBeCancelled,
        cancelledBy: organizer.email,
        cancellationReason: "Organization booking cancellation test",
      },
    });

    expectBookingCancelledWebhookToHaveBeenFired({
      booker,
      organizer,
      location: BookingLocations.CalVideo,
      subscriberUrl: "http://my-webhook.example.com",
      payload: {
        cancelledBy: organizer.email,
        organizer: {
          id: organizer.id,
          username: organizer.username,
          email: organizer.email,
          name: organizer.name,
          timeZone: organizer.timeZone,
        },
      },
    });
  });

  test("Should cancel seated event and delete all attendees when seatsPerTimeSlot is enabled", async () => {
    const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

    const booker = getBooker({
      email: "booker@example.com",
      name: "Booker",
    });

    const attendee2 = getBooker({
      email: "attendee2@example.com",
      name: "Attendee 2",
    });

    const organizer = getOrganizer({
      name: "Organizer",
      email: "organizer@example.com",
      id: 101,
      schedules: [TestData.schedules.IstWorkHours],
      credentials: [getGoogleCalendarCredential()],
      selectedCalendars: [TestData.selectedCalendars.google],
    });

    const uidOfBookingToBeCancelled = "seated-event-booking";
    const idOfBookingToBeCancelled = 4050;
    const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

    await createBookingScenario(
      getScenarioData({
        eventTypes: [
          {
            id: 1,
            slotInterval: 30,
            length: 30,
            seatsPerTimeSlot: 5, // Enable seated events
            users: [
              {
                id: 101,
              },
            ],
            hosts: [
              {
                id: 101,
                userId: 101,
              },
            ],
          },
        ],
        bookings: [
          {
            id: idOfBookingToBeCancelled,
            uid: uidOfBookingToBeCancelled,
            attendees: [
              {
                email: booker.email,
              },
              {
                email: attendee2.email,
              },
            ],
            eventTypeId: 1,
            userId: 101,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            status: BookingStatus.ACCEPTED,
            startTime: `${plus1DateString}T05:00:00.000Z`,
            endTime: `${plus1DateString}T05:30:00.000Z`,
          },
        ],
        organizer,
        apps: [TestData.apps["daily-video"]],
      })
    );

    mockSuccessfulVideoMeetingCreation({
      metadataLookupKey: "dailyvideo",
      videoMeetingData: {
        id: "MOCK_ID",
        password: "MOCK_PASS",
        url: `http://mock-dailyvideo.example.com/meeting-seated`,
      },
    });

    mockCalendarToHaveNoBusySlots("googlecalendar", {
      create: {
        id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID_SEATED",
      },
    });

    const result = await handleCancelBooking({
      bookingData: {
        id: idOfBookingToBeCancelled,
        uid: uidOfBookingToBeCancelled,
        cancelledBy: organizer.email,
        cancellationReason: "Cancelling seated event",
      },
      userId: organizer.id,
    });

    expect(result.success).toBe(true);
    expect(result.onlyRemovedAttendee).toBe(false);
    expect(result.bookingId).toBe(idOfBookingToBeCancelled);
  });

  test("Should cancel all remaining recurring bookings when allRemainingBookings is true", async () => {
    const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

    const uidOfBookingToBeCancelled = "recurring-booking-1";
    const idOfBookingToBeCancelled = 5060;
    const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
    const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
    const recurringEventId = "recurring-event-123";

    await createBookingScenario(
      getScenarioData({
        eventTypes: [
          {
            id: 1,
            slotInterval: 30,
            length: 30,
            recurringEvent: {
              freq: 2, // weekly
              count: 3,
              interval: 1,
            },
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        bookings: [
          {
            id: idOfBookingToBeCancelled,
            uid: uidOfBookingToBeCancelled,
            recurringEventId,
            attendees: [
              {
                email: booker.email,
              },
            ],
            eventTypeId: 1,
            userId: 101,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            status: BookingStatus.ACCEPTED,
            startTime: `${plus1DateString}T05:00:00.000Z`,
            endTime: `${plus1DateString}T05:30:00.000Z`,
          },
          // Additional recurring booking instance
          {
            id: idOfBookingToBeCancelled + 1,
            uid: "recurring-booking-2",
            recurringEventId,
            attendees: [
              {
                email: booker.email,
              },
            ],
            eventTypeId: 1,
            userId: 101,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            status: BookingStatus.ACCEPTED,
            startTime: `${plus2DateString}T05:00:00.000Z`,
            endTime: `${plus2DateString}T05:30:00.000Z`,
          },
        ],
        organizer,
        apps: [TestData.apps["daily-video"]],
      })
    );

    mockSuccessfulVideoMeetingCreation({
      metadataLookupKey: "dailyvideo",
      videoMeetingData: {
        id: "MOCK_ID",
        password: "MOCK_PASS",
        url: `http://mock-dailyvideo.example.com/meeting-recurring`,
      },
    });

    mockCalendarToHaveNoBusySlots("googlecalendar", {
      create: {
        id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID_RECURRING",
      },
    });

    const result = await handleCancelBooking({
      bookingData: {
        id: idOfBookingToBeCancelled,
        uid: uidOfBookingToBeCancelled,
        cancelledBy: organizer.email,
        cancellationReason: "Cancelling all remaining recurring bookings",
        allRemainingBookings: true,
      },
      userId: organizer.id,
    });

    expect(result.success).toBe(true);
    expect(result.onlyRemovedAttendee).toBe(false);
    expect(result.bookingId).toBe(idOfBookingToBeCancelled);
  });

  test("Should cancel subsequent bookings when cancelSubsequentBookings is true", async () => {
    const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

    const uidOfBookingToBeCancelled = "recurring-subsequent-1";
    const idOfBookingToBeCancelled = 6070;
    const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });
    const { dateString: plus2DateString } = getDate({ dateIncrement: 2 });
    const recurringEventId = "recurring-subsequent-456";

    await createBookingScenario(
      getScenarioData({
        eventTypes: [
          {
            id: 1,
            slotInterval: 30,
            length: 30,
            recurringEvent: {
              freq: 2, // weekly
              count: 3,
              interval: 1,
            },
            users: [
              {
                id: 101,
              },
            ],
          },
        ],
        bookings: [
          {
            id: idOfBookingToBeCancelled,
            uid: uidOfBookingToBeCancelled,
            recurringEventId,
            attendees: [
              {
                email: booker.email,
              },
            ],
            eventTypeId: 1,
            userId: 101,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            status: BookingStatus.ACCEPTED,
            startTime: `${plus1DateString}T05:00:00.000Z`,
            endTime: `${plus1DateString}T05:30:00.000Z`,
          },
          // Subsequent booking that should be cancelled
          {
            id: idOfBookingToBeCancelled + 1,
            uid: "recurring-subsequent-2",
            recurringEventId,
            attendees: [
              {
                email: booker.email,
              },
            ],
            eventTypeId: 1,
            userId: 101,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            status: BookingStatus.ACCEPTED,
            startTime: `${plus2DateString}T05:00:00.000Z`,
            endTime: `${plus2DateString}T05:30:00.000Z`,
          },
        ],
        organizer,
        apps: [TestData.apps["daily-video"]],
      })
    );

    mockSuccessfulVideoMeetingCreation({
      metadataLookupKey: "dailyvideo",
      videoMeetingData: {
        id: "MOCK_ID",
        password: "MOCK_PASS",
        url: `http://mock-dailyvideo.example.com/meeting-subsequent`,
      },
    });

    mockCalendarToHaveNoBusySlots("googlecalendar", {
      create: {
        id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID_SUBSEQUENT",
      },
    });

    const result = await handleCancelBooking({
      bookingData: {
        id: idOfBookingToBeCancelled,
        uid: uidOfBookingToBeCancelled,
        cancelledBy: organizer.email,
        cancellationReason: "Cancelling this and all subsequent bookings",
        cancelSubsequentBookings: true,
      },
      userId: organizer.id,
    });

    expect(result.success).toBe(true);
    expect(result.onlyRemovedAttendee).toBe(false);
    expect(result.bookingId).toBe(idOfBookingToBeCancelled);
  });

  test("cancelSubsequentBookings must not wipe scheduled triggers of earlier, non-cancelled occurrences", async () => {
    const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

    const booker = getBooker({ email: "booker@example.com", name: "Booker" });
    const organizer = getOrganizer({
      name: "Organizer",
      email: "organizer@example.com",
      id: 101,
      schedules: [TestData.schedules.IstWorkHours],
      credentials: [getGoogleCalendarCredential()],
      selectedCalendars: [TestData.selectedCalendars.google],
    });

    const recurringEventId = "rec-sub-series";
    // getDate resolves against the runner's local date while mkBooking pins the time to
    // 05:00:00.000Z, so a +1 day occurrence can already be in the past in negative UTC offsets.
    // The pre-fix cleanup query would then skip it and this test would pass without the fix.
    const { dateString: plus7DateString } = getDate({ dateIncrement: 7 });
    const { dateString: plus8DateString } = getDate({ dateIncrement: 8 });
    const { dateString: plus9DateString } = getDate({ dateIncrement: 9 });
    const firstId = 6080; // earliest upcoming occurrence — NOT being cancelled
    const middleId = 6081; // the occurrence we cancel (this + subsequent)
    const lastId = 6082;

    const mkBooking = (id: number, uid: string, dateString: string) => ({
      id,
      uid,
      recurringEventId,
      eventTypeId: 1,
      userId: 101,
      attendees: [{ email: booker.email }],
      responses: {
        email: booker.email,
        name: booker.name,
        location: { optionValue: "", value: BookingLocations.CalVideo },
      },
      status: BookingStatus.ACCEPTED,
      startTime: `${dateString}T05:00:00.000Z`,
      endTime: `${dateString}T05:30:00.000Z`,
    });

    await createBookingScenario(
      getScenarioData({
        eventTypes: [
          {
            id: 1,
            slotInterval: 30,
            length: 30,
            recurringEvent: { freq: 2, count: 3, interval: 1 },
            users: [{ id: 101 }],
          },
        ],
        bookings: [
          mkBooking(firstId, "rec-sub-1", plus7DateString),
          mkBooking(middleId, "rec-sub-2", plus8DateString),
          mkBooking(lastId, "rec-sub-3", plus9DateString),
        ],
        organizer,
        apps: [TestData.apps["daily-video"]],
      })
    );

    mockSuccessfulVideoMeetingCreation({
      metadataLookupKey: "dailyvideo",
      videoMeetingData: { id: "MOCK_ID", password: "MOCK_PASS", url: `http://mock-dailyvideo.example.com/meeting-sub` },
    });
    mockCalendarToHaveNoBusySlots("googlecalendar", { create: { id: "MOCKED_GCAL_EVENT_SUB" } });

    // The earliest occurrence has a scheduled webhook trigger (e.g. MEETING_ENDED). It is NOT being cancelled.
    await prismock.webhookScheduledTriggers.create({
      data: {
        bookingId: firstId,
        subscriberUrl: "http://my-webhook.example.com",
        payload: "{}",
        startAfter: new Date(`${plus7DateString}T05:30:00.000Z`),
      },
    });

    await handleCancelBooking({
      bookingData: {
        id: middleId,
        uid: "rec-sub-2",
        cancelledBy: organizer.email,
        cancellationReason: "Cancel this and subsequent",
        cancelSubsequentBookings: true,
      },
      userId: organizer.id,
    });

    // The earliest occurrence must stay ACCEPTED (only middle + last are cancelled)...
    const first = await prismock.booking.findFirst({ where: { id: firstId }, select: { status: true } });
    expect(first?.status).toBe(BookingStatus.ACCEPTED);

    // ...and its scheduled webhook trigger must survive, since it was never cancelled.
    const remainingTriggers = await prismock.webhookScheduledTriggers.findMany({ where: { bookingId: firstId } });
    expect(remainingTriggers).toHaveLength(1);
  });

  test("Should handle booking reference cleanup during cancellation", async () => {
    const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

    const uidOfBookingToBeCancelled = "booking-with-references";
    const idOfBookingToBeCancelled = 7080;
    const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

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
            id: idOfBookingToBeCancelled,
            uid: uidOfBookingToBeCancelled,
            attendees: [
              {
                email: booker.email,
              },
            ],
            eventTypeId: 1,
            userId: 101,
            responses: {
              email: booker.email,
              name: booker.name,
              location: { optionValue: "", value: BookingLocations.CalVideo },
            },
            status: BookingStatus.ACCEPTED,
            startTime: `${plus1DateString}T05:00:00.000Z`,
            endTime: `${plus1DateString}T05:30:00.000Z`,
            references: [
              {
                id: 1,
                type: "daily_video",
                uid: "daily-meeting-ref",
                meetingId: "daily123",
                meetingUrl: "https://daily.co/meeting123",
                meetingPassword: "pass123",
                credentialId: 1,
                deleted: null,
              },
              {
                id: 2,
                type: "google_calendar",
                uid: "gcal-event-ref",
                meetingId: "gcal456",
                meetingUrl: null,
                meetingPassword: null,
                credentialId: 2,
                deleted: null,
              },
            ],
          },
        ],
        organizer,
        apps: [TestData.apps["daily-video"], TestData.apps["google-calendar"]],
      })
    );

    mockSuccessfulVideoMeetingCreation({
      metadataLookupKey: "dailyvideo",
      videoMeetingData: {
        id: "MOCK_ID",
        password: "MOCK_PASS",
        url: `http://mock-dailyvideo.example.com/meeting-references`,
      },
    });

    mockCalendarToHaveNoBusySlots("googlecalendar", {
      create: {
        id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID_REFERENCES",
      },
    });

    const result = await handleCancelBooking({
      bookingData: {
        id: idOfBookingToBeCancelled,
        uid: uidOfBookingToBeCancelled,
        cancelledBy: organizer.email,
        cancellationReason: "Testing booking reference cleanup",
      },
      userId: organizer.id,
    });

    expect(result.success).toBe(true);
    expect(result.onlyRemovedAttendee).toBe(false);
    expect(result.bookingId).toBe(idOfBookingToBeCancelled);
  });

  describe("Cancellation Reason Requirement", () => {
    test("Should block host cancellation without reason when requiresCancellationReason is MANDATORY_BOTH", async () => {
      const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

      const uidOfBookingToBeCancelled = "mandatory-both-host-test";
      const idOfBookingToBeCancelled = 8001;
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 30,
              length: 30,
              requiresCancellationReason: "MANDATORY_BOTH",
              users: [{ id: 101 }],
            },
          ],
          bookings: [
            {
              id: idOfBookingToBeCancelled,
              uid: uidOfBookingToBeCancelled,
              eventTypeId: 1,
              userId: 101,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
              status: BookingStatus.ACCEPTED,
              startTime: `${plus1DateString}T05:00:00.000Z`,
              endTime: `${plus1DateString}T05:30:00.000Z`,
            },
          ],
          organizer,
          apps: [TestData.apps["daily-video"]],
        })
      );

      await expect(
        handleCancelBooking({
          bookingData: {
            id: idOfBookingToBeCancelled,
            uid: uidOfBookingToBeCancelled,
            cancelledBy: organizer.email,
          },
        })
      ).rejects.toThrow("Cancellation reason is required");
    });

    test("Should block attendee cancellation without reason when requiresCancellationReason is MANDATORY_BOTH", async () => {
      const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

      const uidOfBookingToBeCancelled = "mandatory-both-attendee-test";
      const idOfBookingToBeCancelled = 8002;
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 30,
              length: 30,
              requiresCancellationReason: "MANDATORY_BOTH",
              users: [{ id: 101 }],
            },
          ],
          bookings: [
            {
              id: idOfBookingToBeCancelled,
              uid: uidOfBookingToBeCancelled,
              eventTypeId: 1,
              userId: 101,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
              status: BookingStatus.ACCEPTED,
              startTime: `${plus1DateString}T05:00:00.000Z`,
              endTime: `${plus1DateString}T05:30:00.000Z`,
            },
          ],
          organizer,
          apps: [TestData.apps["daily-video"]],
        })
      );

      await expect(
        handleCancelBooking({
          bookingData: {
            id: idOfBookingToBeCancelled,
            uid: uidOfBookingToBeCancelled,
            cancelledBy: booker.email,
          },
        })
      ).rejects.toThrow("Cancellation reason is required");
    });

    test("Should block attendee cancellation without reason when requiresCancellationReason is MANDATORY_ATTENDEE_ONLY", async () => {
      const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

      const uidOfBookingToBeCancelled = "mandatory-attendee-only-test";
      const idOfBookingToBeCancelled = 8003;
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 30,
              length: 30,
              requiresCancellationReason: "MANDATORY_ATTENDEE_ONLY",
              users: [{ id: 101 }],
            },
          ],
          bookings: [
            {
              id: idOfBookingToBeCancelled,
              uid: uidOfBookingToBeCancelled,
              eventTypeId: 1,
              userId: 101,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
              status: BookingStatus.ACCEPTED,
              startTime: `${plus1DateString}T05:00:00.000Z`,
              endTime: `${plus1DateString}T05:30:00.000Z`,
            },
          ],
          organizer,
          apps: [TestData.apps["daily-video"]],
        })
      );

      await expect(
        handleCancelBooking({
          bookingData: {
            id: idOfBookingToBeCancelled,
            uid: uidOfBookingToBeCancelled,
            cancelledBy: booker.email,
          },
        })
      ).rejects.toThrow("Cancellation reason is required");
    });

    test("Should allow host cancellation without reason when requiresCancellationReason is MANDATORY_ATTENDEE_ONLY", async () => {
      const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

      const uidOfBookingToBeCancelled = "mandatory-attendee-host-allowed-test";
      const idOfBookingToBeCancelled = 8004;
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 30,
              length: 30,
              requiresCancellationReason: "MANDATORY_ATTENDEE_ONLY",
              users: [{ id: 101 }],
            },
          ],
          bookings: [
            {
              id: idOfBookingToBeCancelled,
              uid: uidOfBookingToBeCancelled,
              eventTypeId: 1,
              userId: 101,
              attendees: [{ email: booker.email, timeZone: "Asia/Kolkata" }],
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
              status: BookingStatus.ACCEPTED,
              startTime: `${plus1DateString}T05:00:00.000Z`,
              endTime: `${plus1DateString}T05:30:00.000Z`,
            },
          ],
          organizer,
          apps: [TestData.apps["daily-video"]],
        })
      );

      mockSuccessfulVideoMeetingCreation({
        metadataLookupKey: "dailyvideo",
        videoMeetingData: {
          id: "MOCK_ID",
          password: "MOCK_PASS",
          url: `http://mock-dailyvideo.example.com/meeting-attendee-only`,
        },
      });

      mockCalendarToHaveNoBusySlots("googlecalendar", {
        create: {
          id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID_ATTENDEE_ONLY",
        },
      });

      const result = await handleCancelBooking({
        bookingData: {
          id: idOfBookingToBeCancelled,
          uid: uidOfBookingToBeCancelled,
          cancelledBy: organizer.email,
        },
      });

      expect(result.success).toBe(true);
    });

    test("Should allow host cancellation without reason when requiresCancellationReason is OPTIONAL_BOTH", async () => {
      const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

      const uidOfBookingToBeCancelled = "optional-both-host-test";
      const idOfBookingToBeCancelled = 8005;
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 30,
              length: 30,
              requiresCancellationReason: "OPTIONAL_BOTH",
              users: [{ id: 101 }],
            },
          ],
          bookings: [
            {
              id: idOfBookingToBeCancelled,
              uid: uidOfBookingToBeCancelled,
              eventTypeId: 1,
              userId: 101,
              attendees: [{ email: booker.email, timeZone: "Asia/Kolkata" }],
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
              status: BookingStatus.ACCEPTED,
              startTime: `${plus1DateString}T05:00:00.000Z`,
              endTime: `${plus1DateString}T05:30:00.000Z`,
            },
          ],
          organizer,
          apps: [TestData.apps["daily-video"]],
        })
      );

      mockSuccessfulVideoMeetingCreation({
        metadataLookupKey: "dailyvideo",
        videoMeetingData: {
          id: "MOCK_ID",
          password: "MOCK_PASS",
          url: `http://mock-dailyvideo.example.com/meeting-optional-host`,
        },
      });

      mockCalendarToHaveNoBusySlots("googlecalendar", {
        create: {
          id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID_OPTIONAL_HOST",
        },
      });

      const result = await handleCancelBooking({
        bookingData: {
          id: idOfBookingToBeCancelled,
          uid: uidOfBookingToBeCancelled,
          cancelledBy: organizer.email,
        },
      });

      expect(result.success).toBe(true);
    });

    test("Should allow attendee cancellation without reason when requiresCancellationReason is OPTIONAL_BOTH", async () => {
      const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

      const uidOfBookingToBeCancelled = "optional-both-attendee-test";
      const idOfBookingToBeCancelled = 8006;
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 30,
              length: 30,
              requiresCancellationReason: "OPTIONAL_BOTH",
              users: [{ id: 101 }],
            },
          ],
          bookings: [
            {
              id: idOfBookingToBeCancelled,
              uid: uidOfBookingToBeCancelled,
              eventTypeId: 1,
              userId: 101,
              attendees: [{ email: booker.email, timeZone: "Asia/Kolkata" }],
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
              status: BookingStatus.ACCEPTED,
              startTime: `${plus1DateString}T05:00:00.000Z`,
              endTime: `${plus1DateString}T05:30:00.000Z`,
            },
          ],
          organizer,
          apps: [TestData.apps["daily-video"]],
        })
      );

      mockSuccessfulVideoMeetingCreation({
        metadataLookupKey: "dailyvideo",
        videoMeetingData: {
          id: "MOCK_ID",
          password: "MOCK_PASS",
          url: `http://mock-dailyvideo.example.com/meeting-optional-attendee`,
        },
      });

      mockCalendarToHaveNoBusySlots("googlecalendar", {
        create: {
          id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID_OPTIONAL_ATTENDEE",
        },
      });

      const result = await handleCancelBooking({
        bookingData: {
          id: idOfBookingToBeCancelled,
          uid: uidOfBookingToBeCancelled,
          cancelledBy: booker.email,
        },
      });

      expect(result.success).toBe(true);
    });

    test("Should allow attendee cancellation without reason when requiresCancellationReason is MANDATORY_HOST_ONLY", async () => {
      const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

      const uidOfBookingToBeCancelled = "mandatory-host-attendee-allowed-test";
      const idOfBookingToBeCancelled = 8007;
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 30,
              length: 30,
              requiresCancellationReason: "MANDATORY_HOST_ONLY",
              users: [{ id: 101 }],
            },
          ],
          bookings: [
            {
              id: idOfBookingToBeCancelled,
              uid: uidOfBookingToBeCancelled,
              eventTypeId: 1,
              userId: 101,
              attendees: [{ email: booker.email, timeZone: "Asia/Kolkata" }],
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
              status: BookingStatus.ACCEPTED,
              startTime: `${plus1DateString}T05:00:00.000Z`,
              endTime: `${plus1DateString}T05:30:00.000Z`,
            },
          ],
          organizer,
          apps: [TestData.apps["daily-video"]],
        })
      );

      mockSuccessfulVideoMeetingCreation({
        metadataLookupKey: "dailyvideo",
        videoMeetingData: {
          id: "MOCK_ID",
          password: "MOCK_PASS",
          url: `http://mock-dailyvideo.example.com/meeting-host-only-attendee`,
        },
      });

      mockCalendarToHaveNoBusySlots("googlecalendar", {
        create: {
          id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID_HOST_ONLY_ATTENDEE",
        },
      });

      const result = await handleCancelBooking({
        bookingData: {
          id: idOfBookingToBeCancelled,
          uid: uidOfBookingToBeCancelled,
          cancelledBy: booker.email,
        },
      });

      expect(result.success).toBe(true);
    });

    test("Should block host cancellation without reason when requiresCancellationReason is null (default behavior)", async () => {
      const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

      const uidOfBookingToBeCancelled = "null-default-host-test";
      const idOfBookingToBeCancelled = 8008;
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 30,
              length: 30,
              users: [{ id: 101 }],
            },
          ],
          bookings: [
            {
              id: idOfBookingToBeCancelled,
              uid: uidOfBookingToBeCancelled,
              eventTypeId: 1,
              userId: 101,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
              status: BookingStatus.ACCEPTED,
              startTime: `${plus1DateString}T05:00:00.000Z`,
              endTime: `${plus1DateString}T05:30:00.000Z`,
            },
          ],
          organizer,
          apps: [TestData.apps["daily-video"]],
        })
      );

      await expect(
        handleCancelBooking({
          bookingData: {
            id: idOfBookingToBeCancelled,
            uid: uidOfBookingToBeCancelled,
            cancelledBy: organizer.email,
          },
        })
      ).rejects.toThrow("Cancellation reason is required");
    });

    test("Should allow attendee cancellation without reason when requiresCancellationReason is null (default behavior)", async () => {
      const handleCancelBooking = (await import("@calcom/features/bookings/lib/handleCancelBooking")).default;

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

      const uidOfBookingToBeCancelled = "null-default-attendee-test";
      const idOfBookingToBeCancelled = 8009;
      const { dateString: plus1DateString } = getDate({ dateIncrement: 1 });

      await createBookingScenario(
        getScenarioData({
          eventTypes: [
            {
              id: 1,
              slotInterval: 30,
              length: 30,
              users: [{ id: 101 }],
            },
          ],
          bookings: [
            {
              id: idOfBookingToBeCancelled,
              uid: uidOfBookingToBeCancelled,
              eventTypeId: 1,
              userId: 101,
              attendees: [{ email: booker.email, timeZone: "Asia/Kolkata" }],
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: BookingLocations.CalVideo },
              },
              status: BookingStatus.ACCEPTED,
              startTime: `${plus1DateString}T05:00:00.000Z`,
              endTime: `${plus1DateString}T05:30:00.000Z`,
            },
          ],
          organizer,
          apps: [TestData.apps["daily-video"]],
        })
      );

      mockSuccessfulVideoMeetingCreation({
        metadataLookupKey: "dailyvideo",
        videoMeetingData: {
          id: "MOCK_ID",
          password: "MOCK_PASS",
          url: `http://mock-dailyvideo.example.com/meeting-null-default`,
        },
      });

      mockCalendarToHaveNoBusySlots("googlecalendar", {
        create: {
          id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID_NULL_DEFAULT",
        },
      });

      const result = await handleCancelBooking({
        bookingData: {
          id: idOfBookingToBeCancelled,
          uid: uidOfBookingToBeCancelled,
          cancelledBy: booker.email,
        },
      });

      expect(result.success).toBe(true);
    });
  });
});
