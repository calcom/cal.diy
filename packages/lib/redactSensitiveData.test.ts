import { describe, expect, it } from "vitest";
import { redactSensitiveData } from "./redactSensitiveData";

describe("redactSensitiveData", () => {
  it("should return non-object values as is", () => {
    expect(redactSensitiveData(null)).toMatchInlineSnapshot(`null`);
    expect(redactSensitiveData(undefined)).toMatchInlineSnapshot(`undefined`);
    expect(redactSensitiveData("string")).toMatchInlineSnapshot(`"string"`);
    expect(redactSensitiveData(123)).toMatchInlineSnapshot(`123`);
    expect(redactSensitiveData(true)).toMatchInlineSnapshot(`true`);
  });

  it("should redact sensitive fields from flat objects", () => {
    const input = {
      username: "test",
      password: "secret123",
      apiKey: "key123",
      token: "token123",
      normalField: "value",
    };
    expect(redactSensitiveData(input)).toMatchInlineSnapshot(`
      {
        "apiKey": "[REDACTED]",
        "normalField": "value",
        "password": "[REDACTED]",
        "token": "[REDACTED]",
        "username": "test",
      }
    `);
  });

  it("should redact sensitive fields from nested objects", () => {
    const input = {
      user: {
        name: "John",
        password: "secret123",
        credentials: {
          apiKey: "key123",
          token: "token123",
        },
      },
      settings: {
        theme: "dark",
        auth: {
          secret: "secret123",
        },
      },
    };
    expect(redactSensitiveData(input)).toMatchInlineSnapshot(`
      {
        "settings": {
          "auth": "[REDACTED]",
          "theme": "dark",
        },
        "user": {
          "credentials": {
            "apiKey": "[REDACTED]",
            "token": "[REDACTED]",
          },
          "name": "John",
          "password": "[REDACTED]",
        },
      }
    `);
  });

  it("should handle arrays of objects", () => {
    const input = {
      users: [
        { name: "John", password: "pass1", token: "token1" },
        { name: "Jane", password: "pass2", token: "token2" },
      ],
      config: {
        apiKey: "key123",
        items: [
          { id: 1, secret: "secret1" },
          { id: 2, secret: "secret2" },
        ],
      },
    };
    expect(redactSensitiveData(input)).toMatchInlineSnapshot(`
      {
        "config": {
          "apiKey": "[REDACTED]",
          "items": [
            {
              "id": 1,
              "secret": "[REDACTED]",
            },
            {
              "id": 2,
              "secret": "[REDACTED]",
            },
          ],
        },
        "users": [
          {
            "name": "John",
            "password": "[REDACTED]",
            "token": "[REDACTED]",
          },
          {
            "name": "Jane",
            "password": "[REDACTED]",
            "token": "[REDACTED]",
          },
        ],
      }
    `);
  });

  it("should handle all sensitive field variations", () => {
    const input = {
      accessToken: "token1",
      api_key: "key1",
      apiKey: "key2",
      auth: "auth1",
      authorization: "auth2",
      client_id: "id1",
      client_secret: "secret1",
      credential: "cred1",
      hash: "hash1",
      key: "key3",
      password: "pass1",
      refreshToken: "token2",
      secret: "secret2",
      token: "token3",
      normalField: "value",
    };
    expect(redactSensitiveData(input)).toMatchInlineSnapshot(`
      {
        "accessToken": "[REDACTED]",
        "apiKey": "[REDACTED]",
        "api_key": "[REDACTED]",
        "auth": "[REDACTED]",
        "authorization": "[REDACTED]",
        "client_id": "[REDACTED]",
        "client_secret": "[REDACTED]",
        "credential": "[REDACTED]",
        "hash": "[REDACTED]",
        "key": "[REDACTED]",
        "normalField": "value",
        "password": "[REDACTED]",
        "refreshToken": "[REDACTED]",
        "secret": "[REDACTED]",
        "token": "[REDACTED]",
      }
    `);
  });

  it("should handle circular references gracefully", () => {
    const input: Record<string, unknown> = { name: "test" };
    input.self = input;
    expect(redactSensitiveData(input)).toMatchInlineSnapshot(`
      {
        "name": "test",
        "self": "[Circular]",
      }
    `);
  });

  it("should handle invalid JSON data gracefully", () => {
    const input = {
      name: "test",
      invalid: {
        toJSON: () => {
          throw new Error("Invalid JSON");
        },
      },
    };
    expect(redactSensitiveData(input)).toMatchInlineSnapshot(`
      {
        "error": "Redaction failed",
      }
    `);
  });

  it("should redact delegation credential sensitive fields", () => {
    const input = {
      serviceAccountKey: {
        client_id: "client123",
        client_email: "service@example.com",
        private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...",
        tenant_id: "tenant123",
      },
      encrypted_credentials: "encrypted_data_here",
      normalField: "value",
    };
    expect(redactSensitiveData(input)).toMatchInlineSnapshot(`
      {
        "encrypted_credentials": "[REDACTED]",
        "normalField": "value",
        "serviceAccountKey": "[REDACTED]",
      }
    `);
  });

  it("should redact nested delegation credential fields", () => {
    const input = {
      credential: {
        delegatedTo: {
          serviceAccountKey: {
            private_key: "sensitive_key",
            client_email: "service@example.com",
            tenant_id: "tenant123",
          },
        },
      },
      config: {
        private_key: "another_private_key",
        client_email: "another@example.com",
      },
    };
    expect(redactSensitiveData(input)).toMatchInlineSnapshot(`
      {
        "config": {
          "client_email": "[REDACTED]",
          "private_key": "[REDACTED]",
        },
        "credential": "[REDACTED]",
      }
    `);
  });
});
