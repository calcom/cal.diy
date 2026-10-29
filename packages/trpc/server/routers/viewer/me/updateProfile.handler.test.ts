import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../types";

const { mockUserFindFirst, mockUserUpdate, mockSendChangeOfEmailVerification, mockIsFeatureEnabled } =
  vi.hoisted(() => ({
    mockUserFindFirst: vi.fn(),
    mockUserUpdate: vi.fn(),
    mockSendChangeOfEmailVerification: vi.fn(),
    mockIsFeatureEnabled: vi.fn(),
  }));

vi.mock("@calcom/prisma", () => ({
  prisma: {
    user: {
      findFirst: (...args: unknown[]) => mockUserFindFirst(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
    secondaryEmail: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@calcom/features/flags/features.repository", () => ({
  FeaturesRepository: class {
    checkIfFeatureIsEnabledGlobally = (...args: unknown[]) => mockIsFeatureEnabled(...args);
  },
}));

vi.mock("@calcom/features/auth/lib/verifyEmail", () => ({
  sendChangeOfEmailVerification: (...args: unknown[]) => mockSendChangeOfEmailVerification(...args),
}));

vi.mock("@calcom/app-store/stripepayment/lib/utils", () => ({
  getPremiumMonthlyPlanPriceId: vi.fn(),
}));

vi.mock("@calcom/features/profile/lib/checkUsername", () => ({
  checkUsername: vi.fn(),
}));

vi.mock("@calcom/features/schedules/repositories/ScheduleRepository", () => ({
  ScheduleRepository: vi.fn(),
}));

vi.mock("@calcom/lib/server/avatar", () => ({
  uploadAvatar: vi.fn(),
}));

vi.mock("@calcom/lib/server/resizeBase64Image", () => ({
  resizeBase64Image: vi.fn(),
}));

vi.mock("@calcom/i18n/server", () => ({
  getTranslation: vi.fn(async () => (key: string) => key),
}));

import { updateProfileHandler } from "./updateProfile.handler";

const makeUser = (email: string) =>
  ({
    id: 1,
    email,
    username: "john",
    emailVerified: new Date("2026-01-01"),
    metadata: null,
    locale: "en",
    timeZone: "UTC",
    organizationId: null,
    defaultScheduleId: 1,
  }) as unknown as NonNullable<TrpcSessionUser>;

const getUpdateData = () => mockUserUpdate.mock.calls[0][0].data;

describe("updateProfileHandler email normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFeatureEnabled.mockResolvedValue(true);
    mockUserFindFirst.mockResolvedValue(null);
    mockUserUpdate.mockImplementation(async ({ data }) => ({
      id: 1,
      username: "john",
      email: data.email ?? "John.Doe@Example.com",
      metadata: null,
      avatarUrl: null,
      schedules: [],
    }));
  });

  it("lowercases a mixed case stored email when email is not in the input", async () => {
    const result = await updateProfileHandler({
      ctx: { user: makeUser("John.Doe@Example.com") },
      input: { name: "John" },
    });

    expect(getUpdateData().email).toBe("john.doe@example.com");
    expect(result.hasEmailBeenChanged).toBeFalsy();
    expect(mockSendChangeOfEmailVerification).not.toHaveBeenCalled();
  });

  it("treats a case only difference as the same email", async () => {
    const result = await updateProfileHandler({
      ctx: { user: makeUser("John.Doe@Example.com") },
      input: { email: "john.doe@example.com" },
    });

    expect(getUpdateData().email).toBe("john.doe@example.com");
    expect(getUpdateData().metadata).not.toHaveProperty("emailChangeWaitingForVerification");
    expect(result.hasEmailBeenChanged).toBeFalsy();
    expect(mockSendChangeOfEmailVerification).not.toHaveBeenCalled();
  });

  it("leaves the stored email alone when the lowercase version belongs to another user", async () => {
    mockUserFindFirst.mockResolvedValue({ id: 2 });

    await updateProfileHandler({
      ctx: { user: makeUser("John.Doe@Example.com") },
      input: { email: "john.doe@example.com" },
    });

    expect(mockUserFindFirst).toHaveBeenCalledWith({
      where: { email: "john.doe@example.com", id: { not: 1 } },
      select: { id: true },
    });
    expect(getUpdateData()).not.toHaveProperty("email");
  });

  it("does nothing extra when the stored email is already lowercase", async () => {
    await updateProfileHandler({
      ctx: { user: makeUser("john.doe@example.com") },
      input: { name: "John" },
    });

    expect(mockUserFindFirst).not.toHaveBeenCalled();
    expect(getUpdateData()).not.toHaveProperty("email");
  });

  it("still starts verification for a real email change", async () => {
    const result = await updateProfileHandler({
      ctx: { user: makeUser("John.Doe@Example.com") },
      input: { email: "new@example.com" },
    });

    expect(getUpdateData()).not.toHaveProperty("email");
    expect(getUpdateData().metadata.emailChangeWaitingForVerification).toBe("new@example.com");
    expect(result.hasEmailBeenChanged).toBeTruthy();
    expect(mockSendChangeOfEmailVerification).toHaveBeenCalledOnce();
  });
});
