import { z } from "zod";

import { getDailyAppKeys } from "@calcom/app-store/dailyvideo/lib/getDailyAppKeys";
import { prisma } from "@calcom/prisma";
import type { GetRecordingsResponseSchema, GetAccessLinkResponseSchema } from "@calcom/prisma/zod-utils";
import {
  getRecordingsResponseSchema,
  getAccessLinkResponseSchema,
  recordingItemSchema,
} from "@calcom/prisma/zod-utils";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { CredentialForCalendarService } from "@calcom/types/Credential";
import type { PartialReference } from "@calcom/types/EventManager";
import type { VideoApiAdapter, VideoCallData } from "@calcom/types/VideoApiAdapter";

import {
  ZSubmitBatchProcessorJobRes,
  ZGetTranscriptAccessLink,
  getMeetingInformationResponseSchema,
  TGetMeetingInformationResponsesSchema,
} from "../zod";
import type { TSubmitBatchProcessorJobRes, TGetTranscriptAccessLink, batchProcessorBody } from "../zod";
import { fetcher } from "./dailyApiFetcher";
import {
  dailyReturnTypeSchema,
  getTranscripts,
  getBatchProcessJobs,
  getRooms,
  meetingTokenSchema,
  ZGetMeetingTokenResponseSchema,
} from "./types";

export interface DailyEventResult {
  id: string;
  name: string;
  api_created: boolean;
  privacy: string;
  url: string;
  created_at: string;
  config: Record<string, unknown>;
}

export interface DailyVideoCallData {
  type: string;
  id: string;
  password: string;
  url: string;
}

// Regions available to create DailyVideo Rooms in.
const REGION_CODES = [
  "af-south-1",
  "ap-northeast-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-south-1",
  "eu-central-1",
  "eu-west-2",
  "sa-east-1",
  "us-east-1",
  "us-west-2",
] as const;

type RoomGeo = (typeof REGION_CODES)[number];

function getDailyVideoRegionFromEnv(): RoomGeo | undefined {
  if (!process?.env?.DAILY_VIDEO_REGION) return;
  const isRoomGeo = (value: string): value is RoomGeo => REGION_CODES.includes(value as RoomGeo);
  function assertIsDailyVideoRegion(value: string): asserts value is RoomGeo {
    if (!isRoomGeo(value)) {
      throw new Error(`Invalid region code: ${value}. Must be one of: ${REGION_CODES.join(", ")}`);
    }
  }
  const region = process.env.DAILY_VIDEO_REGION;
  assertIsDailyVideoRegion(region);
  return region;
}

const isS3StorageEnabled =
  process.env.CAL_VIDEO_BUCKET_NAME &&
  process.env.CAL_VIDEO_BUCKET_REGION &&
  process.env.CAL_VIDEO_ASSUME_ROLE_ARN;

/** @deprecated use metadata on index file */
export const FAKE_DAILY_CREDENTIAL: CredentialForCalendarService & { invalid: boolean } = {
  id: 0,
  type: "daily_video",
  key: { apikey: process.env.DAILY_API_KEY },
  userId: 0,
  user: { email: "" },
  appId: "daily-video",
  invalid: false,
  teamId: null,
  encryptedKey: null,
  delegatedToId: null,
  delegatedTo: null,
  delegationCredentialId: null,
};

function postToDailyAPI(endpoint: string, body: Record<string, unknown>) {
  return fetcher(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export const getBatchProcessorJobAccessLink = (id: string) => {
  return fetcher(`/batch-processor/${id}/access-link`).then(ZGetTranscriptAccessLink.parse);
};

export const getRoomNameFromRecordingId = (recordingId: string) => {
  return fetcher(`/recordings/${recordingId}`)
    .then(recordingItemSchema.parse)
    .then((res) => res.room_name);
};

async function processTranscriptsInBatches(transcriptIds: Array<string>) {
  const batchSize = 5; // Batch size
  const batches = []; // Array to hold batches of transcript IDs

  // Split transcript IDs into batches
  for (let i = 0; i < transcriptIds.length; i += batchSize) {
    batches.push(transcriptIds.slice(i, i + batchSize));
  }

  const allTranscriptsAccessLinks = []; // Array to hold all access links

  // Process each batch sequentially
  for (const batch of batches) {
    const batchPromises = batch.map((id) =>
      fetcher(`/transcript/${id}/access-link`)
        .then(z.object({ link: z.string() }).parse)
        .then((res) => res.link)
    );

    const accessLinks = await Promise.all(batchPromises);

    allTranscriptsAccessLinks.push(...accessLinks);
  }

  return allTranscriptsAccessLinks;
}

export const updateMeetingTokenIfExpired = async ({
  bookingReferenceId,
  meetingToken,
  roomName,
  exp,
}: {
  bookingReferenceId: number;
  meetingToken: string | null;
  roomName: string;
  exp: number;
}) => {
  if (!meetingToken) return null;

  try {
    await fetcher(`/meeting-tokens/${meetingToken}`).then(ZGetMeetingTokenResponseSchema.parse);
  } catch {
    const organizerMeetingToken = await postToDailyAPI("/meeting-tokens", {
      properties: {
        room_name: roomName,
        exp: exp,
        enable_recording_ui: false,
        is_owner: true,
      },
    }).then(meetingTokenSchema.parse);

    await prisma.bookingReference.update({
      where: {
        id: bookingReferenceId,
      },
      data: {
        meetingPassword: organizerMeetingToken.token,
      },
    });

    return organizerMeetingToken.token;
  }

  return meetingToken;
};

export const generateGuestMeetingTokenFromOwnerMeetingToken = async ({
  meetingToken,
  userId,
}: {
  meetingToken: string | null;
  userId?: number | string;
}) => {
  if (!meetingToken) return null;
  const token = await fetcher(`/meeting-tokens/${meetingToken}`).then(ZGetMeetingTokenResponseSchema.parse);
  const guestMeetingToken = await postToDailyAPI("/meeting-tokens", {
    properties: {
      room_name: token.room_name,
      exp: token.exp,
      enable_recording_ui: false,
      user_id: userId,
    },
  }).then(meetingTokenSchema.parse);

  return guestMeetingToken.token;
};

// Only for backward compatibility
export const setEnableRecordingUIAndUserIdForOrganizer = async (
  bookingReferenceId: number,
  meetingToken: string | null,
  userId?: number
) => {
  if (!meetingToken) return null;

  const token = await fetcher(`/meeting-tokens/${meetingToken}`).then(ZGetMeetingTokenResponseSchema.parse);
  if (token.enable_recording_ui === false && !!token.user_id) return null;

  const organizerMeetingToken = await postToDailyAPI("/meeting-tokens", {
    properties: {
      room_name: token.room_name,
      exp: token.exp,
      enable_recording_ui: false,
      is_owner: true,
      user_id: userId,
    },
  }).then(meetingTokenSchema.parse);

  // Update the meetingPassword in the database
  await prisma.bookingReference.update({
    where: {
      id: bookingReferenceId,
    },
    data: {
      meetingPassword: organizerMeetingToken.token,
    },
  });

  return organizerMeetingToken.token;
};

const DailyVideoApiAdapter = (): VideoApiAdapter => {
  async function createOrUpdateMeeting(
    endpoint: string,
    event: CalendarEvent,
    region?: RoomGeo
  ): Promise<VideoCallData> {
    if (!event.uid) {
      throw new Error("We need the booking uid to create the Daily reference in DB");
    }
    const body = await translateEvent(event, region);
    const dailyEvent = await postToDailyAPI(endpoint, body).then(dailyReturnTypeSchema.parse);
    const meetingToken = await postToDailyAPI("/meeting-tokens", {
      properties: {
        room_name: dailyEvent.name,
        exp: dailyEvent.config.exp,
        is_owner: true,
        enable_recording_ui: false,
      },
    }).then(meetingTokenSchema.parse);

    return Promise.resolve({
      type: "daily_video",
      id: dailyEvent.name,
      password: meetingToken.token,
      url: dailyEvent.url,
    });
  }

  const translateEvent = async (event: CalendarEvent, region?: RoomGeo) => {
    // Documentation at: https://docs.daily.co/reference#list-rooms
    // Adds 14 days from the end of the booking as the expiration date
    const exp = Math.round(new Date(event.endTime).getTime() / 1000) + 60 * 60 * 24 * 14;
    const { scale_plan: scalePlan } = await getDailyAppKeys();
    const hasTeamPlan = await prisma.membership.findFirst({
      where: {
        userId: event.organizer.id,
        team: {
          slug: {
            not: null,
          },
        },
      },
    });

    const enableRecording = scalePlan === "true" && !!hasTeamPlan === true ? "cloud" : undefined;
    const isTranscriptionEnabled = !!hasTeamPlan;

    return {
      privacy: "public",
      properties: {
        ...(region ? { geo: region } : {}),
        enable_prejoin_ui: true,
        enable_knocking: true,
        enable_screenshare: true,
        enable_chat: true,
        enable_pip_ui: true,
        exp: exp,
        enable_recording: enableRecording,
        ...(!!enableRecording &&
          isS3StorageEnabled && {
            recordings_bucket: {
              bucket_name: process.env.CAL_VIDEO_BUCKET_NAME,
              bucket_region: process.env.CAL_VIDEO_BUCKET_REGION,
              assume_role_arn: process.env.CAL_VIDEO_ASSUME_ROLE_ARN,
              allow_api_access: true,
              allow_streaming_from_bucket: false,
            },
          }),
        enable_transcription_storage: isTranscriptionEnabled,
        ...(isTranscriptionEnabled && {
          permissions: {
            canAdmin: ["transcription"],
          },
        }),
        ...(isTranscriptionEnabled &&
          isS3StorageEnabled && {
            transcription_bucket: {
              bucket_name: process.env.CAL_VIDEO_BUCKET_NAME,
              bucket_region: process.env.CAL_VIDEO_BUCKET_REGION,
              assume_role_arn: process.env.CAL_VIDEO_ASSUME_ROLE_ARN,
              allow_api_access: true,
            },
          }),
      },
    };
  };

  async function createInstantMeeting(endTime: string, region?: RoomGeo) {
    // added a 1 hour buffer for room expiration
    const exp = Math.round(new Date(endTime).getTime() / 1000) + 60 * 60;
    const { scale_plan: scalePlan } = await getDailyAppKeys();

    const isScalePlanTrue = scalePlan === "true";

    const enableRecording = isScalePlanTrue ? "cloud" : undefined;

    const body = {
      privacy: "public",
      properties: {
        ...(region ? { geo: region } : {}),
        enable_prejoin_ui: true,
        enable_knocking: true,
        enable_screenshare: true,
        enable_chat: true,
        enable_pip_ui: true,
        exp: exp,
        enable_recording: enableRecording,
        ...(!!enableRecording &&
          isS3StorageEnabled && {
            recordings_bucket: {
              bucket_name: process.env.CAL_VIDEO_BUCKET_NAME,
              bucket_region: process.env.CAL_VIDEO_BUCKET_REGION,
              assume_role_arn: process.env.CAL_VIDEO_ASSUME_ROLE_ARN,
              allow_api_access: true,
              allow_streaming_from_bucket: false,
            },
          }),
        start_video_off: true,
        enable_transcription_storage: isScalePlanTrue,
        ...(isScalePlanTrue &&
          isS3StorageEnabled && {
            permissions: {
              canAdmin: ["transcription"],
            },
            transcription_bucket: {
              bucket_name: process.env.CAL_VIDEO_BUCKET_NAME,
              bucket_region: process.env.CAL_VIDEO_BUCKET_REGION,
              assume_role_arn: process.env.CAL_VIDEO_ASSUME_ROLE_ARN,
              allow_api_access: true,
            },
          }),
      },
    };

    const dailyEvent = await postToDailyAPI("/rooms", body).then(dailyReturnTypeSchema.parse);
    const meetingToken = await postToDailyAPI("/meeting-tokens", {
      properties: {
        room_name: dailyEvent.name,
        exp: dailyEvent.config.exp,
        is_owner: true,
        enable_recording_ui: false,
      },
    }).then(meetingTokenSchema.parse);

    return Promise.resolve({
      type: "daily_video",
      id: dailyEvent.name,
      password: meetingToken.token,
      url: dailyEvent.url,
    });
  }
  // Region on which the DailyVideo room is created can be controlled by ENV var
  // undefined region leaves the choice to DailyVideo
  const region = getDailyVideoRegionFromEnv();
  return {
    /** Daily doesn't need to return busy times, so we return empty */
    getAvailability: () => {
      return Promise.resolve([]);
    },
    createMeeting: async (event: CalendarEvent): Promise<VideoCallData> =>
      createOrUpdateMeeting("/rooms", event, region),
    deleteMeeting: async (uid: string): Promise<void> => {
      await fetcher(`/rooms/${uid}`, { method: "DELETE" });
      return Promise.resolve();
    },
    updateMeeting: (bookingRef: PartialReference, event: CalendarEvent): Promise<VideoCallData> =>
      createOrUpdateMeeting(`/rooms/${bookingRef.uid}`, event, region),
    getRecordings: async (roomName: string): Promise<GetRecordingsResponseSchema> => {
      try {
        const res = await fetcher(`/recordings?room_name=${roomName}`).then(
          getRecordingsResponseSchema.parse
        );
        return Promise.resolve(res);
      } catch {
        throw new Error("Something went wrong! Unable to get recording");
      }
    },
    createInstantCalVideoRoom: (endTime: string) => createInstantMeeting(endTime, region),
    getRecordingDownloadLink: async (recordingId: string): Promise<GetAccessLinkResponseSchema> => {
      try {
        const res = await fetcher(`/recordings/${recordingId}/access-link?valid_for_secs=43200`).then(
          getAccessLinkResponseSchema.parse
        );
        return Promise.resolve(res);
      } catch (err) {
        console.log("err", err);
        throw new Error("Something went wrong! Unable to get recording access link");
      }
    },
    getAllTranscriptsAccessLinkFromRoomName: async (roomName: string): Promise<Array<string>> => {
      try {
        const allTranscripts = await fetcher(`/transcript?room_name=${roomName}`).then(getTranscripts.parse);

        if (!allTranscripts.data.length) return [];

        const allTranscriptsIds = allTranscripts.data.map((transcript) => transcript.transcriptId);
        const allTranscriptsAccessLink = await processTranscriptsInBatches(allTranscriptsIds);
        const accessLinks = await Promise.all(allTranscriptsAccessLink);

        return Promise.resolve(accessLinks);
      } catch (err) {
        console.log("err", err);
        throw new Error("Something went wrong! Unable to get transcription access link");
      }
    },
    getAllTranscriptsAccessLinkFromMeetingId: async (meetingId: string): Promise<Array<string>> => {
      try {
        const allTranscripts = await fetcher(`/transcript?mtgSessionId=${meetingId}`).then(
          getTranscripts.parse
        );

        if (!allTranscripts.data.length) return [];

        const allTranscriptsIds = allTranscripts.data.map((transcript) => transcript.transcriptId);
        const allTranscriptsAccessLink = await processTranscriptsInBatches(allTranscriptsIds);
        const accessLinks = await Promise.all(allTranscriptsAccessLink);

        return Promise.resolve(accessLinks);
      } catch (err) {
        console.log("err", err);
        throw new Error("Something went wrong! Unable to get transcription access link");
      }
    },
    submitBatchProcessorJob: async (body: batchProcessorBody): Promise<TSubmitBatchProcessorJobRes> => {
      try {
        const batchProcessorJob = await postToDailyAPI("/batch-processor", body).then(
          ZSubmitBatchProcessorJobRes.parse
        );
        return batchProcessorJob;
      } catch (err) {
        console.log("err", err);
        throw new Error("Something went wrong! Unable to submit batch processor job");
      }
    },
    getTranscriptsAccessLinkFromRecordingId: async (
      recordingId: string
    ): Promise<TGetTranscriptAccessLink["transcription"] | { message: string }> => {
      try {
        const batchProcessorJobs = await fetcher(`/batch-processor?recordingId=${recordingId}`).then(
          getBatchProcessJobs.parse
        );
        if (!batchProcessorJobs.data.length) {
          return { message: `No Batch processor jobs found for recording id ${recordingId}` };
        }

        const transcriptJobId = batchProcessorJobs.data.filter(
          (job) => job.preset === "transcript" && job.status === "finished"
        )?.[0]?.id;

        if (!transcriptJobId) return [];

        const accessLinkRes = await getBatchProcessorJobAccessLink(transcriptJobId);

        return accessLinkRes.transcription;
      } catch (err) {
        console.log("err", err);
        throw new Error("Something went wrong! can't get transcripts");
      }
    },
    checkIfRoomNameMatchesInRecording: async (roomName: string, recordingId: string): Promise<boolean> => {
      try {
        const recording = await fetcher(`/recordings/${recordingId}`).then(recordingItemSchema.parse);
        return recording.room_name === roomName;
      } catch (err) {
        console.error("err", err);
        throw new Error(`Something went wrong! Unable to checkIfRoomNameMatchesInRecording. ${err}`);
      }
    },
    getMeetingInformation: async (roomName: string): Promise<TGetMeetingInformationResponsesSchema> => {
      try {
        const res = await fetcher(`/meetings?room=${encodeURIComponent(roomName)}`).then(
          getMeetingInformationResponseSchema.parse
        );
        return res;
      } catch (err) {
        console.error("err", err);
        throw new Error("Something went wrong! Unable to get meeting information");
      }
    },
  };
};

export default DailyVideoApiAdapter;
