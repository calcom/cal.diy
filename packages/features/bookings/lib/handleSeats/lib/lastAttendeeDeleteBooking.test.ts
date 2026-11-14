import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";

import { BookingStatus } from "@calcom/prisma/enums";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { OriginalRescheduledBooking } from "../../handleNewBooking/originalRescheduledBookingUtils";
import lastAttendeeDeleteBooking from "./lastAttendeeDeleteBooking";

const { deleteMeetingMock, deleteEventMock }: { deleteMeetingMock: Mock; deleteEventMock: Mock } = vi.hoisted(
  () => ({
    deleteMeetingMock: vi.fn(),
    deleteEventMock: vi.fn(),
  })
);

vi.mock("@calcom/features/conferencing/lib/videoClient", () => ({
  deleteMeeting: deleteMeetingMock,
}));

vi.mock("@calcom/app-store/_utils/getCalendar", () => ({
  getCalendar: vi.fn().mockResolvedValue({ deleteEvent: deleteEventMock }),
}));

vi.mock("@calcom/app-store/delegationCredential", () => ({
  getAllDelegationCredentialsForUserIncludeServiceAccountKey: vi.fn().mockResolvedValue([]),
  getDelegationCredentialOrFindRegularCredential: vi.fn().mockResolvedValue({ id: 1 }),
}));

const originalBooking = {
  id: 10,
  user: { id: 1, email: "organizer@example.com" },
  references: [
    { type: "zoom_video", uid: "zoom-meeting-id", credentialId: 1, delegationCredentialId: null },
    {
      type: "google_calendar",
      uid: "google-event-id",
      credentialId: 2,
      delegationCredentialId: null,
      externalCalendarId: "primary",
    },
  ],
} as unknown as NonNullable<OriginalRescheduledBooking>;

const originalBookingEvt = { uid: "booking-uid" } as CalendarEvent;

describe("lastAttendeeDeleteBooking", () => {
  beforeEach(() => {
    deleteMeetingMock.mockReset();
    deleteEventMock.mockReset();
  });

  test("deletes the integrations and cancels the booking when the last attendee leaves", async () => {
    deleteMeetingMock.mockResolvedValue({});
    deleteEventMock.mockResolvedValue({});

    const deleted = await lastAttendeeDeleteBooking(originalBooking, [], originalBookingEvt);

    expect(deleted).toBe(true);
    expect(deleteMeetingMock).toHaveBeenCalledWith({ id: 1 }, "zoom-meeting-id");
    expect(deleteEventMock).toHaveBeenCalledWith("google-event-id", originalBookingEvt, "primary");
    expect(prismaMock.booking.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { status: BookingStatus.CANCELLED },
    });
  });

  test("still cancels the booking when deleting a video meeting fails", async () => {
    deleteMeetingMock.mockRejectedValue(new Error("Zoom API returned 500"));
    deleteEventMock.mockResolvedValue({});

    const deleted = await lastAttendeeDeleteBooking(originalBooking, [], originalBookingEvt);

    expect(deleted).toBe(true);
    expect(deleteEventMock).toHaveBeenCalled();
    expect(prismaMock.booking.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { status: BookingStatus.CANCELLED },
    });
  });

  test("still cancels the booking when deleting a calendar event fails", async () => {
    deleteMeetingMock.mockResolvedValue({});
    deleteEventMock.mockRejectedValue(new Error("Calendar event not found"));

    const deleted = await lastAttendeeDeleteBooking(originalBooking, [], originalBookingEvt);

    expect(deleted).toBe(true);
    expect(prismaMock.booking.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { status: BookingStatus.CANCELLED },
    });
  });

  test("does nothing while other attendees remain on the booking", async () => {
    const deleted = await lastAttendeeDeleteBooking(
      originalBooking,
      [{ email: "other@example.com" }],
      originalBookingEvt
    );

    expect(deleted).toBe(false);
    expect(deleteMeetingMock).not.toHaveBeenCalled();
    expect(deleteEventMock).not.toHaveBeenCalled();
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });
});
