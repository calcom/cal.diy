import { stringify } from "node:querystring";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import prisma from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import type { PartialReference } from "@calcom/types/EventManager";
import type { VideoApiAdapter, VideoCallData } from "@calcom/types/VideoApiAdapter";

import getAppKeysFromSlug from "../../_utils/getAppKeysFromSlug";
import getParsedAppKeysFromSlug from "../../_utils/getParsedAppKeysFromSlug";
import { invalidateCredential } from "../../_utils/invalidateCredential";
import { OAuthManager } from "../../_utils/oauth/OAuthManager";
import { markTokenAsExpired } from "../../_utils/oauth/markTokenAsExpired";
import { oAuthManagerHelper } from "../../_utils/oauth/oAuthManagerHelper";
import config from "../config.json";
import { appKeysSchema } from "../zod";

const nextcloudEventResultSchema = z.object({
  ocs: z.object({
    meta: z.object({
      status: z.string(),
      statuscode: z.number(),
      message: z.string(),
    }),
    data: z.object({
      token: z.string(),
    }),
  }),
});

const NextcloudTalkVideoApiAdapter = (credential: CredentialPayload): VideoApiAdapter => {
  const tokenResponse = oAuthManagerHelper.getTokenObjectFromCredential(credential);

  const clientCredentials = getParsedAppKeysFromSlug(config.slug, appKeysSchema);

  const fetchNextcloudApi = async (endpoint: string, options?: RequestInit) => {
    const auth = new OAuthManager({
      credentialSyncVariables: oAuthManagerHelper.credentialSyncVariables,
      resourceOwner: {
        type: "user",
        id: credential.userId,
      },
      appSlug: config.slug,
      currentTokenObject: tokenResponse,
      fetchNewTokenObject: async ({ refreshToken }: { refreshToken: string | null }) => {
        const { nextcloudTalkClientId, nextcloudTalkClientSecret, nextcloudTalkHost } =
          await clientCredentials;
        if (!refreshToken) {
          return null;
        }
        const params = {
          client_id: nextcloudTalkClientId,
          client_secret: nextcloudTalkClientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        };
        const query = stringify(params);
        return fetch(`${nextcloudTalkHost}/index.php/apps/oauth2/api/v1/token?${query}`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: new URLSearchParams({}),
        });
      },
      isTokenObjectUnusable: async function (response) {
        const myLog = logger.getSubLogger({ prefix: ["nextcloudtalkvideo:isTokenObjectUnusable"] });
        myLog.debug(safeStringify({ status: response.status, ok: response.ok }));
        if (!response.ok || (response.status < 200 && response.status >= 300)) {
          const responseBody = await response.json();
          myLog.debug(safeStringify({ responseBody }));

          if (responseBody.error === "invalid_grant") {
            return { reason: responseBody.error };
          }
        }
        return null;
      },
      isAccessTokenUnusable: async function (response) {
        const myLog = logger.getSubLogger({ prefix: ["nextcloudtalkvideo:isAccessTokenUnusable"] });
        myLog.debug(safeStringify({ status: response.status, ok: response.ok }));
        if (!response.ok || (response.status < 200 && response.status >= 300)) {
          const responseBody = await response.json();
          myLog.debug(safeStringify({ responseBody }));

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
            key: newTokenObject as unknown as Prisma.InputJsonValue,
          },
        });
      },
    });

    const { nextcloudTalkHost } = await clientCredentials;
    const { json } = await auth.request({
      url: `${nextcloudTalkHost}/${endpoint}`,
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
    getAvailability: () => {
      return Promise.resolve([]);
    },
    createMeeting: async (eventData: CalendarEvent): Promise<VideoCallData> => {
      const appKeys = await getAppKeysFromSlug(config.slug);
      const meetingPattern = (appKeys.nextcloudTalkPattern as string) || "{uuid}";
      const hostUrl = appKeys.nextcloudTalkHost as string;

      //Allows "/{Type}-with-{Attendees}" slug
      const meetingID = meetingPattern
        .replaceAll("{uuid}", uuidv4())
        // "$&", "$`", "$'" and "$$" in a replacement string are substitution patterns, and titles
        // and names can contain them, so values go in through a replacer function, which is literal
        .replaceAll("{Title}", () => eventData.title)
        .replaceAll("{Event Type Title}", () => eventData.type)
        .replaceAll("{Scheduler}", () => eventData.attendees.map((a) => a.name).join("-"))
        .replaceAll("{Organizer}", () => eventData.organizer.name)
        .replaceAll("{Location}", () => eventData.location || "")
        .replaceAll("{Team}", () => eventData.team?.name || "")
        .replaceAll(" ", "-"); //Last Rule! - Replace all blanks (%20) with dashes;

      try {
        // Create video link with room type 3 (constant for a public room, see https://nextcloud-talk.readthedocs.io/en/stable/constants/#conversation-types)
        const response = await fetchNextcloudApi(`ocs/v2.php/apps/spreed/api/v4/room`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "OCS-APIRequest": "true",
          },
          body: JSON.stringify({
            roomType: 3,
            roomName: `${meetingID}`,
          }),
        });
        const result = nextcloudEventResultSchema.parse(response);

        if (result.ocs && result.ocs.data) {
          return {
            type: config.type,
            id: result.ocs.data.token,
            password: "",
            url: `${hostUrl}/call/${result.ocs.data.token}`,
          };
        }
        throw new Error(`Failed to create meeting. Response is ${JSON.stringify(result)}`);
      } catch (err) {
        console.error(err);
        /* Prevents meeting creation failure when token is expired */
        throw new Error("Unexpected error");
      }
    },
    deleteMeeting: async (uid: string): Promise<void> => {
      try {
        // Remove video link from Nextcloud
        const response = await fetchNextcloudApi(`ocs/v2.php/apps/spreed/api/v4/room/${uid}`, {
          method: "DELETE",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "OCS-APIRequest": "true",
          },
        });
        const result = nextcloudEventResultSchema.parse(response);

        if (result.ocs && result.ocs.meta && result.ocs.meta.status === "ok") {
          return Promise.resolve();
        }
        throw new Error(`Failed to delete meeting. Response is ${JSON.stringify(result)}`);
      } catch (err) {
        return Promise.reject(new Error("Failed to delete meeting"));
      }
    },
    updateMeeting: (bookingRef: PartialReference): Promise<VideoCallData> => {
      return Promise.resolve({
        type: config.type,
        id: bookingRef.meetingId as string,
        password: bookingRef.meetingPassword as string,
        url: bookingRef.meetingUrl as string,
      });
    },
  };
};

export default NextcloudTalkVideoApiAdapter;
