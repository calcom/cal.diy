import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";

import type { PartialReference } from "@calcom/types/EventManager";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { OAuthManager } from "../../_utils/oauth/OAuthManager";
import { internalServerErrorResponse, successResponse } from "../../_utils/testUtils";
import config from "../config.json";
import VideoApiAdapter from "./VideoApiAdapter";

const URLS = {
  CREATE_MEETING: {
    url: "https://graph.microsoft.com/v1.0/me/onlineMeetings",
    method: "POST",
  },
  UPDATE_MEETING: {
    url: "https://graph.microsoft.com/v1.0/me/onlineMeetings/MEETING_ID",
    method: "PATCH",
  },
  DELETE_MEETING: {
    url: "https://graph.microsoft.com/v1.0/me/onlineMeetings/MEETING_ID",
    method: "DELETE",
  },
};

const existingBookingRef: PartialReference = {
  type: config.type,
  uid: "MEETING_ID",
  meetingId: "MEETING_ID",
};

vi.mock("../../_utils/getParsedAppKeysFromSlug", () => ({
  default: vi.fn().mockImplementation((slug) => {
    if (slug !== config.slug) {
      throw new Error(
        `expected to be called with the correct slug. Expected ${config.slug} -  Received ${slug}`
      );
    }
    return {
      client_id: "FAKE_CLIENT_ID",
      client_secret: "FAKE_CLIENT_SECRET",
    };
  }),
}));

const mockRequestRaw = vi.fn();
vi.mock("../../_utils/oauth/OAuthManager", () => ({
  OAuthManager: vi.fn().mockImplementation(function() {
    return { requestRaw: mockRequestRaw };
  }),
}));

beforeEach(() => {
  mockRequestRaw.mockReset();
});

const testCredential = {
  appId: config.slug,
  id: 1,
  invalid: false,
  key: {
    scope: "https://www.googleapis.com/auth/calendar.events",
    token_type: "Bearer",
    expiry_date: 1625097600000,
    access_token: "",
    refresh_token: "",
  },
  type: config.type,
  userId: 1,
  user: { email: "example@cal.com" },
  teamId: 1,
  delegatedTo: null,
  delegationCredentialId: null,
  encryptedKey: null,
};

describe("createMeeting", () => {
  test("Successful `createMeeting` call", async () => {

    const videoApi = VideoApiAdapter(testCredential);

    mockRequestRaw.mockImplementation(({ url }) => {
      if (url === URLS.CREATE_MEETING.url) {
        return Promise.resolve(
          successResponse({
            json: {
              id: 1,
              joinWebUrl: "https://join_web_url.example.com",
              joinUrl: "https://join_url.example.com",
            },
          })
        );
      }
      throw new Error("Unexpected URL");
    });

    const event = {
      title: "Test Meeting",
      description: "Test Description",
      startTime: new Date(),
      endTime: new Date(),
    };

    const createdMeeting = await videoApi?.createMeeting(event);
    expect(OAuthManager).toHaveBeenCalled();
    expect(mockRequestRaw).toHaveBeenCalledWith({
      url: URLS.CREATE_MEETING.url,
      options: {
        method: "POST",
        body: JSON.stringify({
          startDateTime: event.startTime,
          endDateTime: event.endTime,
          subject: event.title,
        }),
      },
    });

    expect(createdMeeting).toEqual({
      id: 1,
      password: "",
      type: "office365_video",
      url: "https://join_web_url.example.com",
    });
  });

  test(" `createMeeting` when there is no joinWebUrl and only joinUrl", async () => {

    const videoApi = VideoApiAdapter(testCredential);

    mockRequestRaw.mockImplementation(({ url }) => {
      if (url === URLS.CREATE_MEETING.url) {
        return Promise.resolve(
          successResponse({
            json: {
              id: 1,
              joinUrl: "https://join_url.example.com",
              error: {
                message: "ERROR",
              },
            },
          })
        );
      }
      throw new Error("Unexpected URL");
    });

    const event = {
      title: "Test Meeting",
      description: "Test Description",
      startTime: new Date(),
      endTime: new Date(),
    };

    await expect(() => videoApi?.createMeeting(event)).rejects.toThrowError(
      "Error creating MS Teams meeting"
    );
    expect(OAuthManager).toHaveBeenCalled();
    expect(mockRequestRaw).toHaveBeenCalledWith({
      url: URLS.CREATE_MEETING.url,
      options: {
        method: "POST",
        body: JSON.stringify({
          startDateTime: event.startTime,
          endDateTime: event.endTime,
          subject: event.title,
        }),
      },
    });
  });

  test("Failing `createMeeting` call", async () => {
    const videoApi = VideoApiAdapter(testCredential);

    mockRequestRaw.mockImplementation(({ url }) => {
      if (url === URLS.CREATE_MEETING.url) {
        return Promise.resolve(
          internalServerErrorResponse({
            json: {
              id: 1,
              joinWebUrl: "https://example.com",
              joinUrl: "https://example.com",
            },
          })
        );
      }
      throw new Error("Unexpected URL");
    });

    const event = {
      title: "Test Meeting",
      description: "Test Description",
      startTime: new Date(),
      endTime: new Date(),
    };

    await expect(() => videoApi?.createMeeting(event)).rejects.toThrowError("Internal Server Error");
    expect(OAuthManager).toHaveBeenCalled();
    expect(mockRequestRaw).toHaveBeenCalledWith({
      url: URLS.CREATE_MEETING.url,
      options: {
        method: "POST",
        body: JSON.stringify({
          startDateTime: event.startTime,
          endDateTime: event.endTime,
          subject: event.title,
        }),
      },
    });
  });
});

describe("updateMeeting", () => {
  test("patches the existing Teams meeting instead of creating a new one", async () => {
    const videoApi = VideoApiAdapter(testCredential);

    mockRequestRaw.mockImplementation(({ url, options }) => {
      if (url === URLS.UPDATE_MEETING.url && options.method === URLS.UPDATE_MEETING.method) {
        return Promise.resolve(
          successResponse({
            json: {
              id: "MEETING_ID",
              joinWebUrl: "https://join_web_url.example.com",
            },
          })
        );
      }
      throw new Error("Unexpected URL");
    });

    const event = {
      title: "Rescheduled Meeting",
      description: "Test Description",
      startTime: new Date(),
      endTime: new Date(),
    };

    const updatedMeeting = await videoApi?.updateMeeting(existingBookingRef, event);
    expect(mockRequestRaw).toHaveBeenCalledWith({
      url: URLS.UPDATE_MEETING.url,
      options: {
        method: "PATCH",
        body: JSON.stringify({
          startDateTime: event.startTime,
          endDateTime: event.endTime,
          subject: event.title,
        }),
      },
    });
    expect(mockRequestRaw).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: URLS.CREATE_MEETING.url })
    );
    expect(updatedMeeting).toEqual({
      id: "MEETING_ID",
      password: "",
      type: config.type,
      url: "https://join_web_url.example.com",
    });
  });

  test("creates a new meeting when there is no existing meeting reference", async () => {
    const videoApi = VideoApiAdapter(testCredential);

    mockRequestRaw.mockImplementation(({ url }) => {
      if (url === URLS.CREATE_MEETING.url) {
        return Promise.resolve(
          successResponse({
            json: {
              id: 1,
              joinWebUrl: "https://join_web_url.example.com",
              joinUrl: "https://join_url.example.com",
            },
          })
        );
      }
      throw new Error("Unexpected URL");
    });

    const event = {
      title: "Test Meeting",
      description: "Test Description",
      startTime: new Date(),
      endTime: new Date(),
    };

    const updatedMeeting = await videoApi?.updateMeeting(null, event);
    expect(OAuthManager).toHaveBeenCalled();
    expect(mockRequestRaw).toHaveBeenCalledWith({
      url: URLS.CREATE_MEETING.url,
      options: {
        method: "POST",
        body: JSON.stringify({
          startDateTime: event.startTime,
          endDateTime: event.endTime,
          subject: event.title,
        }),
      },
    });
    expect(updatedMeeting).toEqual({
      id: 1,
      password: "",
      type: config.type,
      url: "https://join_web_url.example.com",
    });
  });

  test("Failing `updateMeeting` call", async () => {
    const videoApi = VideoApiAdapter(testCredential);

    mockRequestRaw.mockImplementation(({ url }) => {
      if (url === URLS.CREATE_MEETING.url) {
        return Promise.resolve(
          internalServerErrorResponse({
            json: {
              id: 1,
              joinWebUrl: "https://join_web_url.example.com",
              joinUrl: "https://join_url.example.com",
            },
          })
        );
      }
      throw new Error("Unexpected URL");
    });

    const event = {
      title: "Test Meeting",
      description: "Test Description",
      startTime: new Date(),
      endTime: new Date(),
    };

    await expect(() => videoApi?.updateMeeting(null, event)).rejects.toThrowError("Internal Server Error");
    expect(OAuthManager).toHaveBeenCalled();
    expect(mockRequestRaw).toHaveBeenCalledWith({
      url: URLS.CREATE_MEETING.url,
      options: {
        method: "POST",
        body: JSON.stringify({
          startDateTime: event.startTime,
          endDateTime: event.endTime,
          subject: event.title,
        }),
      },
    });
  });
});

describe("deleteMeeting", () => {
  test("deletes the Teams meeting on Microsoft's side", async () => {
    const videoApi = VideoApiAdapter(testCredential);
    mockRequestRaw.mockResolvedValue(new Response(null, { status: 204, statusText: "No Content" }));

    await expect(videoApi?.deleteMeeting("MEETING_ID")).resolves.toBeUndefined();
    expect(mockRequestRaw).toHaveBeenCalledWith({
      url: URLS.DELETE_MEETING.url,
      options: { method: "DELETE" },
    });
  });

  test("treats an already deleted meeting (404) as success", async () => {
    const videoApi = VideoApiAdapter(testCredential);
    mockRequestRaw.mockResolvedValue(new Response(null, { status: 404, statusText: "Not Found" }));

    await expect(videoApi?.deleteMeeting("MEETING_ID")).resolves.toBeUndefined();
  });

  test("throws when Microsoft Graph rejects the delete", async () => {
    const videoApi = VideoApiAdapter(testCredential);
    mockRequestRaw.mockResolvedValue(internalServerErrorResponse({ json: { error: { message: "ERROR" } } }));

    await expect(videoApi?.deleteMeeting("MEETING_ID")).rejects.toThrowError(
      "Error deleting MS Teams meeting"
    );
  });

  test("does not call Microsoft Graph without a meeting id", async () => {
    const videoApi = VideoApiAdapter(testCredential);

    await videoApi?.deleteMeeting("");
    expect(mockRequestRaw).not.toHaveBeenCalled();
  });
});
