import "@calcom/testing/lib/__mocks__/prismaMock";

import { describe, expect, test, vi } from "vitest";

import config from "../config.json";
import VideoApiAdapter from "./VideoApiAdapter";

const appKeys = {
  nextcloudTalkHost: "https://cloud.example.com",
  nextcloudTalkPattern: "{Scheduler}-{Title}-with-{Organizer}",
  nextcloudTalkClientId: "FAKE_CLIENT_ID",
  nextcloudTalkClientSecret: "FAKE_CLIENT_SECRET",
};

vi.mock("../../_utils/getAppKeysFromSlug", () => ({
  default: vi.fn().mockResolvedValue(appKeys),
}));

vi.mock("../../_utils/getParsedAppKeysFromSlug", () => ({
  default: vi.fn().mockResolvedValue(appKeys),
}));

const mockRequest = vi.fn().mockResolvedValue({
  json: { ocs: { meta: { status: "ok", statuscode: 200, message: "OK" }, data: { token: "room-token" } } },
});
vi.mock("../../_utils/oauth/OAuthManager", () => ({
  OAuthManager: vi.fn().mockImplementation(function () {
    return { request: mockRequest };
  }),
}));

const testCredential = {
  appId: config.slug,
  id: 1,
  invalid: false,
  key: { access_token: "", refresh_token: "", expiry_date: 1625097600000 },
  type: config.type,
  userId: 1,
  user: { email: "example@cal.com" },
  teamId: 1,
  delegatedTo: null,
  delegationCredentialId: null,
  encryptedKey: null,
};

const eventWith = ({ title, attendees, organizer }: { title: string; attendees: string[]; organizer: string }) => ({
  title,
  type: "intro",
  startTime: new Date().toISOString(),
  endTime: new Date().toISOString(),
  organizer: { name: organizer, email: "organizer@example.com", timeZone: "UTC", language: { locale: "en" } },
  attendees: attendees.map((name) => ({ name, email: "attendee@example.com", timeZone: "UTC", language: { locale: "en" } })),
});

const roomNameRequested = () => JSON.parse(mockRequest.mock.lastCall?.[0].options.body).roomName;

describe("createMeeting", () => {
  test("fills the room name pattern", async () => {
    await VideoApiAdapter(testCredential).createMeeting(
      eventWith({ title: "Intro call", attendees: ["Ada Lovelace"], organizer: "Grace" })
    );
    expect(roomNameRequested()).toBe("Ada-Lovelace-Intro-call-with-Grace");
  });

  test("inserts names and titles containing $ patterns literally", async () => {
    await VideoApiAdapter(testCredential).createMeeting(
      eventWith({ title: "Pricing $' review", attendees: ["Cash$$Flow", "A$&B"], organizer: "Ke$`ha" })
    );
    expect(roomNameRequested()).toBe("Cash$$Flow-A$&B-Pricing-$'-review-with-Ke$`ha");
  });
});
