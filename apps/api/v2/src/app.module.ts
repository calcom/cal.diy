import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import { BullModule } from "@nestjs/bull";
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { seconds, ThrottlerModule } from "@nestjs/throttler";
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup";
import { AppController } from "./app.controller";
import appConfig from "@/config/app";
import { CustomThrottlerGuard } from "@/lib/throttler-guard";
import { AppLoggerMiddleware } from "@/middleware/app.logger.middleware";
import { RedirectsMiddleware } from "@/middleware/app.redirects.middleware";
import { RewriterMiddleware } from "@/middleware/app.rewrites.middleware";
import { JsonBodyMiddleware } from "@/middleware/body/json.body.middleware";
import { RawBodyMiddleware } from "@/middleware/body/raw.body.middleware";
import { UrlencodedBodyMiddleware } from "@/middleware/body/urlencoded.body.middleware";
import { ResponseInterceptor } from "@/middleware/request-ids/request-id.interceptor";
import { RequestIdMiddleware } from "@/middleware/request-ids/request-id.middleware";
import { AuthModule } from "@/modules/auth/auth.module";
import { EndpointsModule } from "@/modules/endpoints.module";
import { JwtModule } from "@/modules/jwt/jwt.module";
import { PrismaModule } from "@/modules/prisma/prisma.module";
import { RedisModule } from "@/modules/redis/redis.module";
import { RedisService } from "@/modules/redis/redis.service";
import { VercelWebhookController } from "@/vercel-webhook.controller";

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      ignoreEnvFile: true,
      isGlobal: true,
      load: [appConfig],
    }),

    RedisModule,
    BullModule.forRoot({
      redis: `${process.env.REDIS_URL}${process.env.NODE_ENV === "production" ? "?tls=true" : ""}`,
    }),
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redisService: RedisService) => ({
        // note(Lauris): IMPORTANT: rate limiting is enforced by CustomThrottlerGuard, but we need to have at least one
        // entry in the throttlers array otherwise CustomThrottlerGuard is not invoked at all. If we specify only ThrottlerModule
        // without .forRootAsync then throttler options are not passed to CustomThrottlerGuard containing redis connection etc.
        // So we need to specify at least one dummy throttler here and CustomThrottlerGuard is actually handling the default and custom rate limits.
        throttlers: [
          {
            name: "dummy",
            ttl: seconds(60),
            limit: 120,
          },
        ],
        storage: new ThrottlerStorageRedisService(redisService.redis),
      }),
    }),
    PrismaModule,
    EndpointsModule,
    AuthModule,
    JwtModule,
  ],
  controllers: [AppController, VercelWebhookController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    {
      provide: ThrottlerStorageRedisService,
      useFactory: (redisService: RedisService) => {
        return new ThrottlerStorageRedisService(redisService.redis);
      },
      inject: [RedisService],
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RewriterMiddleware)
      .forRoutes("*")
      .apply(RedirectsMiddleware)
      .forRoutes("*")
      .apply(RawBodyMiddleware)
      .forRoutes(
        {
          path: "/api/v2/billing/webhook",
          method: RequestMethod.POST,
        },
        {
          path: "/v2/billing/webhook",
          method: RequestMethod.POST,
        },
        {
          path: "/v2/webhooks/vercel/deployment-promoted",
          method: RequestMethod.POST,
        }
      )
      .apply(UrlencodedBodyMiddleware)
      .forRoutes(
        {
          path: "/v2/auth/oauth2/token",
          method: RequestMethod.POST,
        },
        {
          path: "/api/v2/auth/oauth2/token",
          method: RequestMethod.POST,
        }
      )
      .apply(JsonBodyMiddleware)
      .forRoutes("*")
      .apply(RequestIdMiddleware)
      .forRoutes("*")
      .apply(AppLoggerMiddleware)
      .forRoutes("*");
  }
}
