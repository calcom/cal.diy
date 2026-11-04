import { beforeEach, describe, expect, test, vi } from "vitest";

type MockFunction = ReturnType<typeof vi.fn>;
const mocks: {
  eventTypeFindUnique: MockFunction;
  bookingFindUnique: MockFunction;
  moderatorRequest: MockFunction;
} = vi.hoisted(() => ({
  eventTypeFindUnique: vi.fn(),
  bookingFindUnique: vi.fn(),
  moderatorRequest: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  default: {
    eventType: { findUnique: mocks.eventTypeFindUnique },
    booking: { findUnique: mocks.bookingFindUnique },
  },
}));

vi.mock("./common", () => ({ moderatorRequest: mocks.moderatorRequest }));

import type { CalendarEvent } from "@calcom/types/Calendar";
import type { PartialReference } from "@calcom/types/EventManager";
import config from "../config.json";
import VideoApiAdapter from "./VideoApiAdapter";

const eventTypeWithServer: {
  locations: Array<{ type: string }>;
  metadata: { apps: Record<string, { userId: number; serverId: number; serverUrl: string }> };
} = {
  locations: [{ type: "integrations:toab_jitsi" }],
  metadata: {
    apps: {
      [config.slug]: { userId: 42, serverId: 7, serverUrl: "https://meet.example.com" },
    },
  },
};

const event = (overrides: Record<string, unknown> = {}): CalendarEvent =>
  ({ eventTypeId: 100, uid: "booking-uid", bookingId: 123, ...overrides }) as unknown as CalendarEvent;

function getVideoAdapter(): NonNullable<ReturnType<typeof VideoApiAdapter>> {
  const adapter = VideoApiAdapter();
  if (!adapter) throw new Error("TOAB Jitsi video adapter is unavailable");
  return adapter;
}

describe("TOAB Jitsi VideoApiAdapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("createMeeting", () => {
    test("creates a Moderator conference and returns its meeting URL", async () => {
      mocks.eventTypeFindUnique.mockResolvedValue(eventTypeWithServer);
      mocks.moderatorRequest.mockResolvedValue({
        bookingUid: "booking-uid",
        bookingId: 123,
        roomId: "room-uuid",
        serverId: 7,
        videoUri: "https://meet.example.com/room-uuid",
      });

      const result = await getVideoAdapter().createMeeting(event());

      expect(mocks.eventTypeFindUnique).toHaveBeenCalledWith({
        where: { id: 100 },
        select: { locations: true, metadata: true },
      });
      expect(mocks.moderatorRequest).toHaveBeenCalledWith("/api/calcom/conferences", {
        method: "POST",
        body: JSON.stringify({ bookingUid: "booking-uid", bookingId: 123, userId: 42, serverId: 7 }),
      });
      expect(result).toEqual({
        type: config.type,
        id: "booking-uid",
        password: "",
        url: "https://meet.example.com/room-uuid",
      });
    });

    test("rejects bookings unless TOAB Jitsi is the saved event location", async () => {
      mocks.eventTypeFindUnique.mockResolvedValue({
        ...eventTypeWithServer,
        locations: [{ type: "integrations:jitsi" }],
      });

      await expect(getVideoAdapter().createMeeting(event())).rejects.toThrow(
        "Select TOAB Jitsi as this event type's location"
      );
      expect(mocks.moderatorRequest).not.toHaveBeenCalled();
    });

    test("requires a selected organizer and server before creating the conference", async () => {
      mocks.eventTypeFindUnique.mockResolvedValue({
        ...eventTypeWithServer,
        metadata: { apps: { [config.slug]: { userId: 42 } } },
      });

      await expect(getVideoAdapter().createMeeting(event())).rejects.toThrow(
        "Choose a TOAB Jitsi server in the event type settings"
      );
      expect(mocks.moderatorRequest).not.toHaveBeenCalled();
    });

    test("requires the Cal.com booking UID", async () => {
      await expect(getVideoAdapter().createMeeting(event({ uid: undefined }))).rejects.toThrow(
        "Cal.com did not provide a booking UID"
      );
      expect(mocks.eventTypeFindUnique).not.toHaveBeenCalled();
    });
  });

  describe("deleteMeeting", () => {
    test("sends a user-scoped cancellation request to Moderator", async () => {
      mocks.bookingFindUnique.mockResolvedValue({ eventType: { metadata: eventTypeWithServer.metadata } });
      mocks.moderatorRequest.mockResolvedValue(undefined);

      await expect(getVideoAdapter().deleteMeeting("booking uid/with space")).resolves.toBeUndefined();

      expect(mocks.bookingFindUnique).toHaveBeenCalledWith({
        where: { uid: "booking uid/with space" },
        select: { eventType: { select: { metadata: true } } },
      });
      expect(mocks.moderatorRequest).toHaveBeenCalledWith(
        "/api/calcom/conferences/booking%20uid%2Fwith%20space?userId=42",
        { method: "DELETE" }
      );
    });

    test("does not call Moderator when the booking has no organizer user ID", async () => {
      mocks.bookingFindUnique.mockResolvedValue({ eventType: { metadata: { apps: {} } } });

      await expect(getVideoAdapter().deleteMeeting("booking-uid")).rejects.toThrow(
        "TOAB Jitsi organizer user ID is missing"
      );
      expect(mocks.moderatorRequest).not.toHaveBeenCalled();
    });

    test("fails clearly when the Cal.com booking cannot be found", async () => {
      mocks.bookingFindUnique.mockResolvedValue(null);

      await expect(getVideoAdapter().deleteMeeting("missing-booking")).rejects.toThrow(
        "Cal.com booking not found"
      );
      expect(mocks.moderatorRequest).not.toHaveBeenCalled();
    });
  });

  describe("updateMeeting", () => {
    test("returns the existing meeting details without calling Moderator", async () => {
      const bookingReference = {
        meetingId: "existing-room",
        meetingPassword: "existing-password",
        meetingUrl: "https://meet.example.com/existing-room",
      } as PartialReference;

      await expect(getVideoAdapter().updateMeeting(bookingReference, event())).resolves.toEqual({
        type: config.type,
        id: "existing-room",
        password: "existing-password",
        url: "https://meet.example.com/existing-room",
      });
      expect(mocks.moderatorRequest).not.toHaveBeenCalled();
    });
  });
});
