import { BookingsRepository_2024_08_13 } from "@/platform/bookings/2024-08-13/repositories/bookings.repository";
import { CalVideoOutputService } from "@/platform/bookings/2024-08-13/services/cal-video.output.service";
import { CalVideoService } from "@/platform/bookings/2024-08-13/services/cal-video.service";
import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import type { CalMeetingSession } from "@calcom/platform-libraries/conferencing";
import {
  getAllTranscriptsAccessLinkFromRoomName,
  getCalVideoMeetingSessionsByRoomName,
  getDownloadLinkOfCalVideoByRecordingId,
  getRecordingsOfCalVideoByRoomName,
} from "@calcom/platform-libraries/conferencing";

jest.mock("@calcom/platform-libraries/conferencing", () => ({
  getRecordingsOfCalVideoByRoomName: jest.fn(),
  getAllTranscriptsAccessLinkFromRoomName: jest.fn(),
  getDownloadLinkOfCalVideoByRecordingId: jest.fn(),
  getCalVideoMeetingSessionsByRoomName: jest.fn(),
}));

const ORIGINAL_ROOM = "original-room";
const REASSIGNED_ROOM = "reassigned-room";

// After a reassignment the booking keeps the old Cal Video reference and gets a new one.
const reassignedBookingReferences: Array<{ type: string; meetingId: string | null }> = [
  { type: "daily_video", meetingId: ORIGINAL_ROOM },
  { type: "google_calendar", meetingId: null },
  { type: "daily_video", meetingId: REASSIGNED_ROOM },
];

const buildSession = (id: string, room: string): CalMeetingSession => ({
  id,
  room,
  start_time: 1731150000,
  duration: 1800,
  ongoing: false,
  max_participants: 2,
  participants: [],
});

describe("CalVideoService", () => {
  let service: CalVideoService;
  let bookingsRepository: { getByUidWithBookingReference: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    bookingsRepository = { getByUidWithBookingReference: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalVideoService,
        CalVideoOutputService,
        { provide: BookingsRepository_2024_08_13, useValue: bookingsRepository },
      ],
    }).compile();

    service = module.get<CalVideoService>(CalVideoService);
  });

  describe("getTranscripts", () => {
    it("returns transcripts from an earlier room after the booking was reassigned", async () => {
      bookingsRepository.getByUidWithBookingReference.mockResolvedValue({
        references: reassignedBookingReferences,
      });
      (getAllTranscriptsAccessLinkFromRoomName as jest.Mock).mockImplementation(async (roomName: string) =>
        roomName === ORIGINAL_ROOM ? ["https://daily.co/transcript/original"] : []
      );

      const transcripts = await service.getTranscripts("booking-uid");

      expect(transcripts).toEqual(["https://daily.co/transcript/original"]);
      expect(getAllTranscriptsAccessLinkFromRoomName).toHaveBeenCalledWith(ORIGINAL_ROOM);
      expect(getAllTranscriptsAccessLinkFromRoomName).toHaveBeenCalledWith(REASSIGNED_ROOM);
    });

    it("queries a room only once when references repeat it", async () => {
      bookingsRepository.getByUidWithBookingReference.mockResolvedValue({
        references: [
          { type: "daily_video", meetingId: ORIGINAL_ROOM },
          { type: "daily_video", meetingId: ORIGINAL_ROOM },
        ],
      });
      (getAllTranscriptsAccessLinkFromRoomName as jest.Mock).mockResolvedValue(["https://daily.co/t/1"]);

      const transcripts = await service.getTranscripts("booking-uid");

      expect(transcripts).toEqual(["https://daily.co/t/1"]);
      expect(getAllTranscriptsAccessLinkFromRoomName).toHaveBeenCalledTimes(1);
    });

    it("throws NotFoundException when the booking has no Cal Video reference", async () => {
      bookingsRepository.getByUidWithBookingReference.mockResolvedValue({
        references: [{ type: "google_calendar", meetingId: null }],
      });

      await expect(service.getTranscripts("booking-uid")).rejects.toThrow(NotFoundException);
      expect(getAllTranscriptsAccessLinkFromRoomName).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the booking does not exist", async () => {
      bookingsRepository.getByUidWithBookingReference.mockResolvedValue(null);

      await expect(service.getTranscripts("missing-uid")).rejects.toThrow(NotFoundException);
    });
  });

  describe("getRecordings", () => {
    it("returns recordings from every Cal Video room of the booking", async () => {
      bookingsRepository.getByUidWithBookingReference.mockResolvedValue({
        references: reassignedBookingReferences,
      });
      (getRecordingsOfCalVideoByRoomName as jest.Mock).mockImplementation(async (roomName: string) =>
        roomName === ORIGINAL_ROOM
          ? {
              data: [
                {
                  id: "recording-1",
                  room_name: ORIGINAL_ROOM,
                  start_ts: 1731150000,
                  status: "finished",
                  max_participants: 2,
                  duration: 1800,
                  share_token: "share-token",
                },
              ],
            }
          : { data: [] }
      );
      (getDownloadLinkOfCalVideoByRecordingId as jest.Mock).mockResolvedValue({
        download_link: "https://daily.co/download/recording-1",
      });

      const recordings = await service.getRecordings("booking-uid");

      expect(recordings).toEqual([
        expect.objectContaining({
          id: "recording-1",
          roomName: ORIGINAL_ROOM,
          downloadLink: "https://daily.co/download/recording-1",
        }),
      ]);
    });
  });

  describe("getVideoSessions", () => {
    it("returns sessions from every Cal Video room of the booking", async () => {
      bookingsRepository.getByUidWithBookingReference.mockResolvedValue({
        references: reassignedBookingReferences,
      });
      (getCalVideoMeetingSessionsByRoomName as jest.Mock).mockImplementation(async (roomName: string) => ({
        data: roomName === ORIGINAL_ROOM ? [buildSession("session-1", ORIGINAL_ROOM)] : [],
      }));

      const sessions = await service.getVideoSessions("booking-uid");

      expect(sessions).toEqual([expect.objectContaining({ id: "session-1", room: ORIGINAL_ROOM })]);
    });
  });
});
