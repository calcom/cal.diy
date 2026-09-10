import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExecuteRaw = vi.fn().mockResolvedValue(undefined);
const mockUserCount = vi.fn();
const mockUserCreate = vi.fn().mockResolvedValue({ id: 1 });
const mockTransaction = vi.fn();

vi.mock("app/api/defaultResponderForAppDir", () => ({
  defaultResponderForAppDir:
    (handler: (req: NextRequest) => Promise<Response>) =>
    (req: NextRequest, _context: { params: Promise<Record<string, string>> }) =>
      handler(req),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body, init) => ({
      status: init?.status ?? 200,
      json: vi.fn().mockResolvedValue(body),
    })),
  },
}));

vi.mock("@calcom/lib/auth/hashPassword", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed-password"),
}));

vi.mock("@calcom/lib/slugify", () => ({
  default: vi.fn((value: string) => value.toLowerCase()),
}));

let mockRequestBody: Record<string, unknown> = {};

vi.mock("app/api/parseRequestData", () => ({
  parseRequestData: vi.fn().mockImplementation(() => Promise.resolve(mockRequestBody)),
}));

vi.mock("@calcom/prisma", () => ({
  default: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { POST } from "../route";

const validSetupBody = {
  username: "admin1",
  full_name: "Admin User One",
  email_address: "admin1@example.com",
  password: "TestPassword123!!",
};

const createMockRequest = (): NextRequest => ({}) as NextRequest;

describe("POST /api/auth/setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequestBody = { ...validSetupBody };
    mockUserCount.mockResolvedValue(0);
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) => {
      const tx = {
        $executeRaw: mockExecuteRaw,
        user: {
          count: mockUserCount,
          create: mockUserCreate,
        },
      };
      await callback(tx);
    });
  });

  it("creates the first admin user inside a transaction with an advisory lock", async () => {
    const res = await POST(createMockRequest(), { params: Promise.resolve({}) });
    const body = await res.json();

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockUserCount).toHaveBeenCalledTimes(1);
    expect(mockUserCreate).toHaveBeenCalledWith({
      data: {
        username: "admin1",
        email: "admin1@example.com",
        password: { create: { hash: "hashed-password" } },
        role: "ADMIN",
        name: "Admin User One",
        emailVerified: expect.any(Date),
        locale: "en",
        identityProvider: "CAL",
        creationSource: "WEBAPP",
      },
    });
    expect(res.status).toBe(200);
    expect(body).toEqual({ message: "First admin user created successfully." });
  });

  it("returns 400 when users already exist inside the transaction", async () => {
    mockUserCount.mockResolvedValue(1);

    await expect(POST(createMockRequest(), { params: Promise.resolve({}) })).rejects.toMatchObject({
      statusCode: 400,
      message: "No setup needed.",
    });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockUserCount).toHaveBeenCalledTimes(1);
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid request body", async () => {
    mockRequestBody = {
      ...validSetupBody,
      email_address: "not-an-email",
    };

    await expect(POST(createMockRequest(), { params: Promise.resolve({}) })).rejects.toMatchObject({
      statusCode: 422,
    });

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockUserCreate).not.toHaveBeenCalled();
  });
});
