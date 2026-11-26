import { TokensRepository } from "@/modules/tokens/tokens.repository";
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import jwt from "jsonwebtoken";

type OAuthTokenPayload = {
  userId?: number;
  teamId?: number;
  scope: string[];
  token_type: string;
};

@Injectable()
export class TokensService {
  constructor(
    private readonly config: ConfigService,
    private readonly tokensRepository: TokensRepository
  ) {}

  async getAccessTokenOwnerId(accessToken: string): Promise<number | null> {
    const ownerId = await this.tokensRepository.getAccessTokenOwnerId(accessToken);

    if (ownerId) {
      return ownerId;
    }

    const decodedToken = this.getDecodedThirdPartyAccessToken(accessToken);

    return decodedToken?.userId ?? null;
  }

  getDecodedThirdPartyAccessToken(token: string): OAuthTokenPayload | null {
    const encryptionKey = this.config.get<string>("CALENDSO_ENCRYPTION_KEY");
    if (!encryptionKey) {
      throw new InternalServerErrorException("CALENDSO_ENCRYPTION_KEY environment variable is not set.");
    }

    let decodedToken: OAuthTokenPayload;
    try {
      // OAuthService signs these tokens with jwt.sign(...) and no algorithm option, which is HS256.
      decodedToken = jwt.verify(token, encryptionKey, { algorithms: ["HS256"] }) as OAuthTokenPayload;
    } catch (_e) {
      return null;
    }

    if (!decodedToken || decodedToken.token_type !== "Access Token") {
      return null;
    }

    return decodedToken;
  }
}
