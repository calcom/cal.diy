import process from "node:process";
import dayjs from "@calcom/dayjs";
import { symmetricDecrypt } from "@calcom/lib/crypto";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import type { PartialReference } from "@calcom/types/EventManager";
import type { VideoApiAdapter, VideoCallData } from "@calcom/types/VideoApiAdapter";
import { metadata } from "../_metadata";
import { createSession, deleteSession } from "./squadcastApi";

const log = logger.getSubLogger({ prefix: ["[squadcast]"] });

const SquadCastVideoApiAdapter = (credential: CredentialPayload): VideoApiAdapter => {
  const getApiToken = (): string => {
    const key = credential.key as { encrypted?: string } | undefined;
    if (key?.encrypted) {
      const encryptionKey = process.env.CALENDSO_ENCRYPTION_KEY;
      if (!encryptionKey) {
        throw new Error("CALENDSO_ENCRYPTION_KEY is not set");
      }
      const decrypted = symmetricDecrypt(key.encrypted, encryptionKey);
      const parsed = JSON.parse(decrypted);
      if (parsed.api_token) return parsed.api_token;
    }
    throw new Error("SquadCast API token not configured. Please configure it in app settings.");
  };

  const formatTimes = (event: CalendarEvent) => {
    const tz = event.organizer.timeZone;
    return {
      date: dayjs(event.startTime).tz(tz).format("YYYY-MM-DD"),
      startTime: dayjs(event.startTime).tz(tz).format("h:mm A"),
      endTime: dayjs(event.endTime).tz(tz).format("h:mm A"),
    };
  };

  return {
    getAvailability: () => Promise.resolve([]),

    createMeeting: async (event: CalendarEvent): Promise<VideoCallData> => {
      try {
        const apiToken = getApiToken();
        const { date, startTime, endTime } = formatTimes(event);

        const stage = [event.organizer.email, ...event.attendees.map((a) => a.email)];

        log.debug(
          "Creating SquadCast session",
          safeStringify({ sessionTitle: event.title, date, startTime, endTime, stage })
        );

        const session = await createSession(apiToken, {
          date,
          startTime,
          endTime,
          sessionTitle: event.title || "Cal.com Booking",
          stage,
        });

        const inviteUrl =
          session.stage[0]?.inviteLinks?.shortLink ?? session.stage[0]?.inviteLinks?.previewLink ?? "";

        if (!inviteUrl) {
          throw new Error("SquadCast session created but no invite link was returned");
        }

        log.debug("SquadCast session created", safeStringify({ sessionId: session.sessionID, inviteUrl }));

        return {
          type: metadata.type,
          id: session.sessionID,
          password: "",
          url: inviteUrl,
        };
      } catch (error) {
        log.error("Failed to create SquadCast meeting", safeStringify({ error }));
        throw error;
      }
    },

    updateMeeting: async (bookingRef: PartialReference, event: CalendarEvent): Promise<VideoCallData> => {
      try {
        const apiToken = getApiToken();
        const oldSessionId = bookingRef.meetingId as string;

        log.debug("Updating SquadCast session", safeStringify({ oldSessionId }));

        await deleteSession(apiToken, oldSessionId);

        const { date, startTime, endTime } = formatTimes(event);
        const stage = [event.organizer.email, ...event.attendees.map((a) => a.email)];

        const session = await createSession(apiToken, {
          date,
          startTime,
          endTime,
          sessionTitle: event.title || "Cal.com Booking",
          stage,
        });

        const inviteUrl =
          session.stage[0]?.inviteLinks?.shortLink ?? session.stage[0]?.inviteLinks?.previewLink ?? "";

        if (!inviteUrl) {
          throw new Error("SquadCast session created but no invite link was returned");
        }

        log.debug("SquadCast session updated", safeStringify({ sessionId: session.sessionID, inviteUrl }));

        return {
          type: metadata.type,
          id: session.sessionID,
          password: "",
          url: inviteUrl,
        };
      } catch (error) {
        log.error("Failed to update SquadCast meeting", safeStringify({ error }));
        throw error;
      }
    },

    deleteMeeting: async (uid: string): Promise<void> => {
      try {
        const apiToken = getApiToken();
        log.debug("Deleting SquadCast session", safeStringify({ sessionId: uid }));
        await deleteSession(apiToken, uid);
      } catch (error) {
        log.error("Failed to delete SquadCast meeting", safeStringify({ error }));
        throw error;
      }
    },
  };
};

export default SquadCastVideoApiAdapter;
