import { createHmac } from "node:crypto";
import process from "node:process";
import type { NextApiRequest } from "next";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { IntegrationOAuthCallbackState } from "../../types";
import { decodeOAuthState } from "./decodeOAuthState";
import { signOAuthState } from "./encodeOAuthState";

const USER_ID = 1;
const OTHER_USER_ID = 2;

const mockReq = (state: unknown, userId = USER_ID) =>
  ({
    query: typeof state === "string" ? { state } : {},
    session: userId ? { user: { id: userId } } : undefined,
  }) as unknown as NextApiRequest;

describe("decodeOAuthState", () => {
  beforeAll(() => {
    process.env.NEXTAUTH_SECRET = "test-secret-for-oauth-state";
  });

  afterAll(() => {
    delete process.env.NEXTAUTH_SECRET;
  });

  it("returns the state when it is signed for the current user", () => {
    const state: IntegrationOAuthCallbackState = { fromApp: false, returnTo: "https://app.cal.com/apps" };
    const decoded = decodeOAuthState(mockReq(signOAuthState(state, USER_ID)));
    expect(decoded).toEqual(expect.objectContaining(state));
  });

  it("rejects an unsigned state (CVE-2026-9303)", () => {
    const decoded = decodeOAuthState(mockReq(JSON.stringify({ teamId: 1 })));
    expect(decoded).toBeUndefined();
  });

  it("rejects an unsigned state for a previously exempt app (CVE-2026-9303)", () => {
    const previouslyExemptStates = [
      JSON.stringify({ teamId: 1 }), // dub
      JSON.stringify({ fromApp: false }), // basecamp3, webex, tandem, stripe
    ];
    for (const state of previouslyExemptStates) {
      expect(decodeOAuthState(mockReq(state))).toBeUndefined();
    }
  });

  it("rejects a state signed for another user", () => {
    const state: IntegrationOAuthCallbackState = { fromApp: false };
    const signedForOther = signOAuthState(state, OTHER_USER_ID);
    expect(decodeOAuthState(mockReq(signedForOther, USER_ID))).toBeUndefined();
  });

  it("rejects a tampered nonceHash", () => {
    const state: IntegrationOAuthCallbackState = { fromApp: false };
    const signed = JSON.parse(signOAuthState(state, USER_ID)) as IntegrationOAuthCallbackState;
    signed.nonceHash = createHmac("sha256", process.env.NEXTAUTH_SECRET as string)
      .update(`${signed.nonce}:${OTHER_USER_ID}`)
      .digest("hex");
    expect(decodeOAuthState(mockReq(JSON.stringify(signed)))).toBeUndefined();
  });

  it("rejects malformed JSON state instead of throwing", () => {
    expect(decodeOAuthState(mockReq("not-json"))).toBeUndefined();
  });

  it("rejects when no state is present", () => {
    expect(decodeOAuthState(mockReq(undefined))).toBeUndefined();
  });
});
