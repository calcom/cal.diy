import { PrismaBookingReportRepository } from "@calcom/features/bookingReport/repositories/PrismaBookingReportRepository";
import { moduleLoader as prismaModuleLoader } from "@calcom/features/di/modules/Prisma";
import { moduleLoader as loggerModuleLoader } from "@calcom/features/di/shared/services/logger.service";
import { taskerServiceModule } from "@calcom/features/di/shared/services/tasker.service";
import { SHARED_TOKENS } from "@calcom/features/di/shared/shared.tokens";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import {
  createWatchlistFeature,
  type WatchlistFeature,
} from "@calcom/features/watchlist/lib/facade/WatchlistFeature";
import type {
  IGlobalWatchlistRepository,
  IOrganizationWatchlistRepository,
} from "@calcom/features/watchlist/lib/interface/IWatchlistRepositories";
import { WatchlistRepository } from "@calcom/features/watchlist/lib/repository/WatchlistRepository";
import { AdminWatchlistOperationsService } from "@calcom/features/watchlist/lib/service/AdminWatchlistOperationsService";
import { AdminWatchlistQueryService } from "@calcom/features/watchlist/lib/service/AdminWatchlistQueryService";
import type { GlobalBlockingService } from "@calcom/features/watchlist/lib/service/GlobalBlockingService";
import type { OrganizationBlockingService } from "@calcom/features/watchlist/lib/service/OrganizationBlockingService";
import { OrganizationWatchlistOperationsService } from "@calcom/features/watchlist/lib/service/OrganizationWatchlistOperationsService";
import { OrganizationWatchlistQueryService } from "@calcom/features/watchlist/lib/service/OrganizationWatchlistQueryService";
import type { WatchlistAuditService } from "@calcom/features/watchlist/lib/service/WatchlistAuditService";
import type { WatchlistService } from "@calcom/features/watchlist/lib/service/WatchlistService";
import { prisma } from "@calcom/prisma";
import { createContainer } from "@evyweb/ioctopus";
import { watchlistModule } from "../modules/Watchlist.module";
import { WATCHLIST_DI_TOKENS } from "../Watchlist.tokens";
import { PermissionCheckService } from "@calcom/features/permissions/services/PermissionCheckService";

export const watchlistContainer= createContainer();

prismaModuleLoader.loadModule(watchlistContainer);
loggerModuleLoader.loadModule(watchlistContainer);

watchlistContainer.load(SHARED_TOKENS.TASKER, taskerServiceModule);

watchlistContainer.load(WATCHLIST_DI_TOKENS.GLOBAL_WATCHLIST_REPOSITORY, watchlistModule);
watchlistContainer.load(WATCHLIST_DI_TOKENS.ORGANIZATION_WATCHLIST_REPOSITORY, watchlistModule);
watchlistContainer.load(WATCHLIST_DI_TOKENS.AUDIT_REPOSITORY, watchlistModule);
watchlistContainer.load(WATCHLIST_DI_TOKENS.WATCHLIST_SERVICE, watchlistModule);
watchlistContainer.load(WATCHLIST_DI_TOKENS.AUDIT_SERVICE, watchlistModule);
watchlistContainer.load(WATCHLIST_DI_TOKENS.GLOBAL_BLOCKING_SERVICE, watchlistModule);
watchlistContainer.load(WATCHLIST_DI_TOKENS.ORGANIZATION_BLOCKING_SERVICE, watchlistModule);

export function getWatchlistService() {
  return watchlistContainer.get<WatchlistService>(WATCHLIST_DI_TOKENS.WATCHLIST_SERVICE);
}

export function getGlobalBlockingService() {
  return watchlistContainer.get<GlobalBlockingService>(WATCHLIST_DI_TOKENS.GLOBAL_BLOCKING_SERVICE);
}

export function getOrganizationBlockingService() {
  return watchlistContainer.get<OrganizationBlockingService>(
    WATCHLIST_DI_TOKENS.ORGANIZATION_BLOCKING_SERVICE
  );
}

export function getAuditService() {
  return watchlistContainer.get<WatchlistAuditService>(WATCHLIST_DI_TOKENS.AUDIT_SERVICE);
}

export function getGlobalWatchlistRepository() {
  return watchlistContainer.get<IGlobalWatchlistRepository>(WATCHLIST_DI_TOKENS.GLOBAL_WATCHLIST_REPOSITORY);
}

export function getOrganizationWatchlistRepository() {
  return watchlistContainer.get<IOrganizationWatchlistRepository>(
    WATCHLIST_DI_TOKENS.ORGANIZATION_WATCHLIST_REPOSITORY
  );
}

export async function getWatchlistFeature(): Promise<WatchlistFeature> {
  return createWatchlistFeature(watchlistContainer);
}

export function getAdminWatchlistOperationsService(): AdminWatchlistOperationsService {
  const watchlistRepo = new WatchlistRepository(prisma);
  const bookingReportRepo = new PrismaBookingReportRepository(prisma);
  const userRepo = new UserRepository(prisma);

  return new AdminWatchlistOperationsService({
    watchlistRepo,
    bookingReportRepo,
    userRepo,
  });
}

export function getOrganizationWatchlistOperationsService(
  organizationId: number
): OrganizationWatchlistOperationsService {
  const watchlistRepo = new WatchlistRepository(prisma);
  const bookingReportRepo = new PrismaBookingReportRepository(prisma);
  const permissionCheckService = new PermissionCheckService();

  return new OrganizationWatchlistOperationsService({
    watchlistRepo,
    bookingReportRepo,
    permissionCheckService,
    organizationId,
  });
}

export function getAdminWatchlistQueryService(): AdminWatchlistQueryService {
  const watchlistRepo = new WatchlistRepository(prisma);
  const bookingReportRepo = new PrismaBookingReportRepository(prisma);
  const userRepo = new UserRepository(prisma);

  return new AdminWatchlistQueryService({
    watchlistRepo,
    bookingReportRepo,
    userRepo,
    prisma,
  });
}

export function getOrganizationWatchlistQueryService(): OrganizationWatchlistQueryService {
  const watchlistRepo = new WatchlistRepository(prisma);
  const userRepo = new UserRepository(prisma);
  const permissionCheckService = new PermissionCheckService();

  return new OrganizationWatchlistQueryService({
    watchlistRepo,
    userRepo,
    permissionCheckService,
  });
}
