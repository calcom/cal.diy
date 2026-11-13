import { verifyCodeUnAuthenticated } from "@calcom/features/auth/lib/verifyCodeUnAuthenticated";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkIfBookerEmailIsBlocked } from "./checkIfBookerEmailIsBlocked";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@calcom/prisma", () => ({ default: { user: { findFirst } } }));
vi.mock("@calcom/features/auth/lib/verifyCodeUnAuthenticated", () => ({
  verifyCodeUnAuthenticated: vi.fn(),
}));

describe("checkIfBookerEmailIsBlocked", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BLACKLISTED_GUEST_EMAILS", "");
    findFirst.mockResolvedValue({
      id: 1,
      email: "booker@example.com",
      requiresBookerEmailVerification: true,
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    "booker@example.com",
    "booker+test@example.com",
  ])("verifies the code against the full booking address %s", async (bookerEmail) => {
    vi.mocked(verifyCodeUnAuthenticated).mockImplementation(async (email) => {
      if (email !== bookerEmail) throw new Error("Invalid verification code");
      return true;
    });
    await expect(
      checkIfBookerEmailIsBlocked({ bookerEmail, verificationCode: "123456", isReschedule: false })
    ).resolves.toBe(false);
    expect(verifyCodeUnAuthenticated).toHaveBeenCalledWith(bookerEmail, "123456");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { email: "booker@example.com", emailVerified: { not: null } },
            { secondaryEmails: { some: { email: "booker@example.com", emailVerified: { not: null } } } },
          ],
        },
      })
    );
  });

  it("still requires verification for an anonymous plus alias", async () => {
    await expect(
      checkIfBookerEmailIsBlocked({ bookerEmail: "booker+test@example.com", isReschedule: false })
    ).rejects.toMatchObject({ code: ErrorCode.BookerEmailRequiresLogin });
    expect(verifyCodeUnAuthenticated).not.toHaveBeenCalled();
  });

  it("still rejects invalid verification codes", async () => {
    vi.mocked(verifyCodeUnAuthenticated).mockRejectedValue(new Error("Invalid verification code"));
    await expect(
      checkIfBookerEmailIsBlocked({
        bookerEmail: "booker+test@example.com",
        verificationCode: "000000",
        isReschedule: false,
      })
    ).rejects.toMatchObject({ code: ErrorCode.UnableToValidateVerificationCode });
  });

  it("preserves the rescheduling exception", async () => {
    await expect(
      checkIfBookerEmailIsBlocked({ bookerEmail: "booker+test@example.com", isReschedule: true })
    ).resolves.toBe(false);
    expect(verifyCodeUnAuthenticated).not.toHaveBeenCalled();
  });

  it("still blocks environment-blacklisted aliases without a verified user", async () => {
    vi.stubEnv("BLACKLISTED_GUEST_EMAILS", "booker@example.com");
    findFirst.mockResolvedValue(null);
    await expect(
      checkIfBookerEmailIsBlocked({ bookerEmail: "booker+test@example.com", isReschedule: false })
    ).rejects.toMatchObject({ code: ErrorCode.BookerEmailBlocked });
    expect(verifyCodeUnAuthenticated).not.toHaveBeenCalled();
  });
});
