import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getRoomNameFromRecordingId, getBatchProcessorJobAccessLink } from "@calcom/app-store/dailyvideo/lib";
import { BookingRepository } from "@calcom/features/bookings/repositories/BookingRepository";
import {
  sendDailyVideoRecordingEmails,
  sendDailyVideoTranscriptEmails,
} from "@calcom/emails/daily-video-emails";
import {
  getAllTranscriptsAccessLinkFromMeetingId,
  submitBatchProcessorTranscriptionJob,
} from "@calcom/features/conferencing/lib/videoClient";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { timingSafeEqualStrings } from "@calcom/lib/crypto";
import { getTeamIdFromEventType } from "@calcom/lib/getTeamIdFromEventType";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import { generateVideoToken } from "@calcom/lib/videoTokens";
import prisma from "@calcom/prisma";
import { getBooking } from "@calcom/web/lib/daily-webhook/getBooking";
import { getBookingReference } from "@calcom/web/lib/daily-webhook/getBookingReference";
import { getCalendarEvent } from "@calcom/web/lib/daily-webhook/getCalendarEvent";
import {
  meetingEndedSchema,
  recordingReadySchema,
  batchProcessorJobFinishedSchema,
  testRequestSchema,
} from "@calcom/web/lib/daily-webhook/schema";
import {
  triggerRecordingReadyWebhook,
  triggerTranscriptionGeneratedWebhook,
} from "@calcom/web/lib/daily-webhook/triggerWebhooks";

const log = logger.getSubLogger({ prefix: ["daily-video-webhook-handler"] });

const computeSignature = (hmacSecret: string, reqBody: any, webhookTimestampHeader: string | null) => {
  const signature = `${webhookTimestampHeader}.${JSON.stringify(reqBody)}`;
  const base64DecodedSecret = Buffer.from(hmacSecret, "base64");
  const hmac = createHmac("sha256", base64DecodedSecret);
  const computed_signature = hmac.update(signature).digest("base64");
  return computed_signature;
};

const getProxyDownloadLinkOfCalVideo = async (recordingId: string) => {
  const token = generateVideoToken(recordingId);
  const downloadLink = `${WEBAPP_URL}/api/video/recording?token=${token}`;
  return downloadLink;
};

export async function postHandler(request: NextRequest) {
  const body = await request.json();

  if (testRequestSchema.safeParse(body).success) {
    return NextResponse.json({ message: "Test request successful" });
  }

  const headersList = await headers();
  const testMode = process.env.NEXT_PUBLIC_IS_E2E || process.env.INTEGRATION_TEST_MODE;

  if (!testMode) {
    const hmacSecret = process.env.DAILY_WEBHOOK_SECRET;
    if (!hmacSecret) {
      return NextResponse.json({ message: "No Daily Webhook Secret" }, { status: 405 });
    }

    const webhookTimestamp = headersList.get("x-webhook-timestamp");
    const computed_signature = computeSignature(hmacSecret, body, webhookTimestamp);

    if (!timingSafeEqualStrings(headersList.get("x-webhook-signature"), computed_signature)) {
      return NextResponse.json({ message: "Signature does not match" }, { status: 403 });
    }
  }

  log.info(
    "Daily video webhook Request Body:",
    safeStringify({
      body,
    })
  );

  try {
    if (body?.type === "recording.ready-to-download") {
      const recordingReadyResponse = recordingReadySchema.safeParse(body);

      if (!recordingReadyResponse.success) {
        return NextResponse.json({ message: "Invalid Payload" }, { status: 400 });
      }

      const { room_name, recording_id, status } = recordingReadyResponse.data.payload;

      if (status !== "finished") {
        return NextResponse.json({ message: "Recording not finished" }, { status: 400 });
      }

      const bookingReference = await getBookingReference(room_name);
      const booking = await getBooking(bookingReference.bookingId as number);

      const bookingRepository = new BookingRepository(prisma);

      const [evt, updateRecordStatus, downloadLink, teamId] = await Promise.all([
        getCalendarEvent(booking),
        bookingRepository.updateRecordedStatus({
          bookingUid: booking.uid,
          isRecorded: true,
        }),
        getProxyDownloadLinkOfCalVideo(recording_id),
        getTeamIdFromEventType({
          eventType: {
            team: { id: booking?.eventType?.teamId ?? null },
            parentId: booking?.eventType?.parentId ?? null,
          },
        }),
      ]);

      const tasks = [
        {
          fn: triggerRecordingReadyWebhook({
            evt,
            downloadLink,
            booking: {
              userId: booking?.user?.id,
              eventTypeId: booking.eventTypeId,
              eventTypeParentId: booking.eventType?.parentId,
              teamId,
            },
          }),
          errorMsg: "trigger recording ready webhook",
        },
        {
          fn: submitBatchProcessorTranscriptionJob(recording_id),
          errorMsg: "submit transcription batch processor job",
        },
        {
          fn: sendDailyVideoRecordingEmails(evt, downloadLink),
          errorMsg: "send recording emails",
        },
      ];

      const results = await Promise.allSettled(tasks.map((t) => t.fn));

      results.forEach((result, index) => {
        if (result.status === "rejected") {
          log.error(`Failed to ${tasks[index].errorMsg}:`, safeStringify(result.reason));
        }
      });

      return NextResponse.json({ message: "Success" });
    } else if (body.type === "meeting.ended") {
      const meetingEndedResponse = meetingEndedSchema.safeParse(body);
      if (!meetingEndedResponse.success) {
        return NextResponse.json({ message: "Invalid Payload" }, { status: 400 });
      }

      const { room, meeting_id } = meetingEndedResponse.data.payload;

      const bookingReference = await getBookingReference(room);
      const booking = await getBooking(bookingReference.bookingId as number);

      if (!booking.eventType?.canSendCalVideoTranscriptionEmails) {
        return NextResponse.json({
          message: `Transcription emails are disabled for this event type ${booking.eventTypeId}`,
        });
      }

      const transcripts = await getAllTranscriptsAccessLinkFromMeetingId(meeting_id);

      if (!transcripts || !transcripts.length)
        return NextResponse.json({
          message: `No Transcripts found for room name ${room} and meeting id ${meeting_id}`,
        });

      const evt = await getCalendarEvent(booking);
      await sendDailyVideoTranscriptEmails(evt, transcripts);

      return NextResponse.json({ message: "Success" });
    } else if (body?.type === "batch-processor.job-finished") {
      const batchProcessorJobFinishedResponse = batchProcessorJobFinishedSchema.safeParse(body);

      if (!batchProcessorJobFinishedResponse.success) {
        return NextResponse.json({ message: "Invalid Payload" }, { status: 400 });
      }

      const { id, input } = batchProcessorJobFinishedResponse.data.payload;
      const roomName = await getRoomNameFromRecordingId(input.recordingId);

      const bookingReference = await getBookingReference(roomName);

      const booking = await getBooking(bookingReference.bookingId as number);

      const teamId = await getTeamIdFromEventType({
        eventType: {
          team: { id: booking?.eventType?.teamId ?? null },
          parentId: booking?.eventType?.parentId ?? null,
        },
      });

      const [evt, recording, batchProcessorJobAccessLink] = await Promise.all([
        getCalendarEvent(booking),
        getProxyDownloadLinkOfCalVideo(input.recordingId),
        getBatchProcessorJobAccessLink(id),
      ]);

      await triggerTranscriptionGeneratedWebhook({
        evt,
        downloadLinks: {
          transcription: batchProcessorJobAccessLink.transcription,
          recording,
        },
        booking: {
          userId: booking?.user?.id,
          eventTypeId: booking.eventTypeId,
          eventTypeParentId: booking.eventType?.parentId,
          teamId,
        },
      });

      return NextResponse.json({ message: "Success" });
    } else {
      log.error("Invalid type in /recorded-daily-video", body);
      return NextResponse.json({
        message: "Invalid type in /recorded-daily-video",
      });
    }
  } catch (err) {
    log.error("Error in /recorded-daily-video", err);

    if (err instanceof HttpError) {
      return NextResponse.json({ message: err.message }, { status: err.statusCode });
    } else {
      return NextResponse.json({ message: "something went wrong" }, { status: 500 });
    }
  }
}

export const POST = defaultResponderForAppDir(postHandler);
