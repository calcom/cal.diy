/** @vitest-environment node */

import process from "node:process";
import { IdentityProvider, UserPermissionRole } from "@calcom/prisma/enums";
import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "./ErrorCode";

const mockPrismaUserUpdate = vi.fn();

vi.mock("@calcom/prisma", () => ({
  prisma: {
    user: {
      update: (...args: unknown[]) => mockPrismaUserUpdate(...args),
    },
  },
  default: {
    user: {
      update: (...args: unknown[]) => mockPrismaUserUpdate(...args),
    },
  },
}));

const mockFindByEmailAndIncludeProfilesAndPassword = vi.fn();

vi.mock("@calcom/features/users/repositories/UserRepository", () => {
  return {
    UserRepository: vi.fn().mockImplementation(function () {
      return {
        findByEmailAndIncludeProfilesAndPassword: mockFindByEmailAndIncludeProfilesAndPassword,
      };
    }),
  };
});

vi.mock("./verifyPassword", () => ({
  verifyPassword: vi.fn(),
}));

vi.mock("@calcom/lib/checkRateLimitAndThrowError", () => ({
  checkRateLimitAndThrowError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@calcom/lib/server/PiiHasher", () => ({
  hashEmail: vi.fn((email: string) => `hashed_${email}`),
}));

vi.mock("@calcom/lib/totp", () => ({
  totpAuthenticatorCheck: vi.fn(),
}));

vi.mock("@calcom/lib/crypto", () => ({
  symmetricDecrypt: vi.fn(),
  symmetricEncrypt: vi.fn(),
}));

vi.mock("@calcom/lib/auth/isPasswordValid", () => ({
  isPasswordValid: vi.fn(),
}));

vi.mock("@calcom/lib/env", () => ({
  isENVDev: false,
}));

vi.mock("@calcom/lib/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@calcom/lib/constants")>();
  return {
    ...actual,
    IS_TEAM_BILLING_ENABLED: false,
    ENABLE_PROFILE_SWITCHER: false,
    WEBAPP_URL: "http://localhost:3000",
    WEBSITE_URL: "http://localhost:3000",
  };
});

vi.mock("@calcom/lib/logger", () => ({
  default: {
    getSubLogger: vi.fn(() => ({
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    })),
  },
}));

vi.mock("@calcom/lib/safeStringify", () => ({
  safeStringify: vi.fn((obj) => JSON.stringify(obj)),
}));

vi.mock("./next-auth-custom-adapter", () => ({
  default: vi.fn(() => ({
    linkAccount: vi.fn(),
  })),
}));

vi.mock("@calcom/i18n/server", () => ({
  getTranslation: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("@calcom/features/profile/repositories/ProfileRepository", () => ({
  ProfileRepository: {
    findAllProfilesForUserIncludingMovedUser: vi.fn(),
    findByUpIdWithAuth: vi.fn(),
  },
}));

vi.mock("next-auth/providers/credentials", () => ({ default: vi.fn(() => ({ id: "credentials" })) }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));

describe("authorizeCredentials: SSO 2FA TOTP and Password Authentication", () => {
  let authorizeCredentials: typeof import("./next-auth-options").authorizeCredentials;
  let verifyPassword: any;
  let totpAuthenticatorCheck: any;
  let symmetricDecrypt: any;
  let symmetricEncrypt: any;

  const TEST_ENCRYPTION_KEY = "test_encryption_key_32_chars_long!!";
  const TEST_WEBSITE_URL = "http://localhost:3000";

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFindByEmailAndIncludeProfilesAndPassword.mockReset();
    mockPrismaUserUpdate.mockReset();

    process.env.CALENDSO_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

    const verifyPasswordModule = await import("./verifyPassword");
    verifyPassword = verifyPasswordModule.verifyPassword;

    const totpModule = await import("@calcom/lib/totp");
    totpAuthenticatorCheck = totpModule.totpAuthenticatorCheck;

    const cryptoModule = await import("@calcom/lib/crypto");
    symmetricDecrypt = cryptoModule.symmetricDecrypt;
    symmetricEncrypt = cryptoModule.symmetricEncrypt;

    const authModule = await import("./next-auth-options");
    authorizeCredentials = authModule.authorizeCredentials;
  });

  afterEach(() => {
    delete process.env.CALENDSO_ENCRYPTION_KEY;
  });

  const createMockUser = (overrides: Partial<any> = {}) => ({
    id: 1,
    email: "user@example.com",
    name: "Test User",
    username: "testuser",
    role: UserPermissionRole.USER,
    locked: false,
    identityProvider: IdentityProvider.CAL,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    backupCodes: null,
    password: {
      hash: "$2a$10$mockHashedPasswordValue",
    },
    allProfiles: [
      {
        id: 1,
        upId: "usr_1",
        username: "testuser",
      },
    ],
    teams: [],
    ...overrides,
  });

  const generateSignedTotpToken = async (
    email: string,
    options: {
      key?: string;
      expiresIn?: string | number;
      issuer?: string;
      audience?: string;
    } = {}
  ) => {
    const key = options.key ?? TEST_ENCRYPTION_KEY;
    const secret = new TextEncoder().encode(key);
    return new SignJWT({ email })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(email)
      .setIssuedAt()
      .setIssuer(options.issuer ?? TEST_WEBSITE_URL)
      .setAudience(options.audience ?? `${TEST_WEBSITE_URL}/auth/login`)
      .setExpirationTime(options.expiresIn ?? "2m")
      .sign(secret);
  };

  it("Test 1: Standard email + password + TOTP succeeds", async () => {
    const mockUser = createMockUser({
      identityProvider: IdentityProvider.CAL,
      twoFactorEnabled: true,
      twoFactorSecret: "encrypted_2fa_secret",
      password: { hash: "$2a$10$hashedpw" },
    });
    mockFindByEmailAndIncludeProfilesAndPassword.mockResolvedValue(mockUser);
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(symmetricDecrypt).mockReturnValue("abcdefabcdefabcdefabcdefabcdefab");
    vi.mocked(totpAuthenticatorCheck).mockReturnValue(true);

    const result = await authorizeCredentials({
      email: "user@example.com",
      password: "correctpassword",
      totpCode: "123456",
      backupCode: "",
    } as any);

    expect(result).toBeDefined();
    expect(result?.email).toBe("user@example.com");
    expect(verifyPassword).toHaveBeenCalledWith("correctpassword", "$2a$10$hashedpw");
    expect(totpAuthenticatorCheck).toHaveBeenCalledWith("123456", "abcdefabcdefabcdefabcdefabcdefab");
  });

  it("Test 2: Standard email + invalid password fails with IncorrectEmailPassword regardless of TOTP code", async () => {
    const mockUser = createMockUser({
      identityProvider: IdentityProvider.CAL,
      twoFactorEnabled: true,
      twoFactorSecret: "encrypted_2fa_secret",
      password: { hash: "$2a$10$hashedpw" },
    });
    mockFindByEmailAndIncludeProfilesAndPassword.mockResolvedValue(mockUser);
    vi.mocked(verifyPassword).mockResolvedValue(false);
    vi.mocked(totpAuthenticatorCheck).mockReturnValue(true);

    await expect(
      authorizeCredentials({
        email: "user@example.com",
        password: "wrongpassword",
        totpCode: "123456",
        backupCode: "",
      } as any)
    ).rejects.toThrow(ErrorCode.IncorrectEmailPassword);

    expect(verifyPassword).toHaveBeenCalledWith("wrongpassword", "$2a$10$hashedpw");
    expect(totpAuthenticatorCheck).not.toHaveBeenCalled();
  });

  it("Test 3: SSO flow with valid signed totpToken + valid TOTP code succeeds without password", async () => {
    const mockUser = createMockUser({
      identityProvider: IdentityProvider.GOOGLE,
      twoFactorEnabled: true,
      twoFactorSecret: "encrypted_2fa_secret",
      password: null,
    });
    mockFindByEmailAndIncludeProfilesAndPassword.mockResolvedValue(mockUser);
    vi.mocked(symmetricDecrypt).mockReturnValue("abcdefabcdefabcdefabcdefabcdefab");
    vi.mocked(totpAuthenticatorCheck).mockReturnValue(true);

    const validToken = await generateSignedTotpToken("user@example.com");

    const result = await authorizeCredentials({
      email: "user@example.com",
      password: "",
      totpToken: validToken,
      totpCode: "123456",
      backupCode: "",
    } as any);

    expect(result).toBeDefined();
    expect(result?.email).toBe("user@example.com");
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(totpAuthenticatorCheck).toHaveBeenCalledWith("123456", "abcdefabcdefabcdefabcdefabcdefab");
  });

  it("Test 4: SSO flow with valid signed totpToken + valid backup code succeeds without password", async () => {
    const mockUser = createMockUser({
      identityProvider: IdentityProvider.GOOGLE,
      twoFactorEnabled: true,
      twoFactorSecret: "encrypted_2fa_secret",
      backupCodes: "encrypted_backup_codes_blob",
      password: null,
    });
    mockFindByEmailAndIncludeProfilesAndPassword.mockResolvedValue(mockUser);
    vi.mocked(symmetricDecrypt).mockReturnValue(JSON.stringify(["BACKUP12", "BACKUP34"]));
    vi.mocked(symmetricEncrypt).mockReturnValue("new_encrypted_backup_codes");
    mockPrismaUserUpdate.mockResolvedValue({});

    const validToken = await generateSignedTotpToken("user@example.com");

    const result = await authorizeCredentials({
      email: "user@example.com",
      password: "",
      totpToken: validToken,
      totpCode: "",
      backupCode: "BACKUP-12",
    } as any);

    expect(result).toBeDefined();
    expect(result?.email).toBe("user@example.com");
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(mockPrismaUserUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { backupCodes: "new_encrypted_backup_codes" },
    });
  });

  it("Test 5: SSO flow with invalid or tampered totpToken fails", async () => {
    const mockUser = createMockUser({
      identityProvider: IdentityProvider.GOOGLE,
      twoFactorEnabled: true,
      twoFactorSecret: "encrypted_2fa_secret",
      password: null,
    });
    mockFindByEmailAndIncludeProfilesAndPassword.mockResolvedValue(mockUser);

    const tamperedToken = await generateSignedTotpToken("user@example.com", {
      key: "different_tampered_signing_key_32chars",
    });

    await expect(
      authorizeCredentials({
        email: "user@example.com",
        password: "",
        totpToken: tamperedToken,
        totpCode: "123456",
        backupCode: "",
      } as any)
    ).rejects.toThrow(ErrorCode.IncorrectEmailPassword);

    expect(totpAuthenticatorCheck).not.toHaveBeenCalled();
  });

  it("Test 6: SSO flow with expired totpToken fails", async () => {
    const mockUser = createMockUser({
      identityProvider: IdentityProvider.GOOGLE,
      twoFactorEnabled: true,
      twoFactorSecret: "encrypted_2fa_secret",
      password: null,
    });
    mockFindByEmailAndIncludeProfilesAndPassword.mockResolvedValue(mockUser);

    const expiredToken = await generateSignedTotpToken("user@example.com", {
      expiresIn: Math.floor(Date.now() / 1000) - 60,
    });

    await expect(
      authorizeCredentials({
        email: "user@example.com",
        password: "",
        totpToken: expiredToken,
        totpCode: "123456",
        backupCode: "",
      } as any)
    ).rejects.toThrow(ErrorCode.IncorrectEmailPassword);

    expect(totpAuthenticatorCheck).not.toHaveBeenCalled();
  });

  it("Test 7: SSO flow with mismatched email claim in totpToken fails", async () => {
    const mockUser = createMockUser({
      id: 1,
      email: "victim@example.com",
      identityProvider: IdentityProvider.GOOGLE,
      twoFactorEnabled: true,
      twoFactorSecret: "encrypted_2fa_secret",
      password: null,
    });
    mockFindByEmailAndIncludeProfilesAndPassword.mockResolvedValue(mockUser);

    const attackerTokenWithDifferentEmail = await generateSignedTotpToken("attacker@example.com");

    await expect(
      authorizeCredentials({
        email: "victim@example.com",
        password: "",
        totpToken: attackerTokenWithDifferentEmail,
        totpCode: "123456",
        backupCode: "",
      } as any)
    ).rejects.toThrow(ErrorCode.IncorrectEmailPassword);

    expect(totpAuthenticatorCheck).not.toHaveBeenCalled();
  });

  it("Test 8: Attempting to bypass password by providing a totpCode without a valid totpToken fails", async () => {
    const mockUser = createMockUser({
      identityProvider: IdentityProvider.CAL,
      twoFactorEnabled: true,
      twoFactorSecret: "encrypted_2fa_secret",
      password: { hash: "$2a$10$hashedpw" },
    });
    mockFindByEmailAndIncludeProfilesAndPassword.mockResolvedValue(mockUser);
    vi.mocked(verifyPassword).mockResolvedValue(false);
    vi.mocked(totpAuthenticatorCheck).mockReturnValue(true);

    await expect(
      authorizeCredentials({
        email: "user@example.com",
        password: "",
        totpCode: "123456",
        backupCode: "",
      } as any)
    ).rejects.toThrow(ErrorCode.IncorrectEmailPassword);

    expect(totpAuthenticatorCheck).not.toHaveBeenCalled();
  });

  it("Test 9: SSO totpToken provided for non-2FA user fails password check", async () => {
    const mockUser = createMockUser({
      identityProvider: IdentityProvider.GOOGLE,
      twoFactorEnabled: false,
      password: null,
    });
    mockFindByEmailAndIncludeProfilesAndPassword.mockResolvedValue(mockUser);

    const validToken = await generateSignedTotpToken("user@example.com");

    await expect(
      authorizeCredentials({
        email: "user@example.com",
        password: "",
        totpToken: validToken,
        totpCode: "123456",
        backupCode: "",
      } as any)
    ).rejects.toThrow(ErrorCode.IncorrectEmailPassword);

    expect(totpAuthenticatorCheck).not.toHaveBeenCalled();
  });

  it("Test 10: SSO totpToken with wrong issuer or audience fails", async () => {
    const mockUser = createMockUser({
      identityProvider: IdentityProvider.GOOGLE,
      twoFactorEnabled: true,
      twoFactorSecret: "encrypted_2fa_secret",
      password: null,
    });
    mockFindByEmailAndIncludeProfilesAndPassword.mockResolvedValue(mockUser);

    const wrongIssuerToken = await generateSignedTotpToken("user@example.com", {
      issuer: "https://evil.com",
    });

    await expect(
      authorizeCredentials({
        email: "user@example.com",
        password: "",
        totpToken: wrongIssuerToken,
        totpCode: "123456",
        backupCode: "",
      } as any)
    ).rejects.toThrow(ErrorCode.IncorrectEmailPassword);

    expect(totpAuthenticatorCheck).not.toHaveBeenCalled();
  });

  it("Test 11: CAL account with password hash cannot bypass password verification using totpToken", async () => {
    const mockUser = createMockUser({
      identityProvider: IdentityProvider.CAL,
      twoFactorEnabled: true,
      twoFactorSecret: "encrypted_2fa_secret",
      password: { hash: "$2a$10$hashedpw" },
    });
    mockFindByEmailAndIncludeProfilesAndPassword.mockResolvedValue(mockUser);
    vi.mocked(verifyPassword).mockResolvedValue(false);

    const validToken = await generateSignedTotpToken("user@example.com");

    await expect(
      authorizeCredentials({
        email: "user@example.com",
        password: "wrongpassword",
        totpToken: validToken,
        totpCode: "123456",
        backupCode: "",
      } as any)
    ).rejects.toThrow(ErrorCode.IncorrectEmailPassword);

    expect(totpAuthenticatorCheck).not.toHaveBeenCalled();
  });

  it("Test 12: signJwt and verifyTotpJwt throw error when CALENDSO_ENCRYPTION_KEY is missing", async () => {
    delete process.env.CALENDSO_ENCRYPTION_KEY;

    const { signJwt, verifyTotpJwt } = await import("./signJwt");

    await expect(signJwt({ email: "user@example.com" })).rejects.toThrow(
      "Missing CALENDSO_ENCRYPTION_KEY environment variable"
    );

    await expect(verifyTotpJwt("some.dummy.jwt")).rejects.toThrow(
      "Missing CALENDSO_ENCRYPTION_KEY environment variable"
    );
  });
});
