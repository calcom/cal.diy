import { prisma } from "@calcom/prisma";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateAppCredentialsOptions } from "./updateAppCredentials.handler";
import { sanitizeJsonObject, updateAppCredentialsHandler } from "./updateAppCredentials.handler";

vi.mock("@calcom/prisma", () => ({
  prisma: {
    credential: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const findFirst = prisma.credential.findFirst as unknown as ReturnType<typeof vi.fn>;
const update = prisma.credential.update as unknown as ReturnType<typeof vi.fn>;

const ctx = { user: { id: 1 } } as unknown as UpdateAppCredentialsOptions["ctx"];

describe("sanitizeJsonObject", () => {
  it("returns {} for non-object, null or undefined values", () => {
    expect(sanitizeJsonObject(null)).toEqual({});
    expect(sanitizeJsonObject(undefined)).toEqual({});
    expect(sanitizeJsonObject("legacy-string")).toEqual({});
    expect(sanitizeJsonObject(42)).toEqual({});
    expect(sanitizeJsonObject(["a", "b"])).toEqual({});
  });

  it("strips __proto__, constructor and prototype keys", () => {
    // JSON.parse creates __proto__ as an own property, like real request input
    const input = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":{"polluted":true},"prototype":{"polluted":true},"apiKey":"test-key"}'
    );
    const result = sanitizeJsonObject(input);

    expect(result).toEqual({ apiKey: "test-key" });
    expect(Object.hasOwn(result, "__proto__")).toBe(false);
    expect(Object.hasOwn(result, "constructor")).toBe(false);
    expect(Object.hasOwn(result, "prototype")).toBe(false);
  });

  it("recursively sanitizes nested objects", () => {
    const input = JSON.parse('{"outer":{"__proto__":{"x":1},"inner":{"constructor":{"y":2},"ok":"yes"}}}');

    expect(sanitizeJsonObject(input)).toEqual({ outer: { inner: { ok: "yes" } } });
  });

  it("strips forbidden keys from objects nested inside arrays", () => {
    const input = JSON.parse(
      '{"items":[{"__proto__":{"x":1},"ok":"yes"},"plain",[{"constructor":{"y":2}}]]}'
    );

    expect(sanitizeJsonObject(input)).toEqual({ items: [{ ok: "yes" }, "plain", [{}]] });
  });
});

describe("updateAppCredentialsHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects with TRPCError when credential is not found", async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      updateAppCredentialsHandler({ ctx, input: { credentialId: 10, key: { apiKey: "x" } } })
    ).rejects.toBeInstanceOf(TRPCError);
    expect(update).not.toHaveBeenCalled();
  });

  it("merges existing keys with new keys safely and queries with explicit select", async () => {
    findFirst.mockResolvedValue({ id: 10, appId: "custom-app", key: { existing: "keep", apiKey: "old" } });
    update.mockResolvedValue({ id: 10 });

    const maliciousKey = JSON.parse('{"__proto__":{"polluted":true},"apiKey":"new"}');
    const result = await updateAppCredentialsHandler({
      ctx,
      input: { credentialId: 10, key: maliciousKey },
    });

    expect(result).toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 10, userId: 1 },
      select: { id: true, appId: true, key: true },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { key: { existing: "keep", apiKey: "new" } },
      select: { id: true },
    });
  });

  it("safely handles non-object credential keys in the database", async () => {
    findFirst.mockResolvedValue({ id: 10, appId: "custom-app", key: "legacy-string" });
    update.mockResolvedValue({ id: 10 });

    await updateAppCredentialsHandler({
      ctx,
      input: { credentialId: 10, key: { apiKey: "new" } },
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { key: { apiKey: "new" } },
      select: { id: true },
    });
  });
});
