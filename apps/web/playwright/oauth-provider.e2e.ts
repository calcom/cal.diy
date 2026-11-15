import { expect } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";

import { OAUTH_ERROR_REASONS } from "@calcom/features/oauth/services/OAuthService";
import { generateSecret } from "@calcom/features/oauth/utils/generateSecret";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { prisma } from "@calcom/prisma";
import { getDefaultPassword } from "./lib/testUtils";

import { test } from "./lib/fixtures";

test.afterEach(async ({ users }) => {
  await users.deleteAll();
});

let client: {
  clientId: string;
  redirectUri: string;
  orginalSecret: string;
  name: string;
  clientSecret: string | null;
  logo: string | null;
};

let publicClient: {
  clientId: string;
  redirectUri: string;
  name: string;
  clientSecret: string | null;
  logo: string | null;
};

// Helper function to generate PKCE values
function generatePKCE() {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: "S256" as const,
  };
}

test.describe("OAuth Provider", () => {
  test.beforeAll(async () => {
    client = await createTestCLient();
  });
  test("should create valid access token & refresh token for user", async ({ page, users }) => {
    const user = await users.create({ username: "test user", name: "test user" });
    await user.apiLogin();

    await page.goto(
      `auth/oauth2/authorize?client_id=${client.clientId}&redirect_uri=${client.redirectUri}&response_type=code&scope=READ_PROFILE&state=1234`
    );
    await page.getByTestId("allow-button").click();

    await page.waitForFunction(() => {
      return window.location.href.startsWith("https://example.com");
    });

    const url = new URL(page.url());

    // authorization code that is returned to client with redirect uri
    const code = url.searchParams.get("code");

    // request token with authorization code
    const tokenForm = new URLSearchParams();
    tokenForm.append("code", code ?? "");
    tokenForm.append("client_id", client.clientId);
    tokenForm.append("client_secret", client.orginalSecret);
    tokenForm.append("grant_type", "authorization_code");
    tokenForm.append("redirect_uri", client.redirectUri);
    const tokenResponse = await fetch(`${WEBAPP_URL}/api/auth/oauth/token`, {
      body: tokenForm.toString(),
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const tokenData = await tokenResponse.json();

    // test if token is valid
    const meResponse = await fetch(`${WEBAPP_URL}/api/auth/oauth/me`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const meData = await meResponse.json();

    // check if user access token is valid
    expect(meData.username.startsWith("test user")).toBe(true);

    // request new token with refresh token
    const refreshTokenForm = new URLSearchParams();
    refreshTokenForm.append("refresh_token", tokenData.refresh_token);
    refreshTokenForm.append("client_id", client.clientId);
    refreshTokenForm.append("client_secret", client.orginalSecret);
    refreshTokenForm.append("grant_type", "refresh_token");
    const refreshTokenResponse = await fetch(`${WEBAPP_URL}/api/auth/oauth/refreshToken`, {
      body: refreshTokenForm.toString(),
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const refreshTokenData = await refreshTokenResponse.json();

    expect(refreshTokenData.access_token).toBeDefined();

    const validTokenResponse = await fetch(`${WEBAPP_URL}/api/auth/oauth/me`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const validTokenData = await validTokenResponse.json();
    expect(validTokenData.username.startsWith("test user")).toBe(true);
  });

  test("should show signed-in user name instead of account selector when show_account_selector is not set", async ({
    page,
    users,
  }) => {
    const user = await users.create({ username: "test user", name: "test user" });
    await user.apiLogin();

    await page.goto(
      `auth/oauth2/authorize?client_id=${client.clientId}&redirect_uri=${client.redirectUri}&response_type=code&scope=READ_PROFILE&state=1234`
    );
    await expect(page).toHaveURL(/auth\/oauth2\/authorize/);

    await page.waitForSelector('[data-testid="allow-button"]');

    // Should show "Signed in as" with the user's name
    await expect(page.getByTestId("signed-in-user")).toBeVisible();

    // Account selector should not be present
    await expect(page.locator("#account-select")).not.toBeVisible();
  });

  test("redirect not logged-in users to login page and after forward to authorization page", async ({
    page,
    users,
  }) => {
    const user = await users.create({ username: "test-user", name: "test user" });

    await page.goto(
      `auth/oauth2/authorize?client_id=${client.clientId}&redirect_uri=${client.redirectUri}&response_type=code&scope=READ_PROFILE&state=1234`
    );

    // check if user is redirected to login page
    await expect(page.getByRole("heading", { name: "horium.dev" })).toBeVisible();
    await expect(page.getByTestId("login-subtitle")).toBeVisible();
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill(getDefaultPassword(user.username!));
    await page.locator('[type="submit"]').click();

    await page.waitForSelector('[data-testid="allow-button"]');

    await expect(page.getByText("test user")).toBeVisible();
  });
});

test.describe("OAuth Provider - PKCE (Public Clients)", () => {
  test.beforeAll(async () => {
    publicClient = await createTestPublicClient();
  });
  test("should create valid access token for PUBLIC client with valid PKCE", async ({ page, users }) => {
    const user = await users.create({ username: "test user pkce", name: "test user pkce" });
    await user.apiLogin();

    // Generate PKCE values
    const pkce = generatePKCE();

    // Authorization request with PKCE challenge
    await page.goto(
      `auth/oauth2/authorize?client_id=${publicClient.clientId}&redirect_uri=${publicClient.redirectUri}&response_type=code&scope=READ_PROFILE&state=1234&code_challenge=${pkce.codeChallenge}&code_challenge_method=${pkce.codeChallengeMethod}`
    );
    await page.getByTestId("allow-button").click();

    await page.waitForFunction(() => {
      return window.location.href.startsWith("https://example.com");
    });

    // Assert URL to catch unexpected redirects
    await expect(page).toHaveURL(/^https:\/\/example\.com/);
    expect(page.url()).toContain("code=");
    expect(page.url()).toContain("state=1234");

    const url = new URL(page.url());
    const code = url.searchParams.get("code");

    // Token exchange with PKCE verifier
    const tokenForm = new URLSearchParams();
    tokenForm.append("code", code ?? "");
    tokenForm.append("client_id", publicClient.clientId);
    tokenForm.append("grant_type", "authorization_code");
    tokenForm.append("redirect_uri", publicClient.redirectUri);
    tokenForm.append("code_verifier", pkce.codeVerifier);

    const tokenResponse = await fetch(`${WEBAPP_URL}/api/auth/oauth/token`, {
      body: tokenForm.toString(),
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const tokenData = await tokenResponse.json();

    expect(tokenResponse.status).toBe(200);
    expect(tokenData.access_token).toBeDefined();
    expect(tokenData.token_type).toBe("bearer");
    expect(tokenData.refresh_token).toBeDefined();
    expect(tokenData.expires_in).toBe(1800);

    // Verify token is valid
    const meResponse = await fetch(`${WEBAPP_URL}/api/auth/oauth/me`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const meData = await meResponse.json();
    expect(meData.username.startsWith("test user pkce")).toBe(true);
  });

  test("should reject PUBLIC client with invalid PKCE verifier", async ({ page, users }) => {
    const user = await users.create({ username: "test user pkce invalid", name: "test user pkce invalid" });
    await user.apiLogin();

    // Generate PKCE values
    const pkce = generatePKCE();
    const wrongVerifier = randomBytes(32).toString("base64url");

    // Authorization request with PKCE challenge
    await page.goto(
      `auth/oauth2/authorize?client_id=${publicClient.clientId}&redirect_uri=${publicClient.redirectUri}&response_type=code&scope=READ_PROFILE&state=1234&code_challenge=${pkce.codeChallenge}&code_challenge_method=${pkce.codeChallengeMethod}`
    );
    await page.getByTestId("allow-button").click();

    await page.waitForFunction(() => {
      return window.location.href.startsWith("https://example.com");
    });

    // Assert URL to catch unexpected redirects
    await expect(page).toHaveURL(/^https:\/\/example\.com/);
    expect(page.url()).toContain("code=");
    expect(page.url()).toContain("state=1234");

    const url = new URL(page.url());
    const code = url.searchParams.get("code");

    // Token exchange with WRONG PKCE verifier
    const tokenForm = new URLSearchParams();
    tokenForm.append("code", code ?? "");
    tokenForm.append("client_id", publicClient.clientId);
    tokenForm.append("grant_type", "authorization_code");
    tokenForm.append("redirect_uri", publicClient.redirectUri);
    tokenForm.append("code_verifier", wrongVerifier); // Wrong verifier!

    const tokenResponse = await fetch(`${WEBAPP_URL}/api/auth/oauth/token`, {
      body: tokenForm.toString(),
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const tokenData = await tokenResponse.json();

    expect(tokenResponse.status).toBe(400);
    expect(tokenData.error).toBe("invalid_grant");
  });

  test("should reject PUBLIC client without code_verifier", async ({ page, users }) => {
    const user = await users.create({ username: "test user pkce missing", name: "test user pkce missing" });
    await user.apiLogin();

    // Generate PKCE values
    const pkce = generatePKCE();

    // Authorization request with PKCE challenge
    await page.goto(
      `auth/oauth2/authorize?client_id=${publicClient.clientId}&redirect_uri=${publicClient.redirectUri}&response_type=code&scope=READ_PROFILE&state=1234&code_challenge=${pkce.codeChallenge}&code_challenge_method=${pkce.codeChallengeMethod}`
    );
    await page.getByTestId("allow-button").click();

    await page.waitForFunction(() => {
      return window.location.href.startsWith("https://example.com");
    });

    // Assert URL to catch unexpected redirects
    await expect(page).toHaveURL(/^https:\/\/example\.com/);
    expect(page.url()).toContain("code=");
    expect(page.url()).toContain("state=1234");

    const url = new URL(page.url());
    const code = url.searchParams.get("code");

    // Token exchange WITHOUT code_verifier (should fail)
    const tokenForm = new URLSearchParams();
    tokenForm.append("code", code ?? "");
    tokenForm.append("client_id", publicClient.clientId);
    tokenForm.append("grant_type", "authorization_code");
    tokenForm.append("redirect_uri", publicClient.redirectUri);
    // Missing code_verifier!

    const tokenResponse = await fetch(`${WEBAPP_URL}/api/auth/oauth/token`, {
      body: tokenForm.toString(),
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const tokenData = await tokenResponse.json();

    expect(tokenResponse.status).toBe(400);
    expect(tokenData.error).toBe("invalid_request");
  });

  test("should reject PUBLIC client authorization without code_challenge", async ({ page, users }) => {
    const user = await users.create({ username: "test user no challenge", name: "test user no challenge" });
    await user.apiLogin();

    // Try to authorize without PKCE challenge (should fail at authorization step)
    await page.goto(
      `auth/oauth2/authorize?client_id=${publicClient.clientId}&redirect_uri=${publicClient.redirectUri}&response_type=code&scope=READ_PROFILE&state=1234`
    );

    await page.waitForSelector('[data-testid="allow-button"]');

    // Clicking allow should fail because PUBLIC clients require PKCE
    await page.getByTestId("allow-button").click();

    // Wait for redirect to callback URL with error parameters
    await page.waitForFunction(() => {
      return window.location.href.startsWith("https://example.com");
    });

    // Should redirect to callback URL with error parameters (OAuth2 error redirect)
    await expect(page).toHaveURL(/^https:\/\/example\.com/);

    const url = new URL(page.url());
    expect(url.searchParams.get("error")).toBe("invalid_request");
    expect(url.searchParams.get("error_description")).toBe(OAUTH_ERROR_REASONS["pkce_required"]);
    expect(url.searchParams.get("state")).toBe("1234");
    // Should not contain authorization code
    expect(url.searchParams.get("code")).toBeNull();
  });

  test("should refresh tokens for PUBLIC client", async ({ page, users }) => {
    const user = await users.create({ username: "test user refresh", name: "test user refresh" });
    await user.apiLogin();

    // Generate PKCE values
    const pkce = generatePKCE();

    // Authorization request with PKCE challenge
    await page.goto(
      `auth/oauth2/authorize?client_id=${publicClient.clientId}&redirect_uri=${publicClient.redirectUri}&response_type=code&scope=READ_PROFILE&state=1234&code_challenge=${pkce.codeChallenge}&code_challenge_method=${pkce.codeChallengeMethod}`
    );
    await page.getByTestId("allow-button").click();

    await page.waitForFunction(() => {
      return window.location.href.startsWith("https://example.com");
    });

    // Assert URL to catch unexpected redirects
    await expect(page).toHaveURL(/^https:\/\/example\.com/);
    expect(page.url()).toContain("code=");
    expect(page.url()).toContain("state=1234");

    const url = new URL(page.url());
    const code = url.searchParams.get("code");

    // Token exchange with PKCE verifier
    const tokenForm = new URLSearchParams();
    tokenForm.append("code", code ?? "");
    tokenForm.append("client_id", publicClient.clientId);
    tokenForm.append("grant_type", "authorization_code");
    tokenForm.append("redirect_uri", publicClient.redirectUri);
    tokenForm.append("code_verifier", pkce.codeVerifier);

    const tokenResponse = await fetch(`${WEBAPP_URL}/api/auth/oauth/token`, {
      body: tokenForm.toString(),
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const tokenData = await tokenResponse.json();

    expect(tokenResponse.status).toBe(200);
    expect(tokenData.access_token).toBeDefined();
    expect(tokenData.refresh_token).toBeDefined();

    // Refresh token - NO PKCE needed
    const refreshTokenForm = new URLSearchParams();
    refreshTokenForm.append("refresh_token", tokenData.refresh_token);
    refreshTokenForm.append("client_id", publicClient.clientId);
    refreshTokenForm.append("grant_type", "refresh_token");

    const refreshTokenResponse = await fetch(`${WEBAPP_URL}/api/auth/oauth/refreshToken`, {
      body: refreshTokenForm.toString(),
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const refreshTokenData = await refreshTokenResponse.json();

    expect(refreshTokenResponse.status).toBe(200);
    expect(refreshTokenData.access_token).toBeDefined();
    expect(refreshTokenData.token_type).toBe("bearer");
    expect(refreshTokenData.refresh_token).toBeDefined();
    expect(refreshTokenData.expires_in).toBe(1800);

    // Verify new access token works
    const meResponse = await fetch(`${WEBAPP_URL}/api/auth/oauth/me`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${refreshTokenData.access_token}`,
      },
    });

    const meData = await meResponse.json();
    expect(meData.username.startsWith("test user refresh")).toBe(true);
  });
});

test.describe("OAuth Provider - PKCE with CONFIDENTIAL Clients (Enhanced Security)", () => {
  test.beforeAll(async () => {
    // Ensure we have a confidential client for these tests
    client = await createTestCLient();
  });

  test("should accept CONFIDENTIAL client with PKCE for defense in depth", async ({ page, users }) => {
    const user = await users.create({ username: "test user conf pkce", name: "test user conf pkce" });
    await user.apiLogin();

    // Generate PKCE values
    const pkce = generatePKCE();

    // Authorization request with PKCE challenge (even for CONFIDENTIAL client)
    await page.goto(
      `auth/oauth2/authorize?client_id=${client.clientId}&redirect_uri=${client.redirectUri}&response_type=code&scope=READ_PROFILE&state=1234&code_challenge=${pkce.codeChallenge}&code_challenge_method=${pkce.codeChallengeMethod}`
    );
    await page.getByTestId("allow-button").click();

    await page.waitForFunction(() => {
      return window.location.href.startsWith("https://example.com");
    });

    // Assert URL to catch unexpected redirects
    await expect(page).toHaveURL(/^https:\/\/example\.com/);
    expect(page.url()).toContain("code=");
    expect(page.url()).toContain("state=1234");

    const url = new URL(page.url());
    const code = url.searchParams.get("code");

    // Token exchange with both client_secret AND code_verifier (dual authentication)
    const tokenForm = new URLSearchParams();
    tokenForm.append("code", code ?? "");
    tokenForm.append("client_id", client.clientId);
    tokenForm.append("client_secret", client.orginalSecret);
    tokenForm.append("grant_type", "authorization_code");
    tokenForm.append("redirect_uri", client.redirectUri);
    tokenForm.append("code_verifier", pkce.codeVerifier);

    const tokenResponse = await fetch(`${WEBAPP_URL}/api/auth/oauth/token`, {
      body: tokenForm.toString(),
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const tokenData = await tokenResponse.json();

    expect(tokenResponse.status).toBe(200);
    expect(tokenData.access_token).toBeDefined();
    expect(tokenData.token_type).toBe("bearer");
    expect(tokenData.refresh_token).toBeDefined();
    expect(tokenData.expires_in).toBe(1800);

    // Verify token works
    const meResponse = await fetch(`${WEBAPP_URL}/api/auth/oauth/me`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const meData = await meResponse.json();
    expect(meData.username.startsWith("test user conf pkce")).toBe(true);

    const refreshTokenForm = new URLSearchParams();
    refreshTokenForm.append("refresh_token", tokenData.refresh_token);
    refreshTokenForm.append("client_id", client.clientId);
    refreshTokenForm.append("client_secret", client.orginalSecret);
    refreshTokenForm.append("grant_type", "refresh_token");

    const refreshTokenResponse = await fetch(`${WEBAPP_URL}/api/auth/oauth/refreshToken`, {
      body: refreshTokenForm.toString(),
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const refreshTokenData = await refreshTokenResponse.json();

    expect(refreshTokenResponse.status).toBe(200);
    expect(refreshTokenData.access_token).toBeDefined();
    expect(refreshTokenData.refresh_token).toBeDefined();
  });

  test("should allow CONFIDENTIAL client refresh with only client_secret when PKCE was NOT used", async ({
    page,
    users,
  }) => {
    const user = await users.create({ username: "test user conf no pkce", name: "test user conf no pkce" });
    await user.apiLogin();

    // Authorization WITHOUT PKCE challenge (traditional CONFIDENTIAL client flow)
    await page.goto(
      `auth/oauth2/authorize?client_id=${client.clientId}&redirect_uri=${client.redirectUri}&response_type=code&scope=READ_PROFILE&state=1234`
    );
    await page.getByTestId("allow-button").click();

    await page.waitForFunction(() => {
      return window.location.href.startsWith("https://example.com");
    });

    // Assert URL to catch unexpected redirects
    await expect(page).toHaveURL(/^https:\/\/example\.com/);
    expect(page.url()).toContain("code=");
    expect(page.url()).toContain("state=1234");

    const url = new URL(page.url());
    const code = url.searchParams.get("code");

    // Token exchange with ONLY client_secret (no PKCE)
    const tokenForm = new URLSearchParams();
    tokenForm.append("code", code ?? "");
    tokenForm.append("client_id", client.clientId);
    tokenForm.append("client_secret", client.orginalSecret);
    tokenForm.append("grant_type", "authorization_code");
    tokenForm.append("redirect_uri", client.redirectUri);

    const tokenResponse = await fetch(`${WEBAPP_URL}/api/auth/oauth/token`, {
      body: tokenForm.toString(),
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const tokenData = await tokenResponse.json();
    expect(tokenResponse.status).toBe(200);

    // Refresh with client_secret
    const refreshTokenForm = new URLSearchParams();
    refreshTokenForm.append("refresh_token", tokenData.refresh_token);
    refreshTokenForm.append("client_id", client.clientId);
    refreshTokenForm.append("client_secret", client.orginalSecret);
    refreshTokenForm.append("grant_type", "refresh_token");

    const refreshTokenResponse = await fetch(`${WEBAPP_URL}/api/auth/oauth/refreshToken`, {
      body: refreshTokenForm.toString(),
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const refreshTokenData = await refreshTokenResponse.json();

    expect(refreshTokenResponse.status).toBe(200);
    expect(refreshTokenData.access_token).toBeDefined();
    expect(refreshTokenData.token_type).toBe("bearer");
  });
});

const createTestCLient = async () => {
  const [hashedSecret, secret] = generateSecret();
  const clientId = randomBytes(32).toString("hex");

  const client = await prisma.oAuthClient.create({
    data: {
      name: "Test Client",
      clientId,
      clientSecret: hashedSecret,
      redirectUri: "https://example.com",
      clientType: "CONFIDENTIAL",
    },
  });

  return { ...client, orginalSecret: secret };
};

const createTestPublicClient = async () => {
  const clientId = randomBytes(32).toString("hex");

  const client = await prisma.oAuthClient.create({
    data: {
      name: "Test Public Client",
      clientId,
      clientSecret: null,
      redirectUri: "https://example.com",
      clientType: "PUBLIC",
    },
  });

  return client;
};
