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

  // A booking can have several Cal Video rooms: rescheduling or reassigning a host creates a new
  // room while older references are kept, and the meeting may have taken place in any of them.
  private getVideoSessionsRoomNames(
    references?: Array<{ type: string; meetingId?: string | null }>
  ): string[] {
    const roomNames =
      references
        ?.filter((reference) => reference.type === CAL_VIDEO_TYPE)
        .map((reference) => reference.meetingId)
        .filter((meetingId): meetingId is string => !!meetingId) ?? [];
    return Array.from(new Set(roomNames));
  }

  private async getBookingRoomNames(bookingUid: string): Promise<string[]> {
    const booking = await this.bookingsRepository.getByUidWithBookingReference(bookingUid);
    if (!booking) {
      throw new NotFoundException(`Booking with uid=${bookingUid} was not found in the database`);
    }

    const roomNames = this.getVideoSessionsRoomNames(booking.references);
    if (!roomNames.length) {
      throw new NotFoundException(`No Cal Video reference found with booking uid ${bookingUid}`);
    }
    return roomNames;
  }

  async getRecordings(bookingUid: string) {
    const roomNames = await this.getBookingRoomNames(bookingUid);

    const recordingsPerRoom = await Promise.all(
      roomNames.map((roomName) => getRecordingsOfCalVideoByRoomName(roomName))
    );
    const recordings = recordingsPerRoom.flatMap((roomRecordings) =>
      roomRecordings && "data" in roomRecordings ? roomRecordings.data : []
    );

    const recordingWithDownloadLink = recordings.map((recording) => {
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
    const allRecordingsWithDownloadLink = await Promise.all(recordingWithDownloadLink);

    return allRecordingsWithDownloadLink;
  }

  async getTranscripts(bookingUid: string) {
    const roomNames = await this.getBookingRoomNames(bookingUid);

    const transcriptsPerRoom = await Promise.all(
      roomNames.map((roomName) => getAllTranscriptsAccessLinkFromRoomName(roomName))
    );

    return transcriptsPerRoom.flatMap((roomTranscripts) => roomTranscripts ?? []);
  }

  async getVideoSessions(bookingUid: string) {
    const roomNames = await this.getBookingRoomNames(bookingUid);

    const sessionsPerRoom = await Promise.all(
      roomNames.map((roomName) => getCalVideoMeetingSessionsByRoomName(roomName))
    );

    return this.calVideoOutputService.getOutputVideoSessions(
      sessionsPerRoom.flatMap((roomSessions) => roomSessions.data)
    );
  }
}
