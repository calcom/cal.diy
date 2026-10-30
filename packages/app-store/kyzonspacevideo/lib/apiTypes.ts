export interface KyzonCreateSpaceCallRequestBody {
  name?: string;
  isScheduled: boolean;
}

export interface KyzonSpaceCallResponse {
  id: string;
  name: string;
  url: string;
  password: string;
}

export interface KyzonCalendarEventRecurrence {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count?: number;
  untilDateUtcISOString?: string;
}

export interface KyzonCreateOrPutCalendarEventRequestBody {
  title: string;
  description?: string;
  location?: {
    spaceCallId: string;
  };
  isAllDay: boolean;
  timezone: string;
  startDateUtcISOString: string;
  endDateUtcISOString: string;
  recurrence?: KyzonCalendarEventRecurrence;
  invitees?: {
    email: string;
  }[];
  thirdPartySource?: {
    calendarSource: "Google Calendar" | "Cal.com";
    eventId: string;
    viewUrl?: string;
    editUrl?: string;
  };
  hasWaitRoom: boolean;
  meetingFilesInWaitRoom?: boolean;
}

type MakeRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

export type KyzonGetCalendarEventResponse = MakeRequired<
  Omit<KyzonCreateOrPutCalendarEventRequestBody, "thirdPartySource">,
  "invitees" | "meetingFilesInWaitRoom"
> & {
  id: string;
  formattedDate: string;
  formattedTime: string;
  formattedTimezone: string;
  meetingId?: string;
  meetingPassword?: string;
  meetingLink?: string;
  formattedInvitees: string[];
  organiserUserId: string | null;
};

export interface KyzonGetSpaceCallsWithinRangeRequestQuery {
  startDateUtcISOString: string;
  endDateUtcISOString: string;
}

export interface KyzonSingleSpaceCallWithinRangeResponse {
  id: string;
  name: string;
  url: string;
  cloudFolderId: string | null;
  flowFolderShareToken: string | null;
  eventTime:
    | {
        isOngoing: true;
        isAllDay: boolean;
        startTimeUtcISOString: string;
        endTimeUtcISOString?: never;
      }
    | {
        isOngoing: boolean;
        isAllDay: true;
        startTimeUtcISOString: string;
        endTimeUtcISOString?: never;
      }
    | {
        isOngoing: false;
        isAllDay: false;
        startTimeUtcISOString: string;
        endTimeUtcISOString: string;
      };
  password: string;
  calendarEventId: string;
}
