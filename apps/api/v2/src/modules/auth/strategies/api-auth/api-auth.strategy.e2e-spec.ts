import { X_CAL_CLIENT_ID, X_CAL_SECRET_KEY } from "@calcom/platform-constants";
import type { PlatformOAuthClient, Team, User } from "@calcom/prisma/client";
import { ExecutionContext, HttpException, UnauthorizedException } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtService as NestJwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import { createRequest } from "node-mocks-http";
import { ApiKeysRepositoryFixture } from "test/fixtures/repository/api-keys.repository.fixture";
import { MembershipRepositoryFixture } from "test/fixtures/repository/membership.repository.fixture";
import { OAuthClientRepositoryFixture } from "test/fixtures/repository/oauth-client.repository.fixture";
import { ProfileRepositoryFixture } from "test/fixtures/repository/profiles.repository.fixture";
import { TeamRepositoryFixture } from "test/fixtures/repository/team.repository.fixture";
import { TokensRepositoryFixture } from "test/fixtures/repository/tokens.repository.fixture";
import { UserRepositoryFixture } from "test/fixtures/repository/users.repository.fixture";
import { MockedRedisService } from "test/mocks/mock-redis-service";
import { randomString } from "test/utils/randomString";
import {
  ApiAuthGuardRequest,
  ApiAuthStrategy,
  ONLY_CLIENT_ID_PROVIDED_MESSAGE,
  ONLY_CLIENT_SECRET_PROVIDED_MESSAGE,
} from "./api-auth.strategy";
import appConfig from "@/config/app";
import { AuthMethods } from "@/lib/enums/auth-methods";
import { ApiKeysRepository } from "@/modules/api-keys/api-keys-repository";
import { DeploymentsRepository } from "@/modules/deployments/deployments.repository";
import { DeploymentsService } from "@/modules/deployments/deployments.service";
import { JwtService } from "@/modules/jwt/jwt.service";
import { MembershipsModule } from "@/modules/memberships/memberships.module";
import { OAuthClientRepository } from "@/modules/oauth-clients/oauth-client.repository";
import { OAuthFlowService } from "@/modules/oauth-clients/services/oauth-flow.service";
import { PrismaReadService } from "@/modules/prisma/prisma-read.service";
import { PrismaWriteService } from "@/modules/prisma/prisma-write.service";
import { ProfilesModule } from "@/modules/profiles/profiles.module";
import { TokensModule } from "@/modules/tokens/tokens.module";
import { UsersService } from "@/modules/users/services/users.service";
import { UsersRepository } from "@/modules/users/users.repository";

describe("ApiAuthStrategy", () => {
  let strategy: ApiAuthStrategy;
  let userRepositoryFixture: UserRepositoryFixture;
  let tokensRepositoryFixture: TokensRepositoryFixture;
  let teamRepositoryFixture: TeamRepositoryFixture;
  let organization: Team;
  let organizationTwo: Team;
  let oAuthClient: PlatformOAuthClient;
  let oAuthClientTwo: PlatformOAuthClient;
  let apiKeysRepositoryFixture: ApiKeysRepositoryFixture;
  let oAuthClientRepositoryFixture: OAuthClientRepositoryFixture;
  let profilesRepositoryFixture: ProfileRepositoryFixture;
  let membershipRepositoryFixture: MembershipRepositoryFixture;

  const validApiKeyEmail = `api-auth-api-key-user-${randomString()}@api.com`;
  const validAccessTokenEmail = `api-auth-access-token-user-${randomString()}@api.com`;
  const validOAuthEmail = `api-auth-oauth-user-${randomString()}@api.com`;

  let validApiKeyUser: User;
  let validAccessTokenUser: User;
  let validOAuthUser: User;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [appConfig],
        }),
        ProfilesModule,
        TokensModule,
        MembershipsModule,
      ],
      providers: [
        MockedRedisService,
        ApiAuthStrategy,
        ConfigService,
        OAuthFlowService,
        UsersRepository,
        UsersService,
        ApiKeysRepository,
        DeploymentsService,
        OAuthClientRepository,
        PrismaReadService,
        PrismaWriteService,
        JwtService,
        DeploymentsRepository,
        NestJwtService,
      ],
    }).compile();

    strategy = module.get<ApiAuthStrategy>(ApiAuthStrategy);
    userRepositoryFixture = new UserRepositoryFixture(module);
    tokensRepositoryFixture = new TokensRepositoryFixture(module);
    apiKeysRepositoryFixture = new ApiKeysRepositoryFixture(module);
    teamRepositoryFixture = new TeamRepositoryFixture(module);
    oAuthClientRepositoryFixture = new OAuthClientRepositoryFixture(module);
    profilesRepositoryFixture = new ProfileRepositoryFixture(module);
    membershipRepositoryFixture = new MembershipRepositoryFixture(module);
    organization = await teamRepositoryFixture.create({ name: `api-auth-organization-1-${randomString()}` });
    organizationTwo = await teamRepositoryFixture.create({
      name: `api-auth-organization-2-${randomString()}`,
    });

    validApiKeyUser = await userRepositoryFixture.create({
      email: validApiKeyEmail,
    });
    validAccessTokenUser = await userRepositoryFixture.create({
      email: validAccessTokenEmail,
    });

    validOAuthUser = await userRepositoryFixture.create({
      email: validOAuthEmail,
    });

    await profilesRepositoryFixture.create({
      uid: "asd-asd",
      username: validOAuthEmail,
      user: { connect: { id: validOAuthUser.id } },
      organization: { connect: { id: organization.id } },
    });

    await profilesRepositoryFixture.create({
      uid: "asd-asd",
      username: validOAuthEmail,
      user: { connect: { id: validOAuthUser.id } },
      organization: { connect: { id: organizationTwo.id } },
    });

    await membershipRepositoryFixture.create({
      user: { connect: { id: validOAuthUser.id } },
      team: { connect: { id: organization.id } },
      role: "OWNER",
      accepted: true,
    });

    await membershipRepositoryFixture.create({
      user: { connect: { id: validOAuthUser.id } },
      team: { connect: { id: organizationTwo.id } },
      role: "OWNER",
      accepted: true,
    });

    const data = {
      logo: "logo-url",
      name: "name",
      redirectUris: ["http://localhost:3000"],
      permissions: 32,
    };
    oAuthClient = await oAuthClientRepositoryFixture.create(organization.id, data, "secret");
    oAuthClientTwo = await oAuthClientRepositoryFixture.create(organizationTwo.id, data, "secret");
  });

  describe("authenticate with strategy", () => {
    it("should return user associated with valid access token", async () => {
      const { accessToken } = await tokensRepositoryFixture.createTokens(
        validAccessTokenUser.id,
        oAuthClient.id
      );

      const mockRequest = createRequest() as ApiAuthGuardRequest;
      mockRequest.authMethod = AuthMethods.ACCESS_TOKEN;
      mockRequest.organizationId = null;
      const user = await strategy.accessTokenStrategy(accessToken, mockRequest);
      expect(user).toBeDefined();
      expect(user?.id).toEqual(validAccessTokenUser.id);
    });

    it("should return user associated with valid api key and correctly set organizationId for org1", async () => {
      const now = new Date();
      now.setDate(now.getDate() + 1);
      const { keyString } = await apiKeysRepositoryFixture.createApiKey(
        validApiKeyUser.id,
        now,
        organization.id
      );

      const mockRequest = createRequest() as ApiAuthGuardRequest;
      mockRequest.authMethod = AuthMethods.API_KEY;
      mockRequest.organizationId = null;
      const user = await strategy.apiKeyStrategy(keyString, mockRequest);
      expect(user).toBeDefined();
      expect(user?.id).toEqual(validApiKeyUser.id);
      expect(mockRequest.organizationId).toEqual(organization.id);
    });

    it("should return user associated with valid api key and correctly set organizationId for org2", async () => {
      const now = new Date();
      now.setDate(now.getDate() + 1);
      const { keyString } = await apiKeysRepositoryFixture.createApiKey(
        validApiKeyUser.id,
        now,
        organizationTwo.id
      );

      const mockRequest = createRequest() as ApiAuthGuardRequest;
      mockRequest.authMethod = AuthMethods.API_KEY;
      mockRequest.organizationId = null;
      const user = await strategy.apiKeyStrategy(keyString, mockRequest);
      expect(user).toBeDefined();
      expect(user?.id).toEqual(validApiKeyUser.id);
      expect(mockRequest.organizationId).toEqual(organizationTwo.id);
    });

    it("should throw UnauthorizedException for an api key that expired seconds ago", async () => {
      const expiredAt = new Date(Date.now() - 1000);
      const { keyString } = await apiKeysRepositoryFixture.createApiKey(
        validApiKeyUser.id,
        expiredAt,
        organization.id
      );

      const mockRequest = createRequest() as ApiAuthGuardRequest;
      mockRequest.authMethod = AuthMethods.API_KEY;
      mockRequest.organizationId = null;

      await expect(strategy.apiKeyStrategy(keyString, mockRequest)).rejects.toThrow(UnauthorizedException);
    });

    it("should return user associated with valid OAuth client", async () => {
      const mockRequest = createRequest() as ApiAuthGuardRequest;
      mockRequest.authMethod = AuthMethods.OAUTH_CLIENT;
      mockRequest.organizationId = null;
      const user = await strategy.oAuthClientStrategy(oAuthClient.id, oAuthClient.secret, mockRequest);
      expect(user).toBeDefined();
      expect(user.id).toEqual(validOAuthUser.id);
      expect(mockRequest.organizationId).toEqual(organization.id);
    });

    it("should return user associated with valid OAuth client for org2", async () => {
      const mockRequest = createRequest() as ApiAuthGuardRequest;
      mockRequest.authMethod = AuthMethods.OAUTH_CLIENT;
      mockRequest.organizationId = null;
      const user = await strategy.oAuthClientStrategy(oAuthClientTwo.id, oAuthClientTwo.secret, mockRequest);
      expect(user).toBeDefined();
      expect(user.id).toEqual(validOAuthUser.id);
      expect(mockRequest.organizationId).toEqual(organizationTwo.id);
    });

    it("should throw 401 if api key is invalid", async () => {
      const context: ExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: `Bearer cal_test_}`,
            },
            get: (key: string) =>
              ({ Authorization: `Bearer cal_test_badkey1234`, origin: "http://localhost:3000" })[key],
          }),
        }),
      } as ExecutionContext;
      const request = context.switchToHttp().getRequest();

      try {
        await strategy.authenticate(request);
      } catch (error) {
        if (error instanceof HttpException) {
          expect(error.getStatus()).toEqual(401);
        }
      }
    });

    it("should throw 401 if only OAuth ID is provided", async () => {
      const context: ExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              [X_CAL_CLIENT_ID]: `${oAuthClient.id}gibberish`,
            },
            get: (key: string) => ({ origin: "http://localhost:3000" })[key],
          }),
        }),
      } as ExecutionContext;
      const request = context.switchToHttp().getRequest();

      try {
        await strategy.authenticate(request);
      } catch (error) {
        if (error instanceof HttpException) {
          expect(error.getStatus()).toEqual(401);
          expect(error.message).toContain(ONLY_CLIENT_ID_PROVIDED_MESSAGE);
        }
      }
    });

    it("should throw 401 if only OAuth Client Secret is provided", async () => {
      const context: ExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              [X_CAL_SECRET_KEY]: `${oAuthClient.secret}gibberish`,
            },
            get: (key: string) => ({ origin: "http://localhost:3000" })[key],
          }),
        }),
      } as ExecutionContext;
      const request = context.switchToHttp().getRequest();

      try {
        await strategy.authenticate(request);
      } catch (error) {
        if (error instanceof HttpException) {
          expect(error.getStatus()).toEqual(401);
          expect(error.message).toContain(ONLY_CLIENT_SECRET_PROVIDED_MESSAGE);
        }
      }
    });

    it("should throw 401 if OAuth ID is invalid", async () => {
      const context: ExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              [X_CAL_CLIENT_ID]: `${oAuthClient.id}gibberish`,
              [X_CAL_SECRET_KEY]: `secret`,
            },
            get: (key: string) =>
              ({ Authorization: `Bearer cal_test_badkey1234`, origin: "http://localhost:3000" })[key],
          }),
        }),
      } as ExecutionContext;
      const request = context.switchToHttp().getRequest();

      try {
        await strategy.authenticate(request);
      } catch (error) {
        if (error instanceof HttpException) {
          expect(error.getStatus()).toEqual(401);
        }
      }
    });

    it("should throw 401 if OAuth secret is invalid", async () => {
      const context: ExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              [X_CAL_CLIENT_ID]: `${oAuthClient.id}`,
              [X_CAL_SECRET_KEY]: `gibberish`,
            },
            get: (key: string) =>
              ({ Authorization: `Bearer cal_test_badkey1234`, origin: "http://localhost:3000" })[key],
          }),
        }),
      } as ExecutionContext;
      const request = context.switchToHttp().getRequest();

      try {
        await strategy.authenticate(request);
      } catch (error) {
        if (error instanceof HttpException) {
          expect(error.getStatus()).toEqual(401);
        }
      }
    });

    it("should throw 401 if request does not contain Bearer token nor OAuth client credentials", async () => {
      const context: ExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            get: (key: string) => ({ Authorization: ``, origin: "http://localhost:3000" })[key],
          }),
        }),
      } as ExecutionContext;
      const request = context.switchToHttp().getRequest();

      try {
        await strategy.authenticate(request);
      } catch (error) {
        if (error instanceof HttpException) {
          expect(error.getStatus()).toEqual(401);
        }
      }
    });
  });

  afterAll(async () => {
    await oAuthClientRepositoryFixture.delete(oAuthClient.id);
    await userRepositoryFixture.delete(validApiKeyUser.id);
    await userRepositoryFixture.delete(validAccessTokenUser.id);
    await userRepositoryFixture.delete(validOAuthUser.id);
    await teamRepositoryFixture.delete(organization.id);
    module.close();
  });
});
