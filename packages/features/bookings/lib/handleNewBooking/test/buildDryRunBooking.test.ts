import { BookingStatus, CreationSource } from "@calcom/prisma/enums";
import { describe, expect, it, vi } from "vitest";
import { buildDryRunBooking } from "../../service/RegularBookingService";

vi.mock("@calcom/prisma", () => ({
  default: {}, // empty object as default export
  prisma: {},
}));

vi.mock("@calcom/app-store/delegationCredential", () => ({
  enrichHostsWithDelegationCredentials: vi.fn(),
  getUsersCredentialsIncludeServiceAccountKey: vi.fn(),
  getCredentialForSelectedCalendar: vi.fn(),
}));

vi.mock("@calcom/features/abuse-scoring/lib/hooks", () => ({
  onEventTypeChange: vi.fn(),
  onSignup: vi.fn(),
  onBookingCreated: vi.fn(),
}));

vi.mock("@calcom/features/di/watchlist/containers/SpamCheckService.container", () => ({
  getSpamCheckService: vi.fn().mockReturnValue({
    checkForSpam: vi.fn().mockResolvedValue({ isSpam: false }),
  }),
}));

vi.mock("@calcom/features/watchlist/lib/freeEmailDomainCheck/checkIfFreeEmailDomain", () => ({
  checkIfFreeEmailDomain: vi.fn().mockResolvedValue(false),
}));

describe("buildDryRunBooking", () => {
  const baseOrganizerUser = {
    id: 1,
    uuid: "test-uuid-123",
    name: "Test User",
    username: "testuser",
    email: "testuser@example.com",
    timeZone: "America/New_York",
    credentials: [
      {
        abc: "xyz",
      },
    ],
  };

  const baseInputs = {
    eventTypeId: 10,
    organizerUser: baseOrganizerUser,
    eventName: "Test Event",
    startTime: "2024-01-01T10:00:00.000Z",
    endTime: "2024-01-01T11:00:00.000Z",
    contactOwnerFromReq: "owner@example.com",
    contactOwnerEmail: "owner@example.com",
    allHostUsers: [{ id: 1 }, { id: 2 }],
    isManagedEventType: false,
  };

  it("should build a dry run booking with all provided details and nothing more than that", () => {
    const { booking, troubleshooterData } = buildDryRunBooking(baseInputs);

    const { user, ...bookingExceptUser } = booking;
    expect(user).toEqual({
      id: baseOrganizerUser.id,
      uuid: baseOrganizerUser.uuid,
      name: baseOrganizerUser.name,
      username: baseOrganizerUser.username,
      email: baseOrganizerUser.email,
      timeZone: baseOrganizerUser.timeZone,
      isPlatformManaged: false,
    });

    expect(bookingExceptUser).toEqual({
      id: -101,
      uid: "DRY_RUN_UID",
      iCalUID: "DRY_RUN_ICAL_UID",
      status: BookingStatus.ACCEPTED,
      eventTypeId: baseInputs.eventTypeId,
      userId: baseOrganizerUser.id,
      userUuid: baseOrganizerUser.uuid,
      title: baseInputs.eventName,
      startTime: new Date(baseInputs.startTime),
      endTime: new Date(baseInputs.endTime),
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
      attendees: [],
      oneTimePassword: null,
      smsReminderNumber: null,
      metadata: {},
      idempotencyKey: null,
      userPrimaryEmail: null,
      description: null,
      customInputs: null,
      responses: null,
      location: null,
      paid: false,
      cancellationReason: null,
      rejectionReason: null,
      dynamicEventSlugRef: null,
      dynamicGroupSlugRef: null,
      fromReschedule: null,
      rootBookingUid: "DRY_RUN_UID",
      recurringEventId: null,
      scheduledJobs: [],
      rescheduledBy: null,
      destinationCalendarId: null,
      reassignReason: null,
      reassignById: null,
      rescheduled: false,
      isRecorded: false,
      iCalSequence: 0,
      rating: null,
      ratingFeedback: null,
      noShowHost: null,
      cancelledBy: null,
      creationSource: CreationSource.WEBAPP,
      references: [],
      payment: [],
    });

    expect(troubleshooterData).toEqual({
      organizerUserId: baseOrganizerUser.id,
      eventTypeId: baseInputs.eventTypeId,
      askedContactOwnerEmail: baseInputs.contactOwnerFromReq,
      usedContactOwnerEmail: baseInputs.contactOwnerEmail,
      allHostUsers: [1, 2],
      isManagedEventType: baseInputs.isManagedEventType,
    });
  });
});
