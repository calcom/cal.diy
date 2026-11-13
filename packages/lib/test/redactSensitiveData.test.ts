import { describe, expect, it } from "vitest";
import { redactSensitiveData } from "../redactSensitiveData";

describe("redactSensitiveData", () => {
  it("redacts standard snake_case and camelCase OAuth tokens and secrets", () => {
    const sensitivePayload = {
      user: "alice",
      access_token: "ya29.sample_oauth_token",
      accessToken: "ya29.camel_case_token",
      refresh_token: "1//04_sample_refresh_token",
      refreshToken: "1//04_camel_refresh_token",
      id_token: "eyJhbGciOi...",
      idToken: "eyJhbGciOi_camel...",
      client_secret: "sec_12345",
      clientSecret: "sec_67890",
      clientId: "client_999",
      client_id: "client_888",
      private_key: "-----BEGIN PRIVATE KEY-----...",
      privateKey: "-----BEGIN PRIVATE KEY-----...",
      webhook_secret: "whsec_abc123",
      webhookSecret: "whsec_xyz789",
      session_token: "sess_1234",
      sessionToken: "sess_5678",
      publicInfo: "visible_value"
    };

    const redacted = redactSensitiveData(sensitivePayload) as Record<string, unknown>;

    expect(redacted.user).toBe("alice");
    expect(redacted.publicInfo).toBe("visible_value");
    expect(redacted.access_token).toBe("[REDACTED]");
    expect(redacted.accessToken).toBe("[REDACTED]");
    expect(redacted.refresh_token).toBe("[REDACTED]");
    expect(redacted.refreshToken).toBe("[REDACTED]");
    expect(redacted.id_token).toBe("[REDACTED]");
    expect(redacted.idToken).toBe("[REDACTED]");
    expect(redacted.client_secret).toBe("[REDACTED]");
    expect(redacted.clientSecret).toBe("[REDACTED]");
    expect(redacted.clientId).toBe("[REDACTED]");
    expect(redacted.client_id).toBe("[REDACTED]");
    expect(redacted.private_key).toBe("[REDACTED]");
    expect(redacted.privateKey).toBe("[REDACTED]");
    expect(redacted.webhook_secret).toBe("[REDACTED]");
    expect(redacted.webhookSecret).toBe("[REDACTED]");
    expect(redacted.session_token).toBe("[REDACTED]");
    expect(redacted.sessionToken).toBe("[REDACTED]");
  });

  it("handles nested objects with sensitive properties", () => {
    const nestedData = {
      integration: "google_calendar",
      credentials: {
        access_token: "secret_access",
        refresh_token: "secret_refresh",
        expires_in: 3600
      }
    };

    const redacted = redactSensitiveData(nestedData);
    expect(redacted).toMatchObject({
      integration: "google_calendar",
      credentials: {
        expires_in: 3600,
        access_token: "[REDACTED]",
        refresh_token: "[REDACTED]"
      }
    });
  });

  it("handles non-object and null inputs gracefully", () => {
    expect(redactSensitiveData(null)).toBeNull();
    expect(redactSensitiveData(undefined)).toBeUndefined();
    expect(redactSensitiveData("test_string")).toBe("test_string");
    expect(redactSensitiveData(12345)).toBe(12345);
  });
});
