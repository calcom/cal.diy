import { z } from "zod";

import dayjs from "@calcom/dayjs";
import {
  APP_CREDENTIAL_SHARING_ENABLED,
  CREDENTIAL_SYNC_ENDPOINT,
  CREDENTIAL_SYNC_SECRET,
  CREDENTIAL_SYNC_SECRET_HEADER_NAME,
} from "@calcom/lib/constants";
import logger from "@calcom/lib/logger";
import { getPiiFreeCalendarEvent } from "@calcom/lib/piiFreeData";
import { safeStringify } from "@calcom/lib/safeStringify";
import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import { Frequency } from "@calcom/prisma/zod-utils";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import type { PartialReference } from "@calcom/types/EventManager";
import type { VideoApiAdapter, VideoCallData } from "@calcom/types/VideoApiAdapter";

import { invalidateCredential } from "../../_utils/invalidateCredential";
import { OAuthManager } from "../../_utils/oauth/OAuthManager";
import { getTokenObjectFromCredential } from "../../_utils/oauth/getTokenObjectFromCredential";
import { markTokenAsExpired } from "../../_utils/oauth/markTokenAsExpired";
import { metadata } from "../_metadata";
import { getZoomAppKeys } from "./getZoomAppKeys";

const log = logger.getSubLogger({ prefix: ["app-store/zoomvideo/lib/VideoApiAdapter"] });

/** @link https://marketplace.zoom.us/docs/api-reference/zoom-api/meetings/meetingcreate */
const zoomEventResultSchema = z.object({
  id: z.number(),
  join_url: z.string(),
  password: z.string().optional().default(""),
});

export type ZoomEventResult = z.infer<typeof zoomEventResultSchema>;

/** @link https://marketplace.zoom.us/docs/api-reference/zoom-api/methods/#operation/meetings */
export const zoomMeetingsSchema = z.object({
  next_page_token: z.string(),
  page_count: z.number(),
  page_number: z.number(),
  page_size: z.number(),
  total_records: z.number(),
  meetings: z.array(
    z.object({
      agenda: z.string(),
      created_at: z.string(),
      duration: z.number(),
      host_id: z.string(),
      id: z.number(),
      join_url: z.string(),
      pmi: z.string(),
      start_time: z.string(),
      timezone: z.string(),
      topic: z.string(),
      type: z.number(),
      uuid: z.string(),
    })
  ),
});

export type ZoomUserSettings = z.infer<typeof zoomUserSettingsSchema>;

const meetingPasswordRequirementSchema = z
  .object({
    length: z.number().optional(),
    have_letter: z.boolean().optional(),
    have_number: z.boolean().optional(),
    have_special_character: z.boolean().optional(),
    have_upper_and_lower_characters: z.boolean().optional(),
    only_allow_numeric: z.boolean().optional(),
    consecutive_characters_length: z.number().optional(),
  })
  .passthrough()
  .optional();

export type MeetingPasswordRequirement = z.infer<typeof meetingPasswordRequirementSchema>;

export function hasInvalidConsecutiveChars(
  password: string,
  consecutiveLength: number | undefined
): boolean {
  if (!consecutiveLength || consecutiveLength < 4) return false;

  const maxRun = consecutiveLength - 1;
  const lowerPassword = password.toLowerCase();

  // Define QWERTY keyboard sequences (both rows and columns)
  const qwertySequences = [
    "qwertyuiop",
    "asdfghjkl",
    "zxcvbnm",
    "qwertyuiop".split("").reverse().join(""),
    "asdfghjkl".split("").reverse().join(""),
    "zxcvbnm".split("").reverse().join(""),
  ];

  // Check for keyboard sequences
  for (const sequence of qwertySequences) {
    for (let i = 0; i <= sequence.length - consecutiveLength; i++) {
      const seq = sequence.substring(i, i + consecutiveLength);
      if (lowerPassword.includes(seq)) {
        return true;
      }
    }
  }

  // Check for repetitive characters (e.g., "11111", "aaaaa")
  let repetitiveRun = 1;
  for (let i = 1; i < password.length; i++) {
    if (password[i] === password[i - 1]) {
      repetitiveRun++;
      if (repetitiveRun > maxRun) return true;
    } else {
      repetitiveRun = 1;
    }
  }

  // Check for sequential characters (ascending: "12345", "abcde")
  let ascendingRun = 1;
  for (let i = 1; i < password.length; i++) {
    if (password.charCodeAt(i) === password.charCodeAt(i - 1) + 1) {
      ascendingRun++;
      if (ascendingRun > maxRun) return true;
    } else {
      ascendingRun = 1;
    }
  }

  // Check for sequential characters (descending: "54321", "edcba")
  let descendingRun = 1;
  for (let i = 1; i < password.length; i++) {
    if (password.charCodeAt(i) === password.charCodeAt(i - 1) - 1) {
      descendingRun++;
      if (descendingRun > maxRun) return true;
    } else {
      descendingRun = 1;
    }
  }

  return false;
}

function validatePasswordAgainstRequirements(
  password: string,
  requirements: NonNullable<MeetingPasswordRequirement>
): boolean {
  if (requirements.length && password.length < requirements.length) {
    return false;
  }

  if (hasInvalidConsecutiveChars(password, requirements.consecutive_characters_length)) {
    return false;
  }

  if (requirements.only_allow_numeric) {
    return /^\d+$/.test(password);
  }

  if (requirements.have_letter && !/[a-zA-Z]/.test(password)) {
    return false;
  }

  if (requirements.have_number && !/\d/.test(password)) {
    return false;
  }

  if (
    requirements.have_special_character &&
    !/[!@#$%^&*()_\-+=[\]{}|;:,.<>?]/.test(password)
  ) {
    return false;
  }

  if (requirements.have_upper_and_lower_characters) {
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
      return false;
    }
  }

  return true;
}

function getCompliantPassword(
  defaultPassword: string | null | undefined,
  requirements: MeetingPasswordRequirement
): string | undefined {
  if (!requirements ) {
    return defaultPassword ?? undefined;
  }

  if (defaultPassword && validatePasswordAgainstRequirements(defaultPassword, requirements)) {
    return defaultPassword;
  }

  return undefined;
}

/** @link https://developers.zoom.us/docs/api/rest/reference/user/methods/#operation/userSettings */
export const zoomUserSettingsSchema = z.object({
  recording: z
    .object({
      auto_recording: z.string().nullish(),
    })
    .nullish(),
  schedule_meeting: z
    .object({
      default_password_for_scheduled_meetings: z.string().nullish(),
      meeting_password_requirement: meetingPasswordRequirementSchema,
    })
    .nullish(),
  in_meeting: z
    .object({
      waiting_room: z.boolean(),
    })
    .nullish(),
});

// https://developers.zoom.us/docs/api/rest/reference/user/methods/#operation/userSettings
// append comma separated settings here, to retrieve only these specific settings
const settingsApiFilterResp =
  "default_password_for_scheduled_meetings,meeting_password_requirement,auto_recording,waiting_room";

type ZoomRecurrence = {
  end_date_time?: string;
  type: 1 | 2 | 3;
  end_times?: number;
  repeat_interval?: number;
  weekly_days?: number; // 1-7 Sunday = 1, Saturday = 7
  monthly_day?: number; // 1-31
};

const ZoomVideoApiAdapter = (credential: CredentialPayload): VideoApiAdapter => {
  const tokenResponse = getTokenObjectFromCredential(credential);

  const getUserSettings = async () => {
    let userSettings: ZoomUserSettings | undefined;
    try {
      const responseBody = await fetchZoomApi(
        `users/me/settings?custom_query_fields=${settingsApiFilterResp}`
      );
      userSettings = zoomUserSettingsSchema.parse(responseBody);
    } catch (err) {
      log.error("Failed to retrieve zoom user settings", safeStringify(err));
    }
    return userSettings;
  };

  const translateEvent = async (event: CalendarEvent) => {
    const getRecurrence = ({
      recurringEvent,
      startTime,
      attendees,
    }: CalendarEvent): { recurrence: ZoomRecurrence } | undefined => {
      if (!recurringEvent) {
        return;
      }

      let recurrence: ZoomRecurrence;

      switch (recurringEvent.freq) {
        case Frequency.DAILY:
          recurrence = {
            type: 1,
          };
          break;
        case Frequency.WEEKLY:
          recurrence = {
            type: 2,
            weekly_days: dayjs(startTime).tz(attendees[0].timeZone).day() + 1,
          };
          break;
        case Frequency.MONTHLY:
          recurrence = {
            type: 3,
            monthly_day: dayjs(startTime).tz(attendees[0].timeZone).date(),
          };
          break;
        default:
          // Zoom does not support YEARLY, HOURLY or MINUTELY frequencies, don't do anything in those cases.
          return;
      }

      recurrence.repeat_interval = recurringEvent.interval;

      if (recurringEvent.until) {
        recurrence.end_date_time = recurringEvent.until.toISOString();
      } else {
        recurrence.end_times = recurringEvent.count;
      }

      return {
        recurrence: {
          ...recurrence,
        },
      };
    };

    // Zoom agenda field has a 2000 character limit; we set maxLength to 1900 to leave a safety buffer
    const truncateAgenda = (description?: string | null) => {
      if (!description) return description;

      const maxLength = 1900;
      const trimmed = description.trimEnd();
      if (trimmed.length > maxLength) {
        return `${trimmed.substring(0, maxLength).trimEnd()}...`;
      }
      return trimmed;
    };

    const userSettings = await getUserSettings();
    const recurrence = getRecurrence(event);
    const waitingRoomEnabled = userSettings?.in_meeting?.waiting_room ?? false;

    const passwordRequirements = userSettings?.schedule_meeting?.meeting_password_requirement;
    const defaultPassword = userSettings?.schedule_meeting?.default_password_for_scheduled_meetings;
    const password = getCompliantPassword(defaultPassword, passwordRequirements);

    // Documentation at: https://marketplace.zoom.us/docs/api-reference/zoom-api/meetings/meetingcreate
    return {
      topic: event.title,
      type: 2, // Means that this is a scheduled meeting
      start_time: dayjs(event.startTime).tz(event.organizer.timeZone).format("YYYY-MM-DDTHH:mm:ss"),
      duration: (new Date(event.endTime).getTime() - new Date(event.startTime).getTime()) / 60000,
      //schedule_for: "string",   TODO: Used when scheduling the meeting for someone else (needed?)
      timezone: event.organizer.timeZone,
      agenda: truncateAgenda(event.description),
      ...(password && { password }),
      settings: {
        host_video: true,
        participant_video: true,
        cn_meeting: false, // TODO: true if host meeting in China
        in_meeting: false, // TODO: true if host meeting in India
        join_before_host: !waitingRoomEnabled,
        mute_upon_entry: false,
        watermark: false,
        use_pmi: false,
        approval_type: 2,
        audio: "both",
        auto_recording: userSettings?.recording?.auto_recording || "none",
        enforce_login: false,
        registrants_email_notification: true,
        waiting_room: waitingRoomEnabled,
      },
      ...recurrence,
    };
  };

  /**
   * Zoom is known to return xml response in some cases.
   * e.g. Wrong request or some special case of invalid token
   */
  const handleZoomResponseJsonParseError = async ({
    error,
    clonedResponse,
  }: {
    error: unknown;
    clonedResponse: Response;
  }) => {
    // In some cases, Zoom responds with xml response, so we log the response for debugging
    // We need to see why that error occurs exactly and then later we decide if mark the access token and token object unusable or not
    log.error(
      "Error in JSON parsing Zoom API response",
      safeStringify({
        error: safeStringify(error),
        // Log Raw response body here.
        responseBody: await clonedResponse.text(),
        status: clonedResponse.status,
      })
    );

    return null;
  };

  const fetchZoomApi = async (endpoint: string, options?: RequestInit) => {
    const auth = new OAuthManager({
      credentialSyncVariables: {
        APP_CREDENTIAL_SHARING_ENABLED: APP_CREDENTIAL_SHARING_ENABLED,
        CREDENTIAL_SYNC_ENDPOINT: CREDENTIAL_SYNC_ENDPOINT,
        CREDENTIAL_SYNC_SECRET: CREDENTIAL_SYNC_SECRET,
        CREDENTIAL_SYNC_SECRET_HEADER_NAME: CREDENTIAL_SYNC_SECRET_HEADER_NAME,
      },
      resourceOwner: {
        type: "user",
        id: credential.userId,
      },
      appSlug: metadata.slug,
      currentTokenObject: tokenResponse,
      fetchNewTokenObject: async ({ refreshToken }: { refreshToken: string | null }) => {
        if (!refreshToken) {
          return null;
        }
        const clientCredentials = await getZoomAppKeys();
        const { client_id, client_secret } = clientCredentials;
        const authHeader = `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString("base64")}`;
        return fetch("https://zoom.us/oauth/token", {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }),
        });
      },
      isTokenObjectUnusable: async function (response) {
        const myLog = logger.getSubLogger({ prefix: ["zoomvideo:isTokenObjectUnusable"] });
        myLog.info(safeStringify({ status: response.status, ok: response.ok }));
        if (!response.ok) {
          let responseBody;
          const responseToUseInCaseOfError = response.clone();
          try {
            responseBody = await response.json();
          } catch (e) {
            return await handleZoomResponseJsonParseError({
              error: e,
              clonedResponse: responseToUseInCaseOfError,
            });
          }
          // Log error details from Zoom (excluding any sensitive token data)
          myLog.error(
            "Zoom token refresh failed",
            safeStringify({
              status: response.status,
              error: responseBody.error,
              errorDescription: responseBody.error_description,
              reason: responseBody.reason,
            })
          );

          if (responseBody.error === "invalid_grant") {
            return { reason: responseBody.error };
          }
        }
        return null;
      },
      isAccessTokenUnusable: async function (response) {
        const myLog = logger.getSubLogger({ prefix: ["zoomvideo:isAccessTokenUnusable"] });
        myLog.info(safeStringify({ status: response.status, ok: response.ok }));
        if (!response.ok) {
          let responseBody;
          const responseToUseInCaseOfError = response.clone();
          try {
            responseBody = await response.json();
          } catch (e) {
            return await handleZoomResponseJsonParseError({
              error: e,
              clonedResponse: responseToUseInCaseOfError,
            });
          }
          myLog.debug(safeStringify({ responseBody }));
          // 124 is the error code for invalid access token from Zoom API
          if (responseBody.code === 124) {
            return { reason: responseBody.message ?? "" };
          }
        }
        return null;
      },
      invalidateTokenObject: () => invalidateCredential(credential.id),
      expireAccessToken: () => markTokenAsExpired(credential),
      updateTokenObject: async (newTokenObject) => {
        await prisma.credential.update({
          where: {
            id: credential.id,
          },
          data: {
            // z.passthrough() is not allowed in Prisma, but we know this is trusted.
            key: newTokenObject as unknown as Prisma.InputJsonValue,
          },
        });
      },
    });

    const { json } = await auth.request({
      url: `https://api.zoom.us/v2/${endpoint}`,
      options: {
        method: "GET",
        ...options,
        headers: {
          ...options?.headers,
        },
      },
    });

    return json;
  };

  return {
    getAvailability: async () => {
      try {
        // TODO Possibly implement pagination for cases when there are more than 300 meetings already scheduled.
        const responseBody = await fetchZoomApi("users/me/meetings?type=scheduled&page_size=300");

        const data = zoomMeetingsSchema.parse(responseBody);
        return data.meetings.map((meeting) => ({
          start: meeting.start_time,
          end: new Date(new Date(meeting.start_time).getTime() + meeting.duration * 60000).toISOString(),
        }));
      } catch (err) {
        log.error("Failed to get availability", safeStringify(err));
        /* Prevents booking failure when Zoom Token is expired */
        return [];
      }
    },
    createMeeting: async (event: CalendarEvent): Promise<VideoCallData> => {
      try {
        const response = await fetchZoomApi("users/me/meetings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(await translateEvent(event)),
        });

        const result = zoomEventResultSchema.parse(response);

        if (result.id && result.join_url) {
          return {
            type: "zoom_video",
            id: result.id.toString(),
            password: result.password || "",
            url: result.join_url,
          };
        }
        throw new Error(`Failed to create meeting. Response is ${JSON.stringify(result)}`);
      } catch (err) {
        log.error(
          "Zoom meeting creation failed",
          safeStringify({ error: safeStringify(err), event: getPiiFreeCalendarEvent(event) })
        );
        /* Prevents meeting creation failure when Zoom Token is expired */
        throw new Error("Unexpected error");
      }
    },
    deleteMeeting: async (uid: string): Promise<void> => {
      try {
        await fetchZoomApi(`meetings/${uid}`, {
          method: "DELETE",
        });
        return Promise.resolve();
      } catch {
        return Promise.reject(new Error("Failed to delete meeting"));
      }
    },
    updateMeeting: async (bookingRef: PartialReference, event: CalendarEvent): Promise<VideoCallData> => {
      try {
        await fetchZoomApi(`meetings/${bookingRef.uid}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(await translateEvent(event)),
        });

        const updatedMeeting = await fetchZoomApi(`meetings/${bookingRef.uid}`);
        const result = zoomEventResultSchema.parse(updatedMeeting);

        return {
          type: "zoom_video",
          id: result.id.toString(),
          password: result.password || "",
          url: result.join_url,
        };
      } catch (err) {
        log.error(
          "Failed to update meeting",
          safeStringify({ error: err, event: getPiiFreeCalendarEvent(event) })
        );
        return Promise.reject(new Error("Failed to update meeting"));
      }
    },
  };
};

export default ZoomVideoApiAdapter;
