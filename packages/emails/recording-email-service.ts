import type BaseEmail from "@calcom/emails/templates/_base-email";
import { formatCalEvent } from "@calcom/lib/formatCalendarEvent";
import type { CalendarEvent } from "@calcom/types/Calendar";
import AttendeeDailyVideoDownloadRecordingEmail from "./templates/attendee-daily-video-download-recording-email";
import AttendeeDailyVideoDownloadTranscriptEmail from "./templates/attendee-daily-video-download-transcript-email";
import OrganizerDailyVideoDownloadRecordingEmail from "./templates/organizer-daily-video-download-recording-email";
import OrganizerDailyVideoDownloadTranscriptEmail from "./templates/organizer-daily-video-download-transcript-email";

const sendEmail = (prepare: () => BaseEmail) => {
  return new Promise((resolve, reject) => {
    try {
      const email = prepare();
      resolve(email.sendEmail());
    } catch (e) {
      reject(console.error(`${prepare.constructor.name}.sendEmail failed`, e));
    }
  });
};

export const sendDailyVideoRecordingEmails = async (calEvent: CalendarEvent, downloadLink: string) => {
  const calendarEvent = formatCalEvent(calEvent);
  const emailsToSend: Promise<unknown>[] = [];

  emailsToSend.push(
    sendEmail(() => new OrganizerDailyVideoDownloadRecordingEmail(calendarEvent, downloadLink))
  );

  for (const attendee of calendarEvent.attendees) {
    emailsToSend.push(
      sendEmail(() => new AttendeeDailyVideoDownloadRecordingEmail(calendarEvent, attendee, downloadLink))
    );
  }
  await Promise.all(emailsToSend);
};

export const sendDailyVideoTranscriptEmails = async (calEvent: CalendarEvent, transcripts: string[]) => {
  const emailsToSend: Promise<unknown>[] = [];

  emailsToSend.push(sendEmail(() => new OrganizerDailyVideoDownloadTranscriptEmail(calEvent, transcripts)));

  for (const attendee of calEvent.attendees) {
    emailsToSend.push(
      sendEmail(() => new AttendeeDailyVideoDownloadTranscriptEmail(calEvent, attendee, transcripts))
    );
  }
  await Promise.all(emailsToSend);
};
