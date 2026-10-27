import { z } from "zod";

import { handleErrorsJson } from "@calcom/lib/errors";
import type { GetRecordingsResponseSchema, GetAccessLinkResponseSchema } from "@calcom/prisma/zod-utils";
import { getRecordingsResponseSchema, getAccessLinkResponseSchema } from "@calcom/prisma/zod-utils";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { PartialReference } from "@calcom/types/EventManager";
import type { VideoApiAdapter, VideoCallData } from "@calcom/types/VideoApiAdapter";

import { getShimmerAppKeys } from "./getShimmerAppKeys";

/** Shimmer Video app type in the config.json
 *  changed to 'shimmer_video' to support video conferencing
 */

/** @link https://docs.daily.co/reference/rest-api/rooms/create-room */
const dailyReturnTypeSchema = z.object({
  /** Long UID string ie: 987b5eb5-d116-4a4e-8e2c-14fcb5710966 */
  id: z.string(),
  /** Not a real name, just a random generated string ie: "ePR84NQ1bPigp79dDezz" */
  name: z.string(),
  api_created: z.boolean(),
  privacy: z.union([z.literal("private"), z.literal("public")]),
  /** https://api-demo.daily.co/ePR84NQ1bPigp79dDezz */
  url: z.string(),
  created_at: z.string(),
  config: z.object({
    enable_prejoin_ui: z.boolean(),
    enable_people_ui: z.boolean(),
    enable_emoji_reactions: z.boolean(),
    enable_pip_ui: z.boolean(),
    enable_hand_raising: z.boolean(),
    enable_network_ui: z.boolean(),
    enable_video_processing_ui: z.boolean(),
    enable_noise_cancellation_ui: z.boolean(),
    enable_advanced_chat: z.boolean(),
    //above flags are for prebuilt daily
    enable_chat: z.boolean(),
    enable_knocking: z.boolean(),
  }),
});

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

export const fetcher = async (endpoint: string, init?: RequestInit | undefined) => {
  const { api_key } = await getShimmerAppKeys();
  const response = await fetch(`https://api.daily.co/v1${endpoint}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${api_key}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  }).then(handleErrorsJson);
  return response;
};

export const fetcherShimmer = async (endpoint: string, init?: RequestInit | undefined) => {
  const { api_key, api_route } = await getShimmerAppKeys();

  if (!api_route) {
    //if no api_route, then we wont push to shimmer
    return Promise.resolve([]);
  }

  const response = await fetch(`${api_route}${endpoint}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${api_key}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });

  return response;
};

export const postToShimmerAPI = async (
  event: CalendarEvent,
  endpoint: string,
  body: Record<string, unknown>
) => {
  return fetcherShimmer(endpoint, {
    method: "POST",
    body: JSON.stringify({
      cal: event,
      daily: body,
    }),
  });
};

function postToDailyAPI(endpoint: string, body: Record<string, unknown>) {
  return fetcher(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const ShimmerDailyVideoApiAdapter = (): VideoApiAdapter => {
  async function createOrUpdateMeeting(endpoint: string, event: CalendarEvent): Promise<VideoCallData> {
    if (!event.uid) {
      throw new Error("We need the booking uid to create the Daily reference in DB");
    }
    const body = await translateEvent();
    const dailyEvent = await postToDailyAPI(endpoint, body).then(dailyReturnTypeSchema.parse);
    // const meetingToken = await postToDailyAPI("/meeting-tokens", {
    //   properties: { room_name: dailyEvent.name, exp: dailyEvent.config.exp, is_owner: true },
    // }).then(meetingTokenSchema.parse);
    await postToShimmerAPI(event, "trackDailyRoom", dailyEvent);

    return Promise.resolve({
      type: "shimmer_video",
      id: dailyEvent.name,
      password: "",
      //   password: meetingToken.token,
      url: `https://app.shimmer.care?videoId=${dailyEvent.name}`,
    });
  }

  const translateEvent = async () => {
    return {
      privacy: "private",
      properties: {
        enable_prejoin_ui: true,
        enable_people_ui: true,
        enable_emoji_reactions: true,
        enable_pip_ui: true,
        enable_hand_raising: true,
        enable_network_ui: true,
        enable_video_processing_ui: true,
        enable_noise_cancellation_ui: true,
        enable_advanced_chat: true,
        //above flags are for prebuilt daily
        enable_knocking: true,
        enable_screenshare: true,
        enable_chat: true,
      },
    };
  };

  return {
    /** Daily doesn't need to return busy times, so we return empty */
    getAvailability: () => {
      return Promise.resolve([]);
    },
    createMeeting: async (event: CalendarEvent): Promise<VideoCallData> =>
      createOrUpdateMeeting("/rooms", event),
    deleteMeeting: async (uid: string): Promise<void> => {
      await fetcher(`/rooms/${uid}`, { method: "DELETE" });
      return Promise.resolve();
    },
    updateMeeting: (bookingRef: PartialReference, event: CalendarEvent): Promise<VideoCallData> =>
      createOrUpdateMeeting(`/rooms/${bookingRef.uid}`, event),
    getRecordings: async (roomName: string): Promise<GetRecordingsResponseSchema> => {
      try {
        const res = await fetcher(`/recordings?room_name=${roomName}`).then(
          getRecordingsResponseSchema.parse
        );
        return Promise.resolve(res);
      } catch (err) {
        throw new Error("Something went wrong! Unable to get recording");
      }
    },
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
  };
};

export default ShimmerDailyVideoApiAdapter;
