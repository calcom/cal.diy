import { describe, it, expect } from "vitest";

import { BookingStatus, SchedulingType , DisableCancelling } from "@calcom/prisma/enums";

import {
  getPendingActions,
  getCancelEventAction,
  getVideoOptionsActions,
  getEditEventActions,
  getAfterEventActions,
  shouldShowPendingActions,
  shouldShowEditActions,
  shouldShowRecurringCancelAction,
  isActionDisabled,
  getActionLabel,
  type BookingActionContext,
} from "./bookingActions";

const mockT = (key: string) => key;

function createMockContext(overrides: Partial<BookingActionContext> = {}): BookingActionContext {
  const now = new Date();
  const startTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour later

  return {
    booking: {
      id: 1,
      uid: "booking-123",
      title: "Test Meeting",
      description: "Test meeting description",
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      createdAt: now,
      updatedAt: now,
      status: BookingStatus.ACCEPTED,
      paid: false,
      fromReschedule: null,
      recurringEventId: null,
      rescheduled: false,
      isRecorded: false,
      rescheduler: null,
      userPrimaryEmail: "organizer@example.com",
      customInputs: {},
      responses: {},
      references: [],
      attendees: [
        {
          id: 1,
          name: "John Doe",
          email: "john@example.com",
          timeZone: "America/New_York",
          phoneNumber: null,
          locale: "en",
          bookingId: 1,
          noShow: false,
        },
      ],
      user: {
        id: 1,
        name: "Organizer",
        email: "organizer@example.com",
      },
      eventType: {
        id: 1,
        title: "Test Event Type",
        slug: "test-event",
        length: 60,
        schedulingType: SchedulingType.COLLECTIVE,
        team: null,
        eventTypeColor: {
          lightEventTypeColor: "#000000",
          darkEventTypeColor: "#ffffff",
        },
        disableCancelling: false,
        disableRescheduling: false,
        disableGuests: false,
        allowReschedulingPastBookings: false,
        recurringEvent: null,
        price: 0,
        currency: "usd",
        metadata: {},
      },
      location: "integrations:daily",
      payment: [],
      seatsReferences: [],
      assignmentReasonSortedByCreatedAt: [],
      metadata: null,
      listingStatus: "upcoming",
      recurringInfo: undefined,
      loggedInUser: {
        userId: 1,
        userTimeZone: "America/New_York",
        userTimeFormat: 12,
        userEmail: "organizer@example.com",
      },
      isToday: false,
    },
    isUpcoming: true,
    isOngoing: false,
    isBookingInPast: false,
    isCancelled: false,
    isConfirmed: true,
    isRejected: false,
    isPending: false,
    isRescheduled: false,
    isRecurring: false,
    isTabRecurring: false,
    isTabUnconfirmed: false,
    isDisabledCancelling: DisableCancelling.NOBODY,
    isDisabledRescheduling: false,
    isCalVideoLocation: true,
    showPendingPayment: false,
    cardCharged: false,
    attendeeList: [
      {
        name: "John Doe",
        email: "john@example.com",
        id: 1,
        noShow: false,
        phoneNumber: null,
      },
    ],
    getSeatReferenceUid: () => undefined,
    t: mockT,
    ...overrides,
  } as BookingActionContext;
}

describe("Booking Actions", () => {
  describe("getPendingActions", () => {
    it("should return reject action for pending booking", () => {
      const context = createMockContext({ isPending: true });
      const actions = getPendingActions(context);

      expect(actions).toHaveLength(2);
      expect(actions[0]).toEqual({
        id: "confirm",
        bookingUid: "booking-123",
        label: "confirm",
        icon: "check",
        disabled: false,
      });
      expect(actions[1]).toEqual({
        id: "reject",
        label: "reject",
        icon: "ban",
        disabled: false,
      });
    });

    it("should return reject action only for non-pending booking", () => {
      const context = createMockContext({ isPending: false });
      const actions = getPendingActions(context);

      expect(actions).toHaveLength(1);
      expect(actions[0].id).toBe("reject");
    });

    it("should use correct labels for recurring bookings", () => {
      const context = createMockContext({
        isPending: true,
        isRecurring: true,
        isTabRecurring: true,
      });
      const actions = getPendingActions(context);

      expect(actions[0].label).toBe("confirm_all");
      expect(actions[1].label).toBe("reject_all");
    });
  });

  describe("getCancelEventAction", () => {
    it("should return cancel action with correct properties", () => {
      const context = createMockContext();
      const action = getCancelEventAction(context);

      expect(action).toEqual({
        id: "cancel",
        label: "cancel_event",
        icon: "circle-x",
        color: "destructive",
        disabled: false,
        bookingUid: "booking-123",
      });
    });

    it("should be disabled when cancellation is disabled for both host and guests", () => {
      const context = createMockContext({ isDisabledCancelling: DisableCancelling.BOTH_HOST_GUESTS});
      const action = getCancelEventAction(context);

      expect(action.disabled).toBe(true);
    });

    it("should be disabled when cancellation is disabled for guests and current logged in user is a guest", () => {
      const context = createMockContext({ isDisabledCancelling: DisableCancelling.GUESTS});
      context.booking.loggedInUser = {
        userId: 4,
        userTimeZone: "Asia/Calcutta",
        userTimeFormat: 12,
        userEmail: "pro@example.com",
      }

      const action = getCancelEventAction(context);
      expect(action.disabled).toBe(true);
    });

    it("should be enabled when cancellation is disabled for guests and current logged in user is host", () => {
      const context = createMockContext({ isDisabledCancelling: DisableCancelling.GUESTS});

      const action = getCancelEventAction(context);
      expect(action.disabled).toBe(false);
    });

    it("should be disabled for past pending bookings", () => {
      const context = createMockContext({
        isBookingInPast: true,
        isPending: true,
        isConfirmed: false,
      });
      const action = getCancelEventAction(context);

      expect(action.disabled).toBe(true);
    });

    it("should include recurring parameters for recurring bookings", () => {
      const context = createMockContext({
        isRecurring: true,
        isTabRecurring: true,
      });
      const action = getCancelEventAction(context);

      expect(action.label).toBe("cancel_all_remaining");
    });
  });

  describe("getVideoOptionsActions", () => {
    it("should return video actions for past confirmed bookings", () => {
      const context = createMockContext({
        isBookingInPast: true,
        isConfirmed: true,
        isCalVideoLocation: true,
        booking: {
          ...createMockContext().booking,
          isRecorded: true,
        },
      });
      const actions = getVideoOptionsActions(context);

      expect(actions).toHaveLength(2);
      expect(actions[0].id).toBe("view_recordings");
      expect(actions[1].id).toBe("meeting_session_details");
      expect(actions[0].disabled).toBe(false);
      expect(actions[1].disabled).toBe(false);
    });

    it("should disable video actions for upcoming bookings", () => {
      const context = createMockContext({ isBookingInPast: false });
      const actions = getVideoOptionsActions(context);

      expect(actions[0].disabled).toBe(true);
      expect(actions[1].disabled).toBe(true);
    });

    it("should disable video actions for non-Cal video locations", () => {
      const context = createMockContext({
        isBookingInPast: true,
        isConfirmed: true,
        isCalVideoLocation: false,
      });
      const actions = getVideoOptionsActions(context);

      expect(actions[0].disabled).toBe(true);
      expect(actions[1].disabled).toBe(true);
    });
  });

  describe("getEditEventActions", () => {
    it("should return basic edit actions", () => {
      const context = createMockContext();
      const actions = getEditEventActions(context);

      const actionIds = actions.map((a) => a.id);
      expect(actionIds).toContain("reschedule");
      expect(actionIds).toContain("reschedule_request");
      expect(actionIds).toContain("change_location");
      expect(actionIds).toContain("add_members");
    });

    it("should include reassign action for round robin events with no host groups", () => {
      const context = createMockContext({
        booking: {
          ...createMockContext().booking,
          eventType: {
            ...createMockContext().booking.eventType,
            schedulingType: SchedulingType.ROUND_ROBIN,
            hostGroups: [],
          },
        },
      });
      const actions = getEditEventActions(context);

      const reassignAction = actions.find((a) => a.id === "reassign");
      expect(reassignAction).toBeDefined();
    });

    it("should include reassign action for round robin events with one host group", () => {
      const context = createMockContext({
        booking: {
          ...createMockContext().booking,
          eventType: {
            ...createMockContext().booking.eventType,
            schedulingType: SchedulingType.ROUND_ROBIN,
            hostGroups: [{ id: "group-1", name: "Group 1" }],
          },
        },
      });
      const actions = getEditEventActions(context);

      const reassignAction = actions.find((a) => a.id === "reassign");
      expect(reassignAction).toBeDefined();
    });

    it("should exclude reassign action for round robin events with more than one host groups", () => {
      const context = createMockContext({
        booking: {
          ...createMockContext().booking,
          eventType: {
            ...createMockContext().booking.eventType,
            schedulingType: SchedulingType.ROUND_ROBIN,
            hostGroups: [
              { id: "group-1", name: "Group 1" },
              { id: "group-2", name: "Group 2" },
            ],
          },
        },
      });
      const actions = getEditEventActions(context);

      const reassignAction = actions.find((a) => a.id === "reassign");
      expect(reassignAction).toBeUndefined();
    });

    it("should exclude reassign action for non-round-robin events", () => {
      const context = createMockContext({
        booking: {
          ...createMockContext().booking,
          eventType: {
            ...createMockContext().booking.eventType,
            schedulingType: SchedulingType.COLLECTIVE,
            hostGroups: [],
          },
        },
      });
      const actions = getEditEventActions(context);

      const reassignAction = actions.find((a) => a.id === "reassign");
      expect(reassignAction).toBeUndefined();
    });

    it("should exclude add_members when guests are disabled", () => {
      const context = createMockContext({
        booking: {
          ...createMockContext().booking,
          eventType: {
            ...createMockContext().booking.eventType,
            disableGuests: true,
          },
        },
      });
      const actions = getEditEventActions(context);

      const addMembersAction = actions.find((a) => a.id === "add_members");
      expect(addMembersAction).toBeUndefined();
    });

    it("should disable reschedule actions when rescheduling is disabled", () => {
      const context = createMockContext({ isDisabledRescheduling: true });
      const actions = getEditEventActions(context);

      const rescheduleAction = actions.find((a) => a.id === "reschedule");
      const rescheduleRequestAction = actions.find((a) => a.id === "reschedule_request");

      expect(rescheduleAction?.disabled).toBe(true);
      expect(rescheduleRequestAction?.disabled).toBe(true);
    });

    it("should disable change_location for past bookings", () => {
      const context = createMockContext({ isBookingInPast: true });
      const actions = getEditEventActions(context);

      const changeLocationAction = actions.find((a) => a.id === "change_location");
      expect(changeLocationAction?.disabled).toBe(true);
    });

    it("should disable change_location for cancelled bookings", () => {
      const context = createMockContext({ isCancelled: true });
      const actions = getEditEventActions(context);

      const changeLocationAction = actions.find((a) => a.id === "change_location");
      expect(changeLocationAction?.disabled).toBe(true);
    });

    it("should disable add_members for rejected bookings", () => {
      const context = createMockContext({ isRejected: true });
      const actions = getEditEventActions(context);

      const addMembersAction = actions.find((a) => a.id === "add_members");
      expect(addMembersAction?.disabled).toBe(true);
    });

    it("should disable reassign for cancelled round robin bookings", () => {
      const context = createMockContext({
        isCancelled: true,
        booking: {
          ...createMockContext().booking,
          eventType: {
            ...createMockContext().booking.eventType,
            schedulingType: SchedulingType.ROUND_ROBIN,
            hostGroups: [],
          },
        },
      });
      const actions = getEditEventActions(context);

      const reassignAction = actions.find((a) => a.id === "reassign");
      expect(reassignAction?.disabled).toBe(true);
    });

    it("should enable edit actions for upcoming active bookings", () => {
      const context = createMockContext({
        isBookingInPast: false,
        isCancelled: false,
        isRejected: false,
        booking: {
          ...createMockContext().booking,
          eventType: {
            ...createMockContext().booking.eventType,
            schedulingType: SchedulingType.ROUND_ROBIN,
            hostGroups: [],
          },
        },
      });
      const actions = getEditEventActions(context);

      const changeLocationAction = actions.find((a) => a.id === "change_location");
      const addMembersAction = actions.find((a) => a.id === "add_members");
      const reassignAction = actions.find((a) => a.id === "reassign");

      expect(changeLocationAction?.disabled).toBe(false);
      expect(addMembersAction?.disabled).toBe(false);
      expect(reassignAction?.disabled).toBe(false);
    });
  });

  describe("getAfterEventActions", () => {
    it("should include video actions and no-show action", () => {
      const context = createMockContext({ isBookingInPast: true, isConfirmed: true });
      const actions = getAfterEventActions(context);

      const actionIds = actions.map((a) => a.id);
      expect(actionIds).toContain("view_recordings");
      expect(actionIds).toContain("meeting_session_details");
      expect(actionIds).toContain("no_show");
    });

    it("should include charge card action for held payments", () => {
      const context = createMockContext({
        booking: {
          ...createMockContext().booking,
          status: BookingStatus.ACCEPTED,
          paid: true,
          payment: [
            {
              paymentOption: "HOLD",
              amount: 1000,
              currency: "usd",
              success: true,
              appId: null,
              refunded: false,
            },
          ],
        },
      });
      const actions = getAfterEventActions(context);

      const chargeCardAction = actions.find((a) => a.id === "charge_card");
      expect(chargeCardAction).toBeDefined();
    });

    it("should show correct no-show label for single attendee", () => {
      const context = createMockContext({
        attendeeList: [{ name: "John", email: "john@example.com", id: 1, noShow: true, phoneNumber: null }],
      });
      const actions = getAfterEventActions(context);

      const noShowAction = actions.find((a) => a.id === "no_show");
      expect(noShowAction?.label).toBe("unmark_as_no_show");
      expect(noShowAction?.icon).toBe("eye");
    });
  });

  describe("shouldShowPendingActions", () => {
    it("should return true for pending upcoming bookings", () => {
      const context = createMockContext({ isPending: true, isUpcoming: true, isCancelled: false });
      expect(shouldShowPendingActions(context)).toBe(true);
    });

    it("should return false for cancelled bookings", () => {
      const context = createMockContext({ isPending: true, isUpcoming: true, isCancelled: true });
      expect(shouldShowPendingActions(context)).toBe(false);
    });

    it("should return false for past bookings", () => {
      const context = createMockContext({ isPending: true, isUpcoming: false, isCancelled: false });
      expect(shouldShowPendingActions(context)).toBe(false);
    });
  });

  describe("shouldShowEditActions", () => {
    it("should return true for confirmed upcoming bookings", () => {
      const context = createMockContext({ isPending: false, isCancelled: false });
      expect(shouldShowEditActions(context)).toBe(true);
    });

    it("should return false for pending bookings", () => {
      const context = createMockContext({ isPending: true });
      expect(shouldShowEditActions(context)).toBe(false);
    });

    it("should return false for cancelled bookings", () => {
      const context = createMockContext({ isCancelled: true });
      expect(shouldShowEditActions(context)).toBe(false);
    });
  });

  describe("shouldShowRecurringCancelAction", () => {
    it("should return true for recurring bookings in recurring tab", () => {
      const context = createMockContext({ isTabRecurring: true, isRecurring: true });
      expect(shouldShowRecurringCancelAction(context)).toBe(true);
    });

    it("should return false for non-recurring bookings", () => {
      const context = createMockContext({ isTabRecurring: true, isRecurring: false });
      expect(shouldShowRecurringCancelAction(context)).toBe(false);
    });
  });

  describe("isActionDisabled", () => {
    it("should disable reschedule actions when rescheduling is disabled", () => {
      const context = createMockContext({ isDisabledRescheduling: true });

      expect(isActionDisabled("reschedule", context)).toBe(true);
      expect(isActionDisabled("reschedule_request", context)).toBe(true);
    });

    it("should disable cancel action when cancellation is disabled for both host and guest", () => {
      const context = createMockContext({ isDisabledCancelling: DisableCancelling.BOTH_HOST_GUESTS });

      expect(isActionDisabled("cancel", context)).toBe(true);
    });

    it("should be disabled when cancellation is disabled for guests and current logged in user is a guest", () => {
      const context = createMockContext({ isDisabledCancelling: DisableCancelling.GUESTS});
      context.booking.loggedInUser = {
        userId: 4,
        userTimeZone: "Asia/Calcutta",
        userTimeFormat: 12,
        userEmail: "pro@example.com",
      }

      expect(isActionDisabled("cancel", context)).toBe(true);
    });

    it("should be enabled when cancellation is disabled for guests and current logged in user is host", () => {
      const context = createMockContext({ isDisabledCancelling: DisableCancelling.GUESTS});

      const action = getCancelEventAction(context);
      expect(isActionDisabled("cancel", context)).toBe(false);
    });

    it("should disable cancelling all past bookings", () => {
      const pastConfirmedContext = createMockContext({
        isBookingInPast: true,
        isPending: false,
        isConfirmed: true,
      });

      const pastPendingContext = createMockContext({
        isBookingInPast: true,
        isPending: true,
        isConfirmed: false,
      });

      // Current implementation blocks ALL past bookings
      expect(isActionDisabled("cancel", pastConfirmedContext)).toBe(true);
      expect(isActionDisabled("cancel", pastPendingContext)).toBe(true);
    });

    it("should allow cancelling future bookings when cancelling is not disabled", () => {
      const futureContext = createMockContext({
        isBookingInPast: false,
        isPending: true,
        isConfirmed: false,
      });

      expect(isActionDisabled("cancel", futureContext)).toBe(false);
    });

    it("should disable video actions for non-past bookings", () => {
      const context = createMockContext({ isBookingInPast: false });

      expect(isActionDisabled("view_recordings", context)).toBe(true);
      expect(isActionDisabled("meeting_session_details", context)).toBe(true);
    });

    it("should disable charge card action when already charged", () => {
      const context = createMockContext({ cardCharged: true });

      expect(isActionDisabled("charge_card", context)).toBe(true);
    });

    describe("change_location action", () => {
      it("should be disabled for past bookings", () => {
        const context = createMockContext({ isBookingInPast: true });
        expect(isActionDisabled("change_location", context)).toBe(true);
      });

      it("should be disabled for cancelled bookings", () => {
        const context = createMockContext({ isCancelled: true });
        expect(isActionDisabled("change_location", context)).toBe(true);
      });

      it("should be disabled for rejected bookings", () => {
        const context = createMockContext({ isRejected: true });
        expect(isActionDisabled("change_location", context)).toBe(true);
      });

      it("should be enabled for upcoming active bookings", () => {
        const context = createMockContext({
          isBookingInPast: false,
          isCancelled: false,
          isRejected: false,
        });
        expect(isActionDisabled("change_location", context)).toBe(false);
      });
    });

    describe("add_members action", () => {
      it("should be disabled for past bookings", () => {
        const context = createMockContext({ isBookingInPast: true });
        expect(isActionDisabled("add_members", context)).toBe(true);
      });

      it("should be disabled for cancelled bookings", () => {
        const context = createMockContext({ isCancelled: true });
        expect(isActionDisabled("add_members", context)).toBe(true);
      });

      it("should be disabled for rejected bookings", () => {
        const context = createMockContext({ isRejected: true });
        expect(isActionDisabled("add_members", context)).toBe(true);
      });

      it("should be enabled for upcoming active bookings", () => {
        const context = createMockContext({
          isBookingInPast: false,
          isCancelled: false,
          isRejected: false,
        });
        expect(isActionDisabled("add_members", context)).toBe(false);
      });
    });

    describe("reassign action", () => {
      it("should be disabled for past bookings", () => {
        const context = createMockContext({ isBookingInPast: true });
        expect(isActionDisabled("reassign", context)).toBe(true);
      });

      it("should be disabled for cancelled bookings", () => {
        const context = createMockContext({ isCancelled: true });
        expect(isActionDisabled("reassign", context)).toBe(true);
      });

      it("should be disabled for rejected bookings", () => {
        const context = createMockContext({ isRejected: true });
        expect(isActionDisabled("reassign", context)).toBe(true);
      });

      it("should be enabled for upcoming active bookings", () => {
        const context = createMockContext({
          isBookingInPast: false,
          isCancelled: false,
          isRejected: false,
        });
        expect(isActionDisabled("reassign", context)).toBe(false);
      });
    });

    describe("cancel action with cancelled/rejected states", () => {
      it("should be disabled for already cancelled bookings", () => {
        const context = createMockContext({ isCancelled: true });
        expect(isActionDisabled("cancel", context)).toBe(true);
      });

      it("should be disabled for rejected bookings", () => {
        const context = createMockContext({ isRejected: true });
        expect(isActionDisabled("cancel", context)).toBe(true);
      });
    });

    describe("reschedule_request action with cancelled/rejected states", () => {
      it("should be disabled for cancelled bookings", () => {
        const context = createMockContext({ isCancelled: true });
        expect(isActionDisabled("reschedule_request", context)).toBe(true);
      });

      it("should be disabled for rejected bookings", () => {
        const context = createMockContext({ isRejected: true });
        expect(isActionDisabled("reschedule_request", context)).toBe(true);
      });
    });
  });

  describe("getActionLabel", () => {
    it("should return correct labels for different actions", () => {
      const context = createMockContext();

      expect(getActionLabel("reject", context)).toBe("reject");
      expect(getActionLabel("confirm", context)).toBe("confirm");
      expect(getActionLabel("cancel", context)).toBe("cancel_event");
    });

    it("should return correct labels for recurring bookings", () => {
      const context = createMockContext({ isRecurring: true, isTabRecurring: true });

      expect(getActionLabel("reject", context)).toBe("reject_all");
      expect(getActionLabel("confirm", context)).toBe("confirm_all");
      expect(getActionLabel("cancel", context)).toBe("cancel_all_remaining");
    });

    it("should return correct no-show label based on attendee state", () => {
      const contextWithNoShow = createMockContext({
        attendeeList: [{ name: "John", email: "john@example.com", id: 1, noShow: true, phoneNumber: null }],
      });

      expect(getActionLabel("no_show", contextWithNoShow)).toBe("unmark_as_no_show");
    });
  });
});
