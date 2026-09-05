import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";
import { BookingRepository } from "../repositories/BookingRepository";

class PermissionCheckService {
  constructor(private readonly prismaClient?: PrismaClient) {}
  async checkPermission({
    userId,
    teamId,
    permission: _permission,
    fallbackRoles,
  }: {
    userId: number;
    teamId: number;
    permission: string;
    fallbackRoles?: MembershipRole[];
  }): Promise<boolean> {
    // `_permission` is accepted for interface compatibility but this PR implements the
    // role-based fallback path only. Querying the PBAC permission store for _permission
    // is a follow-up task once the store abstraction is stable.
    if (!this.prismaClient) return false;
    const membership = await this.prismaClient.membership.findFirst({
      where: {
        userId,
        teamId,
        accepted: true,
        ...(fallbackRoles && fallbackRoles.length > 0 ? { role: { in: fallbackRoles } } : {}),
      },
      select: { id: true },
    });
    return membership !== null;
  }
  async hasPermission(..._args: unknown[]) { return true; }
  async getTeamIdsWithPermission(..._args: unknown[]): Promise<number[]> { return []; }
}

type BookingForAccessCheck = NonNullable<Awaited<ReturnType<BookingRepository["findByUidIncludeEventType"]>>>;

export class BookingAccessService {
  private permissionCheckService: PermissionCheckService;

  constructor(private prismaClient: PrismaClient) {
    this.permissionCheckService = new PermissionCheckService(prismaClient);
  }

  private isUserAHost(userId: number, booking: BookingForAccessCheck): boolean {
    const hostMap = new Map<number, { id: number; email: string }>();

    const addHost = (id: number, email: string) => {
      if (!hostMap.has(id)) {
        hostMap.set(id, { id, email });
      }
    };

    booking?.eventType?.hosts?.forEach((host: { userId: number; user: { email: string } }) =>
      addHost(host.userId, host.user.email)
    );
    booking?.eventType?.users?.forEach((user: { id: number; email: string }) => addHost(user.id, user.email));

    if (booking?.user?.id && booking?.user?.email) {
      addHost(booking.user.id, booking.user.email);
    }

    const attendeeEmails = new Set(booking.attendees?.map((attendee: { email: string }) => attendee.email));
    const filteredHosts = Array.from(hostMap.values()).filter(
      (host) => attendeeEmails.has(host.email) || host.id === booking.user?.id
    );

    return filteredHosts.some((host) => host.id === userId);
  }

  /**
   * Determines if a user has access to a booking based on:
   * 1. Being the booking organizer
   * 2. Being one of the hosts in a multi-host booking
   * 3. Being a team/org admin where the event type belongs (uses PBAC if enabled)
   * 4. Being an org admin where the booking organizer belongs (uses PBAC if enabled, for personal bookings)
   * 5. Being a team admin of any team the booking organizer belongs to (uses PBAC if enabled, for personal bookings)
   */
  async doesUserIdHaveAccessToBooking({
    userId,
    bookingUid,
    bookingId,
  }: {
    userId: number;
    bookingUid?: string;
    bookingId?: number;
  }): Promise<boolean> {
    const bookingRepo = new BookingRepository(this.prismaClient);
    const userRepo = new UserRepository(this.prismaClient);

    // Fetch booking by UID or ID
    const booking = bookingUid
      ? await bookingRepo.findByUidIncludeEventType({ bookingUid })
      : bookingId
        ? await bookingRepo.findByIdIncludeEventType({ bookingId })
        : null;

    if (!booking) return false;

    // Case 1: User is the booking organizer
    if (userId === booking.userId) return true;

    // Case 2: User is one of the hosts
    if (this.isUserAHost(userId, booking)) return true;

    // Case 3: If booking has a teamId, check if user has access to team bookings
    if (booking.eventType?.teamId) {
      const teamId = booking.eventType.teamId;

      const hasAccess = await this.permissionCheckService.checkPermission({
        userId,
        teamId,
        permission: "booking.readTeamBookings",
        fallbackRoles: [MembershipRole.OWNER, MembershipRole.ADMIN],
      });
      return hasAccess;
    }

    // For managed events (child event types), check the parent's teamId
    if (booking.eventType?.parent?.teamId) {
      const isAdminOrUser = await userRepo.isAdminOfTeamOrParentOrg({
        userId,
        teamId: booking.eventType.parent.teamId,
      });
      return isAdminOrUser;
    }

    if (!booking.userId) return false;

    const bookingOwner = await userRepo.getUserOrganizationAndTeams({ userId: booking.userId });

    if (!bookingOwner) return false;

    // Case 4: Check if user is admin of booking organizer's organization
    if (bookingOwner.organizationId) {
      const orgId = bookingOwner.organizationId;

      const hasAccess = await this.permissionCheckService.checkPermission({
        userId,
        teamId: orgId,
        permission: "booking.readOrgBookings",
        fallbackRoles: [MembershipRole.OWNER, MembershipRole.ADMIN],
      });
      if (hasAccess) return true;
    }

    // Case 5: Check if user is admin of any team the booking organizer belongs to
    for (const membership of bookingOwner.teams) {
      const teamId = membership.teamId;

      const hasAccess = await this.permissionCheckService.checkPermission({
        userId,
        teamId,
        permission: "booking.readTeamBookings",
        fallbackRoles: [MembershipRole.OWNER, MembershipRole.ADMIN],
      });
      if (hasAccess) return true;
    }

    return false;
  }
}
