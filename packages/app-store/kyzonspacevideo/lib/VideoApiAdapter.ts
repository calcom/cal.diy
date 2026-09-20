import axios from "axios";

import { Frequency as CalFrequency } from "@calcom/prisma/zod-utils";
import type { CalendarEvent, EventBusyDate, RecurringEvent } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import type { PartialReference } from "@calcom/types/EventManager";
import type { VideoApiAdapter, VideoCallData } from "@calcom/types/VideoApiAdapter";

import config from "../config.json";
import { kyzonCredentialKeySchema, type KyzonCredentialKey } from "./KyzonCredentialKey";
import type {
  KyzonGetCalendarEventResponse,
  KyzonCreateOrPutCalendarEventRequestBody,
  KyzonCreateSpaceCallRequestBody,
  KyzonGetSpaceCallsWithinRangeRequestQuery,
  KyzonSpaceCallResponse,
  KyzonSingleSpaceCallWithinRangeResponse,
  KyzonCalendarEventRecurrence,
} from "./apiTypes";
import { kyzonAxiosInstance } from "./axios";
import { refreshKyzonToken, isTokenExpired } from "./tokenManager";

const KyzonVideoApiAdapter = (credential: CredentialPayload): VideoApiAdapter => {
  let cachedKey: KyzonCredentialKey | null = null;

  const getRefreshedKey = async (): Promise<KyzonCredentialKey> => {
    if (!cachedKey) {
      cachedKey = kyzonCredentialKeySchema.parse(credential.key);
    }

    // Check if token needs refresh and has refresh capability
    if (isTokenExpired(cachedKey)) {
      const refreshedToken = await refreshKyzonToken(credential.id);
      if (refreshedToken) {
        cachedKey = refreshedToken;
      }
    }

    return cachedKey;
  };

  const authenticatedRequest = async <T>(operation: (key: KyzonCredentialKey) => Promise<T>): Promise<T> => {
    const key = await getRefreshedKey();

    try {
      return await operation(key);
    } catch (error) {
      // Only retry on 401 with a different token
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        const refreshedToken = await refreshKyzonToken(credential.id);
        if (refreshedToken && refreshedToken.access_token !== key.access_token) {
          cachedKey = refreshedToken;
          return await operation(refreshedToken);
        }
      }
      throw error;
    }
  };

  const createMeeting = async (event: CalendarEvent): Promise<VideoCallData> => {
    try {
      const { data: spaceCallData } = await authenticatedRequest((key) =>
        kyzonAxiosInstance.post<KyzonSpaceCallResponse>(
          `/v1/teams/${key.team_id}/space/calls`,
          {
            name: event.title,
            isScheduled: true,
          } satisfies KyzonCreateSpaceCallRequestBody,
          {
            headers: {
              Authorization: `Bearer ${key.access_token}`,
            },
          }
        )
      );

      const { data: calendarData } = await authenticatedRequest((key) =>
        kyzonAxiosInstance.post<KyzonGetCalendarEventResponse>(
          `/v1/teams/${key.team_id}/calendar-events`,
          {
            title: event.title,
            description: event.description ?? undefined,
            location: {
              spaceCallId: spaceCallData.id,
            },
            isAllDay: false,
            timezone: event.organizer?.timeZone || "Etc/UTC",
            startDateUtcISOString: new Date(event.startTime).toISOString(),
            endDateUtcISOString: new Date(event.endTime).toISOString(),
            recurrence: event.recurringEvent ? convertCalRecurrenceToKyzon(event.recurringEvent) : undefined,
            invitees: event.attendees?.map((attendee) => ({
              email: attendee.email,
            })),
            thirdPartySource: {
              calendarSource: "Cal.com",
              eventId: event.uid || "",
            },
            hasWaitRoom: true,
            meetingFilesInWaitRoom: true,
          } satisfies KyzonCreateOrPutCalendarEventRequestBody,
          {
            headers: {
              Authorization: `Bearer ${key.access_token}`,
            },
          }
        )
      );

      return {
        type: config.type,
        id: calendarData.id,
        password: calendarData.meetingPassword || spaceCallData.password,
        url: calendarData.meetingLink || spaceCallData.url,
      };
    } catch (error) {
      const err = error as any;

      console.error("Failed to create KYZON Space meeting:", {
        status: err?.response?.status,
        message: err?.message,
        code: err?.code,
        eventTitle: event.title,
      });

      let friendlyErrorMessage = "Unable to create KYZON Space meeting. Please try again.";

      if (axios.isAxiosError(err)) {
        if (err.response?.status === 403) {
          friendlyErrorMessage =
            "You don't have permission to create meetings in KYZON Space. Please check your account permissions.";
        } else if (err.response?.status === 429) {
          friendlyErrorMessage =
            "KYZON Space is currently experiencing high traffic. Please wait a moment and try again.";
        } else if (typeof err.response?.status === "number" && err.response?.status >= 500) {
          friendlyErrorMessage = "KYZON Space is temporarily unavailable. Please try again in a few minutes.";
        } else if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
          friendlyErrorMessage =
            "Cannot connect to KYZON Space. Please check your internet connection and try again.";
        }
      }

      throw new Error(friendlyErrorMessage);
    }
  };

  return {
    createMeeting,

    updateMeeting: async (bookingRef: PartialReference, event: CalendarEvent): Promise<VideoCallData> => {
      if (!bookingRef.meetingId) {
        return await createMeeting(event);
      }

      try {
        const { data: updatedCalendarEvent } = await authenticatedRequest((key) =>
          kyzonAxiosInstance.put<KyzonGetCalendarEventResponse>(
            `/v1/teams/${key.team_id}/calendar-events/${bookingRef.meetingId}`,
            {
              title: event.title,
              description: event.description ?? undefined,
              isAllDay: false,
              timezone: event.organizer?.timeZone || "Etc/UTC",
              startDateUtcISOString: new Date(event.startTime).toISOString(),
              endDateUtcISOString: new Date(event.endTime).toISOString(),
              recurrence: event.recurringEvent
                ? convertCalRecurrenceToKyzon(event.recurringEvent)
                : undefined,
              invitees: event.attendees?.map((attendee) => ({
                email: attendee.email,
              })),
              thirdPartySource: {
                calendarSource: "Cal.com",
                eventId: event.uid || "",
              },
              hasWaitRoom: true,
              meetingFilesInWaitRoom: true,
            } satisfies KyzonCreateOrPutCalendarEventRequestBody,
            {
              headers: {
                Authorization: `Bearer ${key.access_token}`,
              },
            }
          )
        );

        return {
          type: config.type,
          id: updatedCalendarEvent.id,
          password: updatedCalendarEvent.meetingPassword || "",
          url: updatedCalendarEvent.meetingLink || "",
        };
      } catch (error) {
        const err = error as any;

        console.warn("Failed to update KYZON Space meeting:", {
          status: err?.response?.status,
          message: err?.message,
          code: err?.code,
          meetingId: bookingRef.meetingId,
          eventTitle: event.title,
        });

        // For 404 errors, the meeting might have been deleted - try creating a new one
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          console.info("Meeting not found, creating a new KYZON Space meeting instead");
          return await createMeeting(event);
        }

        // For other errors, return existing meeting data to maintain functionality
        // The booking will still work with the original meeting details
        return {
          type: config.type,
          id: bookingRef.meetingId,
          password: bookingRef.meetingPassword || "",
          url: bookingRef.meetingUrl || "",
        };
      }
    },

    deleteMeeting: async (meetingId: string): Promise<void> => {
      try {
        await authenticatedRequest((key) =>
          kyzonAxiosInstance.delete(`/v1/teams/${key.team_id}/calendar-events/${meetingId}`, {
            headers: {
              Authorization: `Bearer ${key.access_token}`,
            },
          })
        );
      } catch (error) {
        // Don't throw error if calendar event deletion fails
        // as it might have already been deleted or expired
        const err = error as any;
        console.warn(`Failed to delete KYZON calendar event ${meetingId}:`, {
          status: err?.response?.status,
          message: err?.message,
          code: err?.code,
        });
      }
    },

    getAvailability: async (dateFrom?: string, dateTo?: string): Promise<EventBusyDate[]> => {
      if (!dateFrom || !dateTo) {
        return [];
      }

      try {
        const response = await authenticatedRequest((key) =>
          kyzonAxiosInstance.get<KyzonSingleSpaceCallWithinRangeResponse[]>(
            `/v1/teams/${key.team_id}/space/calls`,
            {
              params: {
                startDateUtcISOString: dateFrom,
                endDateUtcISOString: dateTo,
              } satisfies KyzonGetSpaceCallsWithinRangeRequestQuery,
              headers: {
                Authorization: `Bearer ${key.access_token}`,
              },
            }
          )
        );

        const spaceCalls = response.data;

        return spaceCalls.reduce<EventBusyDate[]>((acc, call) => {
          if (!call.eventTime.endTimeUtcISOString) {
            // ongoing / all-day event, don't count it as a busy date
            return acc;
          }

          acc.push({
            start: call.eventTime.startTimeUtcISOString,
            end: call.eventTime.endTimeUtcISOString,
            source: "KYZON Space",
          });

          return acc;
        }, []);
      } catch (error) {
        const err = error as any;
        console.warn("Failed to get KYZON Space availability:", {
          status: err?.response?.status,
          message: err?.message,
          code: err?.code,
        });
        return [];
      }
    },
  };
};

export default KyzonVideoApiAdapter;

/**
 * Converts Cal.com's RecurringEvent format to KYZON Space's Recurrence format
 */
function convertCalRecurrenceToKyzon(
  calRecurrence: RecurringEvent
): KyzonCalendarEventRecurrence | undefined {
  if (!calRecurrence) return undefined;

  let frequency: KyzonCalendarEventRecurrence["frequency"];

  switch (calRecurrence.freq) {
    case CalFrequency.DAILY: {
      frequency = "DAILY";
      break;
    }
    case CalFrequency.WEEKLY: {
      frequency = "WEEKLY";
      break;
    }
    case CalFrequency.MONTHLY: {
      frequency = "MONTHLY";
      break;
    }
    case CalFrequency.YEARLY: {
      frequency = "YEARLY";
      break;
    }
    default:
      // KYZON doesn't support HOURLY, MINUTELY, SECONDLY
      return undefined;
  }

  return {
    frequency,
    interval: calRecurrence.interval || 1,
    count: calRecurrence.count > 0 ? calRecurrence.count : undefined,
    untilDateUtcISOString: calRecurrence.until ? calRecurrence.until.toISOString() : undefined,
  };
}
