import { v4 as uuidv4 } from "uuid";

import type { CalendarEvent } from "@calcom/types/Calendar";
import type { PartialReference } from "@calcom/types/EventManager";
import type { VideoApiAdapter, VideoCallData } from "@calcom/types/VideoApiAdapter";

import getAppKeysFromSlug from "../../_utils/getAppKeysFromSlug";
import { metadata } from "../_metadata";

const JitsiVideoApiAdapter = (): VideoApiAdapter => {
  return {
    getAvailability: () => {
      return Promise.resolve([]);
    },
    createMeeting: async (eventData: CalendarEvent): Promise<VideoCallData> => {
      const appKeys = await getAppKeysFromSlug(metadata.slug);

      const meetingPattern = (appKeys.jitsiPathPattern as string) || "{uuid}";
      const hostUrl = (appKeys.jitsiHost as string) || "https://meet.jit.si/cal";

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

      return Promise.resolve({
        type: metadata.type,
        id: meetingID,
        password: "",
        url: `${hostUrl}/${encodeURIComponent(meetingID)}`,
      });
    },
    deleteMeeting: async (): Promise<void> => {
      Promise.resolve();
    },
    updateMeeting: (bookingRef: PartialReference): Promise<VideoCallData> => {
      return Promise.resolve({
        type: "jitsi_video",
        id: bookingRef.meetingId as string,
        password: bookingRef.meetingPassword as string,
        url: bookingRef.meetingUrl as string,
      });
    },
  };
};

export default JitsiVideoApiAdapter;
