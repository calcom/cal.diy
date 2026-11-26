import jwt from "jsonwebtoken";

import { TokensService } from "@/modules/tokens/tokens.service";

jest.mock("@/modules/tokens/tokens.repository", () => ({
  TokensRepository: class TokensRepository {},
}));

const ENCRYPTION_KEY = "test-calendso-encryption-key";

const payload = {
  userId: 1,
  scope: ["READ_BOOKING"],
  token_type: "Access Token",
  clientId: "client-id",
};

describe("TokensService.getDecodedThirdPartyAccessToken", () => {
  const createService = () => {
    const config = { get: jest.fn().mockReturnValue(ENCRYPTION_KEY) };
    const tokensRepository = { getAccessTokenOwnerId: jest.fn() };
    return new TokensService(
      config as unknown as ConstructorParameters<typeof TokensService>[0],
      tokensRepository as unknown as ConstructorParameters<typeof TokensService>[1]
    );
  };

  it("accepts an HS256 token, which is what OAuthService signs with", () => {
    const token = jwt.sign(payload, ENCRYPTION_KEY, { expiresIn: 60 });

    expect(createService().getDecodedThirdPartyAccessToken(token)).toMatchObject(payload);
  });

  it.each(["HS384", "HS512"] as const)(
    "rejects a token signed with %s using the same key",
    (algorithm) => {
      const token = jwt.sign(payload, ENCRYPTION_KEY, { algorithm, expiresIn: 60 });

      expect(createService().getDecodedThirdPartyAccessToken(token)).toBeNull();
    }
  );
});
