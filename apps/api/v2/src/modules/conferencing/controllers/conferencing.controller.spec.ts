import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { ConferencingService } from "../services/conferencing.service";
import type { OAuthCallbackState } from "./conferencing.controller";
import { ConferencingController } from "./conferencing.controller";

describe("ConferencingController", () => {
  const conferencingService = {
    connectOauthApps: jest.fn(),
  } as unknown as ConferencingService;

  const config = {
    get: jest.fn((key: string) => {
      if (key === "app.baseUrl") {
        return "https://app.cal.com";
      }

      if (key === "api.url") {
        return "https://api.cal.com/v2";
      }

      return undefined;
    }),
  } as unknown as ConfigService;

  const axiosGet = jest.fn();
  const httpService = {
    axiosRef: {
      get: axiosGet,
    },
  } as unknown as HttpService;

  const controller = new ConferencingController(conferencingService, config, httpService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("falls back to a safe internal redirect when onErrorReturnTo is external", async () => {
    const response = await controller.save(
      buildState({
        onErrorReturnTo: "https://evil.com",
        fromApp: false,
        accessToken: "dummy-access-token",
      }),
      "zoom",
      "code",
      "1",
      undefined
    );

    expect(response.url).toBe("https://app.cal.com/apps/installed/conferencing");
    expect(axiosGet).not.toHaveBeenCalled();
    expect(conferencingService.connectOauthApps).not.toHaveBeenCalled();
  });

  it("sanitizes the proxy success redirect when the upstream returns an external url", async () => {
    axiosGet.mockResolvedValueOnce({
      data: { url: "https://evil.com" },
    });

    const response = await controller.save(
      buildState({
        onErrorReturnTo: "https://evil.com/fallback",
        fromApp: false,
        accessToken: "dummy-access-token",
        teamId: "team-id",
        orgId: "org-id",
      }),
      "zoom",
      "code",
      undefined,
      undefined
    );

    expect(axiosGet).toHaveBeenCalledWith(
      "https://api.cal.com/v2/organizations/org-id/teams/team-id/conferencing/zoom/oauth/callback",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer dummy-access-token",
        },
      })
    );
    expect(response.url).toBe("https://app.cal.com/apps/installed/conferencing");
    expect(conferencingService.connectOauthApps).not.toHaveBeenCalled();
  });

  it("sanitizes the proxy error fallback when the upstream request throws", async () => {
    axiosGet.mockRejectedValueOnce(new Error("proxy failed"));

    const response = await controller.save(
      buildState({
        onErrorReturnTo: "https://evil.com/fallback",
        fromApp: false,
        accessToken: "dummy-access-token",
        teamId: "team-id",
        orgId: "org-id",
      }),
      "zoom",
      "code",
      undefined,
      undefined
    );

    expect(response.url).toBe("https://app.cal.com/apps/installed/conferencing");
    expect(conferencingService.connectOauthApps).not.toHaveBeenCalled();
  });

  it("rejects malformed state values", async () => {
    await expect(controller.save("not-json", "zoom", "code", "1", undefined)).rejects.toThrow(
      "Invalid `state` query param"
    );
  });

  it.each([null, [], "hello", 42, true])("rejects non-object state values: %p", async (state) => {
    await expect(controller.save(JSON.stringify(state), "zoom", "code", "1", undefined)).rejects.toThrow(
      "Invalid `state` query param"
    );
  });
});

function buildState(state: Partial<OAuthCallbackState>): string {
  return JSON.stringify({
    fromApp: false,
    accessToken: "dummy-access-token",
    ...state,
  });
}
