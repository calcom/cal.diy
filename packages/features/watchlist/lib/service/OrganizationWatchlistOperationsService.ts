import type { PrismaBookingReportRepository } from "@calcom/features/bookingReport/repositories/PrismaBookingReportRepository";
import type { WatchlistRepository } from "@calcom/features/watchlist/lib/repository/WatchlistRepository";
import { BookingReportStatus, MembershipRole, WatchlistType } from "@calcom/prisma/enums";
import { WatchlistErrors } from "../errors/WatchlistErrors";
import { extractDomainFromEmail, normalizeEmail } from "../utils/normalization";
import type {
  AddReportsToWatchlistResult,
  CreateWatchlistEntryInput,
  CreateWatchlistEntryResult,
  DeleteWatchlistEntryInput,
  DeleteWatchlistEntryResult,
  WatchlistOperationsScope,
} from "./WatchlistOperationsService";
import { WatchlistOperationsService } from "./WatchlistOperationsService";
import { PermissionCheckService } from "@calcom/features/permissions/services/PermissionCheckService";

type PermissionString = string;

type Deps = {
  watchlistRepo: WatchlistRepository;
  bookingReportRepo: PrismaBookingReportRepository;
  permissionCheckService: PermissionCheckService;
  organizationId: number;
};

export class OrganizationWatchlistOperationsService extends WatchlistOperationsService {
  private readonly permissionCheckService: PermissionCheckService;
  private readonly organizationId: number;

  constructor(deps: Deps) {
    super(deps);
    this.permissionCheckService = deps.permissionCheckService;
    this.organizationId = deps.organizationId;
  }

  protected getScope(): WatchlistOperationsScope {
    return {
      organizationId: this.organizationId,
      isGlobal: false,
    };
  }

  private async checkPermission(userId: number, permission: PermissionString): Promise<void> {
    const hasPermission = await this.permissionCheckService.checkPermission({
      userId,
      teamId: this.organizationId,
      permission,
      fallbackRoles: [MembershipRole.OWNER, MembershipRole.ADMIN],
    });

    if (!hasPermission) {
      throw WatchlistErrors.permissionDenied(
        `You are not authorized to ${permission.split(".")[1]} watchlist entries`
      );
    }
  }

  async createWatchlistEntry(input: CreateWatchlistEntryInput): Promise<CreateWatchlistEntryResult> {
    await this.checkPermission(input.userId, "watchlist.create");
    return super.createWatchlistEntry(input);
  }

  async deleteWatchlistEntry(input: DeleteWatchlistEntryInput): Promise<DeleteWatchlistEntryResult> {
    await this.checkPermission(input.userId, "watchlist.delete");
    return super.deleteWatchlistEntry(input);
  }

  async addToWatchlistByEmail(input: {
    email: string;
    type: WatchlistType;
    description?: string;
    userId: number;
  }): Promise<AddReportsToWatchlistResult> {
    await this.checkPermission(input.userId, "watchlist.create");

    const scope = this.getScope();

    let watchlistValue: string;
    let reports: Array<{ id: string; bookerEmail: string; watchlistId: string | null }>;

    if (input.type === WatchlistType.EMAIL) {
      watchlistValue = normalizeEmail(input.email);
      reports = await this.deps.bookingReportRepo.findPendingReportsByEmail({
        email: watchlistValue,
        organizationId: this.organizationId,
      });
    } else {
      watchlistValue = extractDomainFromEmail(input.email);
      reports = await this.deps.bookingReportRepo.findPendingReportsByDomain({
        domain: watchlistValue,
        organizationId: this.organizationId,
      });
    }

    const { watchlistEntry } = await this.deps.watchlistRepo.createEntryFromReport({
      type: input.type,
      value: watchlistValue,
      organizationId: scope.organizationId,
      isGlobal: scope.isGlobal,
      userId: input.userId,
      description: input.description,
    });

    if (reports.length > 0) {
      await this.deps.bookingReportRepo.bulkLinkWatchlistWithStatus({
        links: reports.map((r) => ({ reportId: r.id, watchlistId: watchlistEntry.id })),
        status: BookingReportStatus.BLOCKED,
      });
    }

    return {
      success: true,
      message: `Successfully added ${input.type === WatchlistType.EMAIL ? "email" : "domain"} to blocklist`,
      addedCount: reports.length,
      skippedCount: 0,
      results: reports.map((r) => ({ reportId: r.id, watchlistId: watchlistEntry.id })),
    };
  }

  async dismissReportByEmail(input: {
    email: string;
    userId: number;
  }): Promise<{ success: boolean; count: number }> {
    await this.checkPermission(input.userId, "watchlist.update");

    const normalizedEmail = normalizeEmail(input.email);
    const result = await this.deps.bookingReportRepo.dismissReportsByEmail({
      email: normalizedEmail,
      status: BookingReportStatus.DISMISSED,
      organizationId: this.organizationId,
    });

    if (result.count === 0) {
      throw WatchlistErrors.notFound("No pending reports found for this email");
    }

    return { success: true, count: result.count };
  }
}
