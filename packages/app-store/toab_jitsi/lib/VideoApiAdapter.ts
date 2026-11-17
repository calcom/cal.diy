// Cal.com video adapter contract: https://github.com/calcom/cal.diy/blob/main/packages/types/VideoApiAdapter.d.ts
import prisma from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import type { CalendarEvent, EventBusyDate } from "@calcom/types/Calendar";
import type { PartialReference } from "@calcom/types/EventManager";
import type { VideoApiAdapter, VideoCallData } from "@calcom/types/VideoApiAdapter";
import { z } from "zod";
import config from "../config.json";
import { appDataSchema } from "../zod";
import { moderatorRequest } from "./common";

const locationsSchema: z.ZodType<Array<{ type: string }>> = z.array(z.object({ type: z.string() }));
const conferenceResponseSchema: z.ZodType<{
  bookingUid: string;
  bookingId?: number | null;
  roomId: string;
  serverId: number;
  videoUri: string;
}> = z.object({
  bookingUid: z.string(),
  bookingId: z.number().int().nullish(),
  roomId: z.string().min(1),
  serverId: z.number().int(),
  videoUri: z.string().url(),
});

/** Build the Cal.com video adapter that creates and cancels Moderator conferences. */
const JitsiModeratorApiAdapter = (): VideoApiAdapter => ({
  /** Return no precomputed availability; Cal.com handles slot discovery. */
  getAvailability: async (): Promise<EventBusyDate[]> => [],

  /** Create a Moderator conference for a Cal.com booking. */
  createMeeting: async (eventData: CalendarEvent): Promise<VideoCallData> => {
    if (!eventData.eventTypeId) throw new Error("TOAB Jitsi requires an event type");
    if (!eventData.uid) throw new Error("Cal.com did not provide a booking UID for TOAB Jitsi");

    const eventType = await prisma.eventType.findUnique({
      where: { id: eventData.eventTypeId },
      select: { locations: true, metadata: true },
    });
    const locations = locationsSchema.safeParse(eventType?.locations);
    if (!locations.success || !locations.data.some(({ type }) => type === "integrations:toab_jitsi")) {
      throw new Error("Select TOAB Jitsi as this event type's location before creating a booking");
    }

    const eventMetadata = eventType?.metadata;
    let appDataValue: Prisma.JsonValue | undefined;
    if (eventMetadata && typeof eventMetadata === "object" && !Array.isArray(eventMetadata)) {
      const apps = (eventMetadata as Prisma.JsonObject).apps;
      if (apps && typeof apps === "object" && !Array.isArray(apps)) {
        appDataValue = (apps as Prisma.JsonObject)[config.slug];
      }
    }
    const appData = appDataSchema.parse(appDataValue ?? {});
    if (!appData.userId || !appData.serverId) {
      throw new Error("Choose a TOAB Jitsi server in the event type settings before creating a booking");
    }

    const conference = conferenceResponseSchema.parse(
      await moderatorRequest<unknown>("/api/calcom/conferences", {
        method: "POST",
        body: JSON.stringify({
          bookingUid: eventData.uid,
          bookingId: eventData.bookingId,
          userId: appData.userId,
          serverId: appData.serverId,
        }),
      })
    );

    return {
      type: config.type,
      id: conference.bookingUid,
      password: "",
      url: conference.videoUri,
    };
  },

  /** Cancel the Moderator conference associated with a Cal.com booking UID. */
  deleteMeeting: async (bookingUid: string): Promise<void> => {
    const booking = await prisma.booking.findUnique({
      where: { uid: bookingUid },
      select: { eventType: { select: { metadata: true } } },
    });
    if (!booking) throw new Error("Cal.com booking not found while cancelling TOAB Jitsi conference");

    const eventTypeMetadata = booking.eventType?.metadata;
    let appDataValue: Prisma.JsonValue | undefined;
    if (eventTypeMetadata && typeof eventTypeMetadata === "object" && !Array.isArray(eventTypeMetadata)) {
      const apps = (eventTypeMetadata as Prisma.JsonObject).apps;
      if (apps && typeof apps === "object" && !Array.isArray(apps)) {
        appDataValue = (apps as Prisma.JsonObject)[config.slug];
      }
    }
    const userId = appDataSchema.parse(appDataValue ?? {}).userId;
    if (!userId) throw new Error("TOAB Jitsi organizer user ID is missing from event type settings");

    await moderatorRequest<void>(
      `/api/calcom/conferences/${encodeURIComponent(bookingUid)}?userId=${userId}`,
      { method: "DELETE" }
    );
  },

  /** Rebuild video call data from the existing Cal.com meeting reference. */
  updateMeeting: async (bookingRef: PartialReference): Promise<VideoCallData> => ({
    type: config.type,
    id: bookingRef.meetingId as string,
    password: bookingRef.meetingPassword as string,
    url: bookingRef.meetingUrl as string,
  }),
});

export default JitsiModeratorApiAdapter;
