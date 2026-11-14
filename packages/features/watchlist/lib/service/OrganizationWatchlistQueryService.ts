import type { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import type { WatchlistRepository } from "@calcom/features/watchlist/lib/repository/WatchlistRepository";
import { MembershipRole, type WatchlistSource, type WatchlistType } from "@calcom/prisma/enums";
import { WatchlistErrors } from "../errors/WatchlistErrors";
import { PermissionCheckService } from "@calcom/features/permissions/services/PermissionCheckService";

export interface ListWatchlistEntriesInput {
  organizationId: number;
  userId: number;
  limit: number;
  offset: number;
  searchTerm?: string;
  filters?: {
    type?: WatchlistType;
    source?: WatchlistSource;
  };
}

export interface GetWatchlistEntryDetailsInput {
  organizationId: number;
  userId: number;
  entryId: string;
}

type Deps = {
  watchlistRepo: WatchlistRepository;
  userRepo: UserRepository;
  permissionCheckService: PermissionCheckService;
};

export class OrganizationWatchlistQueryService {
  constructor(private readonly deps: Deps) {}

  private async checkReadPermission(userId: number, organizationId: number): Promise<void> {
    const hasPermission = await this.deps.permissionCheckService.checkPermission({
      userId,
      teamId: organizationId,
      permission: "watchlist.read",
      fallbackRoles: [MembershipRole.OWNER, MembershipRole.ADMIN],
    });

    if (!hasPermission) {
      throw WatchlistErrors.permissionDenied("You are not authorized to view watchlist entries");
    }
  }

  async listWatchlistEntries(input: ListWatchlistEntriesInput) {
    await this.checkReadPermission(input.userId, input.organizationId);

    const result = await this.deps.watchlistRepo.findOrgAndGlobalEntries({
      organizationId: input.organizationId,
      limit: input.limit,
      offset: input.offset,
      searchTerm: input.searchTerm,
      filters: input.filters,
    });

    const userIds = result.rows
      .map((entry) => entry.latestAudit?.changedByUserId)
      .filter((id): id is number => id !== null && id !== undefined);

    const uniqueUserIds = Array.from(new Set(userIds));

    const users = uniqueUserIds.length > 0 ? await this.deps.userRepo.findUsersByIds(uniqueUserIds) : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    const rowsWithCreators = result.rows.map((entry) => {
      if (entry.latestAudit?.changedByUserId) {
        const changedByUser = userMap.get(entry.latestAudit.changedByUserId);
        return {
          ...entry,
          latestAudit: {
            ...entry.latestAudit,
            changedByUser,
          },
        };
      }
      return entry;
    });

    return {
      rows: rowsWithCreators,
      meta: result.meta,
    };
  }

  async getWatchlistEntryDetails(input: GetWatchlistEntryDetailsInput) {
    await this.checkReadPermission(input.userId, input.organizationId);

    const result = await this.deps.watchlistRepo.findEntryWithAuditAndReports(input.entryId);

    if (!result.entry) {
      throw WatchlistErrors.notFound("Blocklist entry not found");
    }

    const isOrgEntry = result.entry.organizationId === input.organizationId;
    const isGlobalEntry = result.entry.isGlobal && result.entry.organizationId === null;

    if (!isOrgEntry && !isGlobalEntry) {
      throw WatchlistErrors.permissionDenied(
        "You can only view blocklist entries from your organization or global entries"
      );
    }

    const userIds = result.auditHistory
      .map((audit) => audit.changedByUserId)
      .filter((id): id is number => id !== null && id !== undefined);

    const uniqueUserIds = Array.from(new Set(userIds));

    const users = uniqueUserIds.length > 0 ? await this.deps.userRepo.findUsersByIds(uniqueUserIds) : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    const auditHistoryWithUsers = result.auditHistory.map((audit) => ({
      ...audit,
      changedByUser: audit.changedByUserId ? userMap.get(audit.changedByUserId) : undefined,
    }));

    return {
      entry: result.entry,
      auditHistory: auditHistoryWithUsers,
      isReadOnly: isGlobalEntry,
    };
  }
}
