import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Authorize, parseOAuthScopes } from "./authorize-view";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  searchParams: new URLSearchParams(),
  client: {
    name: "Test OAuth client",
    redirectUri: "https://client.example/callback",
    isTrusted: false,
  },
}));

vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@calcom/lib/constants", () => ({ APP_NAME: "Cal.diy" }));
vi.mock("@calcom/lib/hooks/useCompatSearchParams", () => ({
  useCompatSearchParams: () => mocks.searchParams,
}));
vi.mock("@calcom/lib/hooks/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
vi.mock("@calcom/trpc/react/hooks/useMeQuery", () => ({ default: () => ({ data: undefined }) }));
vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    viewer: {
      oAuth: {
        getClientForAuthorization: { useQuery: () => ({ data: mocks.client }) },
        generateAuthCode: { useMutation: () => ({ mutate: mocks.mutate }) },
      },
      loggedInViewerRouter: { teamsAndUserProfilesQuery: { useQuery: () => ({ data: [] }) } },
    },
  },
}));
vi.mock("@calcom/ui/components/avatar", () => ({ Avatar: () => null }));
vi.mock("@calcom/ui/components/button", () => ({
  Button: ({ children, onClick }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick}>{children}</button>
  ),
}));
vi.mock("@calcom/ui/components/form", () => ({ Select: () => null }));
vi.mock("@calcom/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@coss/ui/icons", () => ({ InfoIcon: () => null, PlusIcon: () => null }));

afterEach(cleanup);
beforeEach(() => {
  mocks.mutate.mockClear();
  mocks.searchParams = new URLSearchParams({
    client_id: "test-client",
    redirect_uri: mocks.client.redirectUri,
    state: "test-state",
    code_challenge: "test-challenge",
    code_challenge_method: "S256",
  });
});

describe.each([false, true])("OAuth authorization (trusted client: %s)", (isTrusted) => {
  it.each([
    ["READ_BOOKING READ_PROFILE", ["READ_BOOKING", "READ_PROFILE"]],
    ["READ_BOOKING,READ_PROFILE", ["READ_BOOKING", "READ_PROFILE"]],
    [" READ_BOOKING,  READ_PROFILE ", ["READ_BOOKING", "READ_PROFILE"]],
    ["READ_BOOKING", ["READ_BOOKING"]],
    [null, []],
    ["", []],
    [", ,", []],
    ["READ_BOOKING UNRECOGNIZED_SCOPE", ["READ_BOOKING", "UNRECOGNIZED_SCOPE"]],
  ])("forwards scope %j as separate tokens", (scope, expectedScopes) => {
    mocks.client.isTrusted = isTrusted;
    if (scope !== null) {
      mocks.searchParams.set("scope", scope);
    }

    render(<Authorize />);
    if (!isTrusted) {
      expect(mocks.mutate).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "allow" }));
    }

    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "test-client",
        redirectUri: mocks.client.redirectUri,
        scopes: expectedScopes,
        codeChallenge: "test-challenge",
        codeChallengeMethod: "S256",
        state: "test-state",
      })
    );
  });
});

describe("parseOAuthScopes", () => {
  it.each([
    ["READ_BOOKING READ_PROFILE", ["READ_BOOKING", "READ_PROFILE"]],
    ["READ_BOOKING,READ_PROFILE", ["READ_BOOKING", "READ_PROFILE"]],
    [" READ_BOOKING,  READ_PROFILE ", ["READ_BOOKING", "READ_PROFILE"]],
    ["READ_BOOKING", ["READ_BOOKING"]],
    [null, []],
    [undefined, []],
    ["", []],
    [", ,", []],
    ["READ_BOOKING UNRECOGNIZED_SCOPE", ["READ_BOOKING", "UNRECOGNIZED_SCOPE"]],
  ])("parses scope input %j into %j", (input, expected) => {
    expect(parseOAuthScopes(input)).toEqual(expected);
  });
});
