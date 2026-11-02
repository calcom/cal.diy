import "@tanstack/react-start/server-only";

import type { Database } from "@calcom/db/database";
import type { JsonValue } from "@calcom/db/ids";
import { account, user } from "@calcom/db/schema";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";

const appearanceColumns = {
  theme: user.theme,
  brandColor: user.brandColor,
  darkBrandColor: user.darkBrandColor,
  hideBranding: user.hideBranding,
};

/** What booking pages and slot calculations need to know about a host. */
const hostColumns = {
  id: user.id,
  name: user.name,
  username: user.username,
  email: user.email,
  timeZone: user.timeZone,
  locale: user.locale,
  defaultScheduleId: user.defaultScheduleId,
  avatarUrl: user.avatarUrl,
  bio: user.bio,
  weekStart: user.weekStart,
  allowSEOIndexing: user.allowSEOIndexing,
  allowDynamicBooking: user.allowDynamicBooking,
  requiresBookerEmailVerification: user.requiresBookerEmailVerification,
  metadata: user.metadata,
  ...appearanceColumns,
};

export class UserRepository {
  constructor(private readonly db: Database) {}

  /** Usernames are unique per organization; users outside an organization share one namespace. */
  async findTakenUsernamesWithoutOrganization(usernames: string[]): Promise<Set<string>> {
    if (!usernames.length) return new Set();
    const rows = await this.db
      .select({ username: user.username })
      .from(user)
      .where(and(inArray(user.username, usernames), isNull(user.organizationId)));
    return new Set(rows.flatMap((row) => (row.username ? [row.username] : [])));
  }

  async hasAny(): Promise<boolean> {
    const [row] = await this.db.select({ id: user.id }).from(user).limit(1);
    return Boolean(row);
  }

  /** Swaps one stored password hash for another; matching on the old hash makes a concurrent change win. */
  async replacePasswordHash(oldHash: string, newHash: string): Promise<void> {
    await this.db
      .update(account)
      .set({ password: newHash })
      .where(and(eq(account.providerId, "credential"), eq(account.password, oldHash)));
  }

  async findDefaultScheduleId(userId: number): Promise<number | null> {
    const [found] = await this.db
      .select({ defaultScheduleId: user.defaultScheduleId })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return found?.defaultScheduleId ?? null;
  }

  async updateDefaultScheduleId(userId: number, scheduleId: number | null): Promise<void> {
    await this.db.update(user).set({ defaultScheduleId: scheduleId }).where(eq(user.id, userId));
  }

  /** Users outside an organization, which is every user until organizations are ported. */
  async findByUsername(username: string) {
    const [found] = await this.db
      .select(hostColumns)
      .from(user)
      .where(and(eq(user.username, username.toLowerCase()), isNull(user.organizationId)))
      .limit(1);
    return found ?? null;
  }

  /** Hosts by id, in the order asked for; ids that don't exist are left out. */
  async findHostsByIds(ids: number[]) {
    if (!ids.length) return [];
    const rows = await this.db.select(hostColumns).from(user).where(inArray(user.id, ids));
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  async findProfile(userId: number) {
    const [found] = await this.db
      .select({
        name: user.name,
        email: user.email,
        username: user.username,
        timeZone: user.timeZone,
        locale: user.locale,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return found ?? null;
  }

  async findGeneralSettings(userId: number) {
    const [found] = await this.db
      .select({
        timeFormat: user.timeFormat,
        weekStart: user.weekStart,
        allowDynamicBooking: user.allowDynamicBooking,
        allowSEOIndexing: user.allowSEOIndexing,
        requiresBookerEmailVerification: user.requiresBookerEmailVerification,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return found ?? null;
  }

  async updateGeneralSettings(
    userId: number,
    data: {
      timeFormat: number;
      weekStart: string;
      allowDynamicBooking: boolean;
      allowSEOIndexing: boolean;
      requiresBookerEmailVerification: boolean;
    }
  ): Promise<void> {
    await this.db.update(user).set(data).where(eq(user.id, userId));
  }

  async findAppearance(userId: number) {
    const [found] = await this.db
      .select({ ...appearanceColumns, appTheme: user.appTheme, metadata: user.metadata })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return found ?? null;
  }

  async updateAppearance(
    userId: number,
    data: {
      theme: string | null;
      appTheme: string | null;
      brandColor: string;
      darkBrandColor: string;
      hideBranding: boolean;
      metadata: { [key: string]: JsonValue };
    }
  ): Promise<void> {
    await this.db.update(user).set(data).where(eq(user.id, userId));
  }

  /**
   * What the security settings need: whether a password exists, which identity provider the user
   * signs in with otherwise, and the 2FA and verification state.
   */
  async findSecurity(userId: number) {
    const [found] = await this.db
      .select({
        email: user.email,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        passwordAccountId: account.id,
      })
      .from(user)
      .leftJoin(account, and(eq(account.userId, user.id), eq(account.providerId, "credential")))
      .where(eq(user.id, userId))
      .limit(1);
    if (!found) return null;
    const { passwordAccountId, ...rest } = found;
    const [identityAccount] = await this.db
      .select({ providerId: account.providerId })
      .from(account)
      .where(and(eq(account.userId, userId), ne(account.providerId, "credential")))
      .orderBy(account.id)
      .limit(1);
    return {
      ...rest,
      hasPassword: passwordAccountId !== null,
      identityProviderId: identityAccount?.providerId ?? null,
    };
  }

  async updateProfile(
    userId: number,
    data: { name: string; timeZone: string; locale: string }
  ): Promise<void> {
    await this.db.update(user).set(data).where(eq(user.id, userId));
  }

  async findByEmail(email: string) {
    const [found] = await this.db
      .select({ id: user.id, email: user.email, username: user.username })
      .from(user)
      .where(eq(user.email, email.toLowerCase()))
      .limit(1);
    return found ?? null;
  }

  async findMetadata(userId: number): Promise<unknown> {
    const [found] = await this.db
      .select({ metadata: user.metadata })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return found?.metadata ?? null;
  }

  async updateMetadata(userId: number, metadata: { [key: string]: JsonValue }): Promise<void> {
    await this.db.update(user).set({ metadata }).where(eq(user.id, userId));
  }
}

export { appearanceColumns };
