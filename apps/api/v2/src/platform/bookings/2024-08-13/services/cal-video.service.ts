import { BookingsRepository_2024_08_13 } from "@/platform/bookings/2024-08-13/repositories/bookings.repository";
import { CalVideoOutputService } from "@/platform/bookings/2024-08-13/services/cal-video.output.service";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";

import { CAL_VIDEO_TYPE } from "@calcom/platform-constants";
import {
  getRecordingsOfCalVideoByRoomName,
  getAllTranscriptsAccessLinkFromRoomName,
  getDownloadLinkOfCalVideoByRecordingId,
  getCalVideoMeetingSessionsByRoomName,
} from "@calcom/platform-libraries/conferencing";

@Injectable()
export class CalVideoService {
  private readonly logger = new Logger("CalVideoService");
  constructor(
    private readonly bookingsRepository: BookingsRepository_2024_08_13,
    private readonly calVideoOutputService: CalVideoOutputService
  ) {}

  private getVideoSessionsRoomNames(references?: Array<{ type: string; meetingId?: string | null }>): string[] {
    const names = references
      ?.filter((reference) => reference.type === CAL_VIDEO_TYPE && Boolean(reference.meetingId))
      .map((reference) => reference.meetingId as string) ?? [];
    return [...new Set(names)];
  }

  async getRecordings(bookingUid: string) {
    const booking = await this.bookingsRepository.getByUidWithBookingReference(bookingUid);
    if (!booking) {
      throw new NotFoundException(`Booking with uid=${bookingUid} was not found in the database`);
    }

    const roomNames = this.getVideoSessionsRoomNames(booking.references);
    if (roomNames.length === 0) {
      throw new NotFoundException(`No Cal Video reference found with booking uid ${bookingUid}`);
    }

    const allRecordingsNested = await Promise.all(
      roomNames.map(async (roomName) => {
        const recordings = await getRecordingsOfCalVideoByRoomName(roomName).catch((err: Error) => {
          this.logger.warn(`Failed to fetch recordings for room ${roomName}: ${err.message}`);
          return null;
        });

        if (!recordings || !("data" in recordings)) return [];

        const recordingWithDownloadLink = recordings.data.map((recording) => {
          return getDownloadLinkOfCalVideoByRecordingId(recording.id)
            .then((res: { download_link: string } | undefined) => ({
              id: recording.id,
              roomName: recording.room_name,
              startTs: recording.start_ts,
              status: recording.status,
              maxParticipants: recording.max_participants,
              duration: recording.duration,
              shareToken: recording.share_token,
              downloadLink: res?.download_link,
            }))
            .catch((err: Error) => ({
              id: recording.id,
              roomName: recording.room_name,
              startTs: recording.start_ts,
              status: recording.status,
              maxParticipants: recording.max_participants,
              duration: recording.duration,
              shareToken: recording.share_token,
              downloadLink: null,
              error: err.message,
            }));
        });
        return Promise.all(recordingWithDownloadLink);
      })
    );

    return allRecordingsNested.flat();
  }

  async getTranscripts(bookingUid: string) {
    const booking = await this.bookingsRepository.getByUidWithBookingReference(bookingUid);
    if (!booking) {
      throw new NotFoundException(`Booking with uid=${bookingUid} was not found in the database`);
    }

    const roomNames = this.getVideoSessionsRoomNames(booking.references);
    if (roomNames.length === 0) {
      throw new NotFoundException(`No Cal Video reference found with booking uid ${bookingUid}`);
    }

    const transcriptLists = await Promise.all(
      roomNames.map((roomName) =>
        getAllTranscriptsAccessLinkFromRoomName(roomName).catch((err: Error) => {
          this.logger.warn(`Failed to fetch transcripts for room ${roomName}: ${err.message}`);
          return [];
        })
      )
    );

    return transcriptLists.flat();
  }

  async getVideoSessions(bookingUid: string) {
    const booking = await this.bookingsRepository.getByUidWithBookingReference(bookingUid);
    if (!booking) {
      throw new NotFoundException(`Booking with uid=${bookingUid} was not found in the database`);
    }

    const roomNames = this.getVideoSessionsRoomNames(booking.references);
    if (roomNames.length === 0) {
      throw new NotFoundException(`No Cal Video reference found with booking uid ${bookingUid}`);
    }

    const sessionsNested = await Promise.all(
      roomNames.map(async (roomName) => {
        const sessions = await getCalVideoMeetingSessionsByRoomName(roomName).catch((err: Error) => {
          this.logger.warn(`Failed to fetch video sessions for room ${roomName}: ${err.message}`);
          return { data: [] };
        });
        return sessions?.data ?? [];
      })
    );

    return this.calVideoOutputService.getOutputVideoSessions(sessionsNested.flat());
  }
}
