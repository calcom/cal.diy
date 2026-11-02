import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Database } from "@calcom/db/database";
import { account, user } from "@calcom/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../test/testDb";
import { UserRepository } from "../users/UserRepository";
import { createAuth } from "./createAuth";
import { oidcConfigFromEnv } from "./oidc";

const BASE_URL = "http://localhost:3000";
const CLIENT_ID = "cal-diy";

type Profile = { sub: string; email: string; email_verified: boolean; name: string };

/** A minimal OpenID Connect provider: discovery, keys, and a token endpoint for one pending login. */
function startFakeProvider() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };
  const state: { issuer: string; profile: Profile | null; nonce: string | null } = {
    issuer: "",
    profile: null,
    nonce: null,
  };

  function idToken(profile: Profile, nonce: string | null): string {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const body = `${encode({ alg: "RS256", typ: "JWT", kid: "test-key" })}.${encode({
      ...profile,
      iss: state.issuer,
      aud: CLIENT_ID,
      iat: now,
      exp: now + 300,
      ...(nonce ? { nonce } : {}),
    })}`;
    return `${body}.${sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")}`;
  }

  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", state.issuer).pathname;
    const json = (value: object) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (path === "/.well-known/openid-configuration")
      return json({
        issuer: state.issuer,
        authorization_endpoint: `${state.issuer}/authorize`,
        token_endpoint: `${state.issuer}/token`,
        userinfo_endpoint: `${state.issuer}/userinfo`,
        jwks_uri: `${state.issuer}/jwks`,
      });
    if (path === "/jwks") return json({ keys: [jwk] });
    if (path === "/userinfo" && state.profile) return json(state.profile);
    if (path === "/token" && state.profile)
      return json({
        access_token: "access-token",
        token_type: "Bearer",
        expires_in: 300,
        id_token: idToken(state.profile, state.nonce),
      });
    response.writeHead(404).end();
  });

  return {
    state,
    listen: () =>
      new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", () => {
          state.issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
          resolve();
        })
      ),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const provider = startFakeProvider();
let db: Database;
let auth: ReturnType<typeof createAuth>;

beforeAll(() => provider.listen());
afterAll(() => provider.close());

beforeEach(async () => {
  db = await createTestDb();
  const oidc = oidcConfigFromEnv({
    OIDC_ISSUER: provider.state.issuer,
    OIDC_CLIENT_ID: CLIENT_ID,
    OIDC_CLIENT_SECRET: "client-secret",
    OIDC_NAME: "Test IdP",
  });
  if (!oidc) throw new Error("OIDC config from the fake provider's settings should be complete");
  auth = createAuth({
    db,
    baseURL: BASE_URL,
    secret: "test-secret-that-is-long-enough-123",
    clientIpHeaders: ["x-cal-client-ip"],
    rateLimit: false,
    sendAuthEmail: null,
    oidc,
  });
});

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/** Starts sign-in the way the button does, then comes back from the provider as `profile`. */
async function signInThroughProvider(profile: Profile, token: { nonce?: string } = {}): Promise<Response> {
  const start = await auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE_URL },
      body: JSON.stringify({ provider: "oidc", callbackURL: "/event-types" }),
    })
  );
  const { url } = (await start.json()) as { url: string };
  const authorize = new URL(url);
  expect(authorize.origin + authorize.pathname).toBe(`${provider.state.issuer}/authorize`);
  expect(authorize.searchParams.get("client_id")).toBe(CLIENT_ID);
  expect(authorize.searchParams.get("redirect_uri")).toBe(`${BASE_URL}/api/auth/callback/oidc`);
  expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");

  provider.state.profile = profile;
  provider.state.nonce = token.nonce ?? authorize.searchParams.get("nonce");
  const callback = new URL(`${BASE_URL}/api/auth/callback/oidc`);
  callback.searchParams.set("code", randomUUID());
  callback.searchParams.set("state", authorize.searchParams.get("state") ?? "");
  return auth.handler(new Request(callback, { headers: { cookie: cookieHeader(start) } }));
}

function sessionCookieSet(response: Response): boolean {
  return response.headers.getSetCookie().some((cookie) => cookie.startsWith("cal.session_token="));
}

describe("OIDC sign-in", () => {
  it("signs a new user up from a verified ID token, with a username and an oidc account", async () => {
    const response = await signInThroughProvider({
      sub: "user-1",
      email: "Jane@Example.com",
      email_verified: true,
      name: "Jane Doe",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/event-types");
    expect(sessionCookieSet(response)).toBe(true);
    const [created] = await db.select({ id: user.id, email: user.email, username: user.username }).from(user);
    expect(created).toMatchObject({ email: "jane@example.com", username: "jane" });
    const accounts = await db
      .select({ providerId: account.providerId, accountId: account.accountId })
      .from(account)
      .where(eq(account.userId, created.id));
    expect(accounts).toEqual([{ providerId: "oidc", accountId: "user-1" }]);
    // The password settings page names the provider that manages a password-less account.
    expect(await new UserRepository(db).findSecurity(created.id)).toMatchObject({
      hasPassword: false,
      identityProviderId: "oidc",
    });
  });

  it("links to an existing account only when both the provider and this app have verified the email", async () => {
    await auth.api.signUpEmail({
      body: { name: "owner", email: "owner@example.com", password: "Secret123", username: "owner" },
    });
    const profile = { sub: "owner-sub", email: "owner@example.com", name: "Owner" };

    const unverifiedByProvider = await signInThroughProvider({ ...profile, email_verified: false });
    expect(unverifiedByProvider.headers.get("location")).toContain("error=account_not_linked");
    // Someone could have signed up with this address before its owner; linking would hand them the SSO identity.
    const unverifiedLocally = await signInThroughProvider({ ...profile, email_verified: true });
    expect(unverifiedLocally.headers.get("location")).toContain("error=account_not_linked");
    expect(sessionCookieSet(unverifiedLocally)).toBe(false);

    await db.update(user).set({ emailVerified: true }).where(eq(user.email, "owner@example.com"));
    const verified = await signInThroughProvider({ ...profile, email_verified: true });
    expect(verified.headers.get("location")).toBe("/event-types");
    expect(sessionCookieSet(verified)).toBe(true);
    const providers = await db.select({ providerId: account.providerId }).from(account);
    expect(providers.map((row) => row.providerId).sort()).toEqual(["credential", "oidc"]);
  });

  it("rejects an ID token that doesn't echo this sign-in's nonce", async () => {
    const response = await signInThroughProvider(
      { sub: "user-2", email: "replay@example.com", email_verified: true, name: "Replay" },
      { nonce: "nonce-from-another-sign-in" }
    );
    expect(sessionCookieSet(response)).toBe(false);
    expect(await db.select({ id: user.id }).from(user)).toEqual([]);
  });

  it("keeps password sign-in working when the provider can't be reached", async () => {
    const offline = createAuth({
      db,
      baseURL: BASE_URL,
      secret: "test-secret-that-is-long-enough-123",
      clientIpHeaders: ["x-cal-client-ip"],
      rateLimit: false,
      sendAuthEmail: null,
      oidc: {
        discoveryUrl: "http://127.0.0.1:1/.well-known/openid-configuration",
        clientId: CLIENT_ID,
        clientSecret: "client-secret",
        name: "Offline IdP",
      },
    });
    const result = await offline.api.signUpEmail({
      body: { name: "solo", email: "solo@example.com", password: "Secret123", username: "solo" },
    });
    expect(result.user.email).toBe("solo@example.com");
  });
});
