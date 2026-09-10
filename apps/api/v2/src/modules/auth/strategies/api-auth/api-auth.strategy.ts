import { sha256Hash, isApiKey, stripApiKey } from "@/lib/api-key";
import { AuthMethods } from "@/lib/enums/auth-methods";
import { isOriginAllowed } from "@/lib/is-origin-allowed/is-origin-allowed";
import { BaseStrategy } from "@/lib/passport/strategies/types";
import { ApiKeysRepository } from "@/modules/api-keys/api-keys-repository";
import { MembershipsRepository } from "@/modules/memberships/memberships.repository";
import { OAuthClientRepository } from "@/modules/oauth-clients/oauth-client.repository";
import { OAuthFlowService } from "@/modules/oauth-clients/services/oauth-flow.service";
import { TokensRepository } from "@/modules/tokens/tokens.repository";
import { TokensService } from "@/modules/tokens/tokens.service";
import { UsersService } from "@/modules/users/services/users.service";
import { UserWithProfile, UsersRepository } from "@/modules/users/users.repository";
import { Injectable, InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import type { Request } from "express";
import { getToken } from "next-auth/jwt";

import { INVALID_ACCESS_TOKEN, X_CAL_CLIENT_ID, X_CAL_SECRET_KEY } from "@calcom/platform-constants";

import type { AllowedAuthMethod } from "../../decorators/api-auth-guard-only-allow.decorator";

export type ApiAuthGuardUser = UserWithProfile & { isSystemAdmin: boolean };
export type ApiAuthGuardRequest = Request & {
  authMethod: AuthMethods;
  organizationId: number | null;
  user: ApiAuthGuardUser;
  allowedAuthMethods?: AllowedAuthMethod[];
};
export const NO_AUTH_PROVIDED_MESSAGE = `No authentication method provided. Either pass an API key as 'Bearer' header or OAuth client credentials as '${X_CAL_SECRET_KEY}' and '${X_CAL_CLIENT_ID}' headers`;

export const ONLY_CLIENT_ID_PROVIDED_MESSAGE = `Only '${X_CAL_CLIENT_ID}' header provided. Please also provide '${X_CAL_SECRET_KEY}' header or Auth bearer token as 'Authentication' header`;

export const ONLY_CLIENT_SECRET_PROVIDED_MESSAGE = `Only '${X_CAL_SECRET_KEY}' header provided. Please also provide '${X_CAL_CLIENT_ID}' header or Auth bearer token as 'Authentication' header`;

@Injectable()
export class ApiAuthStrategy extends PassportStrategy(BaseStrategy, "api-auth") {
  private readonly logger = new Logger("ApiAuthStrategy");

  constructor(
    private readonly config: ConfigService,
    private readonly oauthFlowService: OAuthFlowService,
    private readonly tokensRepository: TokensRepository,
    private readonly tokensService: TokensService,
    private readonly userRepository: UsersRepository,
    private readonly apiKeyRepository: ApiKeysRepository,
    private readonly oauthRepository: OAuthClientRepository,
    private readonly usersService: UsersService,
    private readonly membershipsRepository: MembershipsRepository
  ) {
    super();
  }

  async authenticate(request: ApiAuthGuardRequest) {
    try {
      const { params } = request;
      const oAuthClientSecret = request.get(X_CAL_SECRET_KEY);
      const oAuthClientId = params.clientId || request.get(X_CAL_CLIENT_ID);
      const bearerToken = request.get("Authorization")?.replace("Bearer ", "");

      const allowedMethods = request.allowedAuthMethods;
      const noSpecificAuthExpected = !allowedMethods || !allowedMethods.length;

      const oAuthAllowed = noSpecificAuthExpected || allowedMethods.includes("OAUTH_CLIENT_CREDENTIALS");
      const apiKeyAllowed = noSpecificAuthExpected || allowedMethods.includes("API_KEY");
      const accessTokenAllowed = noSpecificAuthExpected || allowedMethods.includes("ACCESS_TOKEN");
      const nextAuthAllowed = noSpecificAuthExpected || allowedMethods.includes("NEXT_AUTH");
      const thirdPartyAccessTokenAllowed =
        noSpecificAuthExpected || allowedMethods.includes("THIRD_PARTY_ACCESS_TOKEN");

      if (oAuthClientId && oAuthClientSecret && oAuthAllowed) {
        request.authMethod = AuthMethods["OAUTH_CLIENT"];
        return await this.authenticateOAuthClient(oAuthClientId, oAuthClientSecret, request);
      }

      if (bearerToken) {
        if (!apiKeyAllowed && !accessTokenAllowed && thirdPartyAccessTokenAllowed) {
          request.authMethod = AuthMethods["THIRD_PARTY_ACCESS_TOKEN"];
          const result = await this.validateThirdPartyAccessToken(bearerToken, request);
          if (result.success) {
            return this.success(this.getSuccessUser(result.data));
          }
        }

        if (apiKeyAllowed || accessTokenAllowed) {
          try {
            const requestOrigin = request.get("Origin");
            request.authMethod = isApiKey(bearerToken, this.config.get<string>("api.apiKeyPrefix") ?? "cal_")
              ? AuthMethods["API_KEY"]
              : AuthMethods["ACCESS_TOKEN"];
            return await this.authenticateBearerToken(bearerToken, request, requestOrigin);
          } catch (err) {
            // failed to validate access token, try to validate third party token
            if (thirdPartyAccessTokenAllowed && request.authMethod === AuthMethods["ACCESS_TOKEN"]) {
              request.authMethod = AuthMethods["THIRD_PARTY_ACCESS_TOKEN"];
              const result = await this.validateThirdPartyAccessToken(bearerToken, request);

              if (result.success) {
                return this.success(this.getSuccessUser(result.data));
              }
            }
            // token was not third party token, rethrow error from authenticateBearerToken
            if (err instanceof Error) {
              return this.error(err);
            }
          }
        }

        throw new UnauthorizedException(`ApiAuthStrategy - Invalid Bearer token`);
      }

      const nextAuthSecret = this.config.get("next.authSecret", { infer: true });
      const nextAuthToken = await getToken({ req: request, secret: nextAuthSecret });
      if (nextAuthToken && nextAuthAllowed) {
        request.authMethod = AuthMethods["NEXT_AUTH"];
        return await this.authenticateNextAuth(nextAuthToken, request);
      }

      const noAuthProvided = !oAuthClientId && !oAuthClientSecret && !bearerToken && !nextAuthToken;
      const onlyClientIdProvided = !!oAuthClientId && !oAuthClientSecret && !bearerToken && !nextAuthToken;
      const onlyClientSecretProvided =
        !oAuthClientId && !!oAuthClientSecret && !bearerToken && !nextAuthToken;

      if (noAuthProvided) {
        throw new UnauthorizedException(`ApiAuthStrategy - ${NO_AUTH_PROVIDED_MESSAGE}`);
      }

      if (onlyClientIdProvided) {
        throw new UnauthorizedException(`ApiAuthStrategy - ${ONLY_CLIENT_ID_PROVIDED_MESSAGE}`);
      }

      if (onlyClientSecretProvided) {
        throw new UnauthorizedException(`ApiAuthStrategy - ${ONLY_CLIENT_SECRET_PROVIDED_MESSAGE}`);
      }

      throw new UnauthorizedException(
        `ApiAuthStrategy - Invalid authentication method. Please provide one of the allowed methods: ${
          allowedMethods && allowedMethods.length > 0 ? allowedMethods.join(", ") : "Any supported method"
        }`
      );
    } catch (err) {
      if (err instanceof Error) {
        return this.error(err);
      }
      return this.error(
        new InternalServerErrorException(
          "ApiAuthStrategy - An error occurred while authenticating the request"
        )
      );
    }
  }

  async authenticateNextAuth(token: { email?: string | null }, request: ApiAuthGuardRequest) {
    const user = await this.nextAuthStrategy(token, request);
    return this.success(this.getSuccessUser(user));
  }

  getSuccessUser(user: UserWithProfile): ApiAuthGuardUser {
    return {
      ...user,
      isSystemAdmin: user.role === "ADMIN",
    };
  }

  async authenticateOAuthClient(
    oAuthClientId: string,
    oAuthClientSecret: string,
    request: ApiAuthGuardRequest
  ) {
    const user = await this.oAuthClientStrategy(oAuthClientId, oAuthClientSecret, request);
    return this.success(this.getSuccessUser(user));
  }

  async oAuthClientStrategy(oAuthClientId: string, oAuthClientSecret: string, request: ApiAuthGuardRequest) {
    const client = await this.oauthRepository.getOAuthClient(oAuthClientId);

    if (!client) {
      throw new UnauthorizedException(
        `ApiAuthStrategy - oAuth client - Client with ID ${oAuthClientId} not found`
      );
    }

    if (client.secret !== oAuthClientSecret) {
      throw new UnauthorizedException("ApiAuthStrategy - oAuth client - Invalid client secret");
    }

    const platformCreatorId =
      (await this.membershipsRepository.findPlatformOwnerUserId(client.organizationId)) ||
      (await this.membershipsRepository.findPlatformAdminUserId(client.organizationId));

    if (!platformCreatorId) {
      throw new UnauthorizedException(
        "ApiAuthStrategy - oAuth client - No owner ID found for this OAuth client"
      );
    }

    const user = await this.userRepository.findByIdWithProfile(platformCreatorId);

    if (!user) {
      throw new UnauthorizedException(
        "ApiAuthStrategy - oAuth client - No user associated with the provided OAuth client"
      );
    }

    request.organizationId = client.organizationId;

    return user;
  }

  async authenticateBearerToken(
    authString: string,
    request: ApiAuthGuardRequest,
    requestOrigin: string | undefined
  ) {
    try {
      const user = isApiKey(authString, this.config.get<string>("api.apiKeyPrefix") ?? "cal_")
        ? await this.apiKeyStrategy(authString, request)
        : await this.accessTokenStrategy(authString, request, requestOrigin);

      if (!user) {
        throw new UnauthorizedException(
          "ApiAuthStrategy - bearer token - No user associated with the provided token"
        );
      }

      return this.success(this.getSuccessUser(user));
    } catch (err) {
      if (err instanceof Error) {
        throw err;
      }
      throw new InternalServerErrorException("An error occurred while authenticating the request");
    }
  }

  async apiKeyStrategy(apiKey: string, request: ApiAuthGuardRequest) {
    const strippedApiKey = stripApiKey(apiKey, this.config.get<string>("api.keyPrefix"));
    const apiKeyHash = sha256Hash(strippedApiKey);
    const keyData = await this.apiKeyRepository.getApiKeyFromHash(apiKeyHash);
    if (!keyData) {
      throw new UnauthorizedException("ApiAuthStrategy - api key - Your api key is not valid");
    }

    const isKeyExpired = keyData.expiresAt && new Date() > keyData.expiresAt;
    if (isKeyExpired) {
      throw new UnauthorizedException("ApiAuthStrategy - api key - Your api key is expired");
    }

    const apiKeyOwnerId = keyData.userId;
    if (!apiKeyOwnerId) {
      throw new UnauthorizedException("ApiAuthStrategy - api key - No user tied to this apiKey");
    }

    const user: UserWithProfile | null = await this.userRepository.findByIdWithProfile(apiKeyOwnerId);
    request.organizationId = keyData.teamId;

    return user;
  }

  async accessTokenStrategy(accessToken: string, request: ApiAuthGuardRequest, origin?: string) {
    const accessTokenValid = await this.oauthFlowService.validateAccessToken(accessToken);
    if (!accessTokenValid) {
      throw new UnauthorizedException(`ApiAuthStrategy - access token - ${INVALID_ACCESS_TOKEN}`);
    }

    const client = await this.tokensRepository.getAccessTokenClient(accessToken);
    if (!client) {
      throw new UnauthorizedException(
        "ApiAuthStrategy - access token - OAuth client not found given the access token"
      );
    }

    if (origin && !isOriginAllowed(origin, client.redirectUris)) {
      throw new UnauthorizedException(
        `ApiAuthStrategy - access token - Invalid request origin - please open https://app.cal.com/settings/platform and add the origin '${origin}' to the 'Redirect uris' of your OAuth client with ID '${client.id}'`
      );
    }

    const ownerId = await this.tokensRepository.getAccessTokenOwnerId(accessToken);

    if (!ownerId) {
      throw new UnauthorizedException(
        `ApiAuthStrategy - access token - ${INVALID_ACCESS_TOKEN}. No owner found for this access token.`
      );
    }

    const user: UserWithProfile | null = await this.userRepository.findByIdWithProfile(ownerId);
    if (!user) {
      throw new UnauthorizedException(
        "ApiAuthStrategy - access token - User associated with the access token not found."
      );
    }

    const organizationId = this.usersService.getUserMainOrgId(user) as number;
    request.organizationId = organizationId;

    return user;
  }

  async nextAuthStrategy(token: { email?: string | null }, request: ApiAuthGuardRequest) {
    if (!token.email) {
      throw new UnauthorizedException(
        "ApiAuthStrategy - next auth - Email not found in the authentication token."
      );
    }

    const user = await this.userRepository.findByEmailWithProfile(token.email);
    if (!user) {
      throw new UnauthorizedException(
        "ApiAuthStrategy - next auth - User associated with the authentication token email not found."
      );
    }
    const organizationId = this.usersService.getUserMainOrgId(user) as number;
    request.organizationId = organizationId;

    return user;
  }

  async validateThirdPartyAccessToken(
    token: string,
    request: ApiAuthGuardRequest
  ): Promise<{ success: true; data: UserWithProfile } | { success: false }> {
    const decodedToken = this.tokensService.getDecodedThirdPartyAccessToken(token);
    if (!decodedToken) {
      return { success: false };
    }

    let user: UserWithProfile | null = null;
    let organizationId: number | null = null;

    if (decodedToken.userId) {
      user = await this.userRepository.findByIdWithProfile(decodedToken.userId);
      if (user) {
        organizationId = this.usersService.getUserMainOrgId(user) as number;
      }
    } else if (decodedToken.teamId) {
      const teamOwner = await this.userRepository.findOwnerByTeamIdWithProfile(decodedToken.teamId);
      if (!teamOwner) {
        throw new UnauthorizedException(
          "ApiAuthStrategy - third-party token - No owner found for the associated team."
        );
      }
      user = teamOwner;
      organizationId =
        teamOwner.profiles?.find((p) => p.organizationId === decodedToken.teamId)?.organizationId ?? null;
    }

    if (!user) {
      throw new UnauthorizedException(
        "ApiAuthStrategy - third-party token - No user or team owner associated with the token."
      );
    }

    request.organizationId = organizationId;
    return { success: true, data: user };
  }
}
