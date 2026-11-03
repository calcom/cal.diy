import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { generateWebhookSignature, isValidWebhookSignature } from "./verifyWebhookSignature";

const SALT_KEY = "test-salt-key";

const payload = {
  payment_id: "pay_123",
  payment_request_id: "req_456",
  phone: "6598765432",
  amount: "25.00",
  currency: "SGD",
  status: "completed",
  reference_number: "ref_789",
};

const sign = (saltKey: string, source: string) =>
  createHmac("sha256", saltKey).update(source, "utf-8").digest("hex");

describe("generateWebhookSignature", () => {
  it("signs the fields sorted by key and concatenated as keyvalue", () => {
    const expected = sign(
      SALT_KEY,
      "amount25.00currencySGDpayment_idpay_123payment_request_idreq_456phone6598765432reference_numberref_789statuscompleted"
    );

    expect(generateWebhookSignature(SALT_KEY, payload)).toBe(expected);
  });

  it("produces a 64 character hex digest", () => {
    expect(generateWebhookSignature(SALT_KEY, payload)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not depend on property insertion order", () => {
    const reordered = {
      status: payload.status,
      amount: payload.amount,
      reference_number: payload.reference_number,
      payment_id: payload.payment_id,
      currency: payload.currency,
      phone: payload.phone,
      payment_request_id: payload.payment_request_id,
    };

    expect(generateWebhookSignature(SALT_KEY, reordered)).toBe(
      generateWebhookSignature(SALT_KEY, payload)
    );
  });

  it("produces a different signature for a different salt key", () => {
    expect(generateWebhookSignature("other-salt", payload)).not.toBe(
      generateWebhookSignature(SALT_KEY, payload)
    );
  });

  it("produces a different signature when any field changes", () => {
    expect(generateWebhookSignature(SALT_KEY, { ...payload, amount: "25.01" })).not.toBe(
      generateWebhookSignature(SALT_KEY, payload)
    );
  });

  it("ignores an hmac field in the payload it is given", () => {
    const signature = generateWebhookSignature(SALT_KEY, payload);

    expect(generateWebhookSignature(SALT_KEY, { ...payload, hmac: signature })).toBe(signature);
    expect(generateWebhookSignature(SALT_KEY, { ...payload, hmac: "anything at all" })).toBe(signature);
  });
});

describe("isValidWebhookSignature", () => {
  it("accepts the signature produced for the same payload and salt key", () => {
    const signature = generateWebhookSignature(SALT_KEY, payload);

    expect(isValidWebhookSignature(SALT_KEY, payload, signature)).toBe(true);
  });

  it("rejects a signature produced with a different salt key", () => {
    const signature = generateWebhookSignature("attacker-salt", payload);

    expect(isValidWebhookSignature(SALT_KEY, payload, signature)).toBe(false);
  });

  it("rejects a signature whose payload was tampered with", () => {
    const signature = generateWebhookSignature(SALT_KEY, payload);

    expect(isValidWebhookSignature(SALT_KEY, { ...payload, amount: "0.01" }, signature)).toBe(false);
  });

  it("rejects a signature that differs only in its final character", () => {
    const signature = generateWebhookSignature(SALT_KEY, payload);
    const lastChar = signature.slice(-1);
    const tampered = `${signature.slice(0, -1)}${lastChar === "0" ? "1" : "0"}`;

    expect(isValidWebhookSignature(SALT_KEY, payload, tampered)).toBe(false);
  });

  it("rejects a signature that shares a long prefix with the expected one", () => {
    const signature = generateWebhookSignature(SALT_KEY, payload);
    const truncated = signature.slice(0, 63);

    expect(isValidWebhookSignature(SALT_KEY, payload, `${truncated}0`)).toBe(false);
  });

  it.each([
    ["a shorter signature", "abc"],
    ["an empty string", ""],
    ["a longer signature", `${"a".repeat(65)}`],
  ])("rejects %s without throwing on the length mismatch", (_label, received) => {
    expect(() => isValidWebhookSignature(SALT_KEY, payload, received)).not.toThrow();
    expect(isValidWebhookSignature(SALT_KEY, payload, received)).toBe(false);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 123],
    ["an object", {}],
    ["an array", []],
    ["a boolean", true],
  ])("rejects %s instead of throwing", (_label, received) => {
    expect(() => isValidWebhookSignature(SALT_KEY, payload, received)).not.toThrow();
    expect(isValidWebhookSignature(SALT_KEY, payload, received)).toBe(false);
  });

  it("accepts the payload as received, hmac field included", () => {
    const signature = generateWebhookSignature(SALT_KEY, payload);

    expect(isValidWebhookSignature(SALT_KEY, { ...payload, hmac: signature }, signature)).toBe(true);
  });

  it("rejects a valid signature once a field is removed from the payload", () => {
    const signature = generateWebhookSignature(SALT_KEY, payload);
    const { phone: _phone, ...withoutPhone } = payload;

    expect(isValidWebhookSignature(SALT_KEY, withoutPhone, signature)).toBe(false);
  });
});
