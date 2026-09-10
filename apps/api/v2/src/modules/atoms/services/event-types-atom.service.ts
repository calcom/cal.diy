import type { TeamQuery } from "@calcom/platform-libraries";
import { checkAdminOrOwner, getClientSecretFromPayment } from "@calcom/platform-libraries";
import type {
  App,
  CredentialDataWithTeamName,
  CredentialOwner,
  CredentialPayload,
  LocationOption,
  TDependencyData,
} from "@calcom/platform-libraries/app-store";
import {
  enrichUserWithDelegationConferencingCredentialsWithoutOrgId,
  getAppFromSlug,
  getEnabledAppsFromCredentials,
} from "@calcom/platform-libraries/app-store";
import {
  bulkUpdateEventsToDefaultLocation,
  EventTypeMetaDataSchema,
  getBulkUserEventTypes,
  getEventTypeById,
  getPublicEvent,
  type PublicEventType,
  TUpdateEventTypeInputSchema,
  updateEventType,
} from "@calcom/platform-libraries/event-types";
import type { PrismaClient } from "@calcom/prisma";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EventTypesService_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/services/event-types.service";
import { systemBeforeFieldEmail } from "@/platform/event-types/event-types_2024_06_14/transformers";
import { AtomsRepository } from "@/modules/atoms/atoms.repository";
import { CredentialsRepository } from "@/modules/credentials/credentials.repository";
import { MembershipsRepository } from "@/modules/memberships/memberships.repository";
import { PrismaReadService } from "@/modules/prisma/prisma-read.service";
import { PrismaWriteService } from "@/modules/prisma/prisma-write.service";
import { UsersService } from "@/modules/users/services/users.service";
import { UsersRepository, UserWithProfile } from "@/modules/users/users.repository";

type EnabledAppType = App & {
  credential: CredentialDataWithTeamName;
  credentials: CredentialDataWithTeamName[];
  locationOption: LocationOption | null;
};

/**
 * Normalizes a period date to UTC midnight.
 * Atoms receives JSON where dates are strings (e.g., "2024-01-20T00:00:00.000Z" or "2024-01-20"),
 * but TypeScript types them as Date. This function handles both cases.
 * We extract the date part (YYYY-MM-DD) to avoid timezone shifts.
 */
function normalizePeriodDate(date: Date | string | null | undefined): Date | null | undefined {
  if (date === undefined) return undefined;
  if (date === null) return null;

  // Handle both string (from JSON) and Date object (if already parsed)
  const dateStr = typeof date === "string" ? date : date.toISOString();

  // Extract the date part (first 10 chars: YYYY-MM-DD) to avoid timezone shifts
  // e.g., "2024-01-20T00:00:00.000+04:00" -> "2024-01-20" -> UTC midnight Jan 20
  const dateOnly = dateStr.slice(0, 10);
  return new Date(dateOnly);
}

@Injectable()
export class EventTypesAtomService {
  constructor(
    private readonly membershipsRepository: MembershipsRepository,
    private readonly credentialsRepository: CredentialsRepository,
    private readonly atomsRepository: AtomsRepository,
    private readonly usersService: UsersService,
    private readonly dbWrite: PrismaWriteService,
    private readonly dbRead: PrismaReadService,
    private readonly eventTypeService: EventTypesService_2024_06_14,
    private readonly usersRepository: UsersRepository
  ) {}

  private async getTeamSlug(teamId: number): Promise<string> {
    const team = await this.dbRead.prisma.team.findUnique({
      where: { id: teamId },
      select: { slug: true },
    });

    if (!team?.slug) {
      throw new NotFoundException(`Team with id ${teamId} not found`);
    }
    return team.slug;
  }

  async getUserEventType(user: UserWithProfile, eventTypeId: number) {
    const organizationId = this.usersService.getUserMainOrgId(user);

    const isUserOrganizationAdmin = organizationId
      ? await this.membershipsRepository.isUserOrganizationAdmin(user.id, organizationId)
      : false;

    const eventType = await getEventTypeById({
      currentOrganizationId: this.usersService.getUserMainOrgId(user),
      eventTypeId,
      userId: user.id,
      userLocale: user.locale ?? "en",
      prisma: this.dbRead.prisma as unknown as PrismaClient,
      isUserOrganizationAdmin,
      isTrpcCall: true,
    });

    if (!eventType) {
      throw new NotFoundException(`Event type with id ${eventTypeId} not found`);
    }

    if (!isUserOrganizationAdmin) {
      if (eventType?.team?.id) {
        await this.checkTeamOwnsEventType(user.id, eventType.eventType.id, eventType.team.id);
      } else {
        this.eventTypeService.checkUserOwnsEventType(user.id, eventType.eventType);
      }
    }

    // note (Lauris): don't show platform owner as one of the people that can be assigned to managed team event type
    const onlyManagedTeamMembers = eventType.teamMembers.filter((user) => user.isPlatformManaged);
    eventType.teamMembers = onlyManagedTeamMembers;

    return eventType;
  }

  async getUserEventTypes(userId: number) {
    return getBulkUserEventTypes(userId);
  }

  async updateEventType(eventTypeId: number, body: TUpdateEventTypeInputSchema, user: UserWithProfile) {
    await this.eventTypeService.checkCanUpdateEventType(user.id, eventTypeId, body.scheduleId);
    const eventTypeUser = await this.eventTypeService.getUserToUpdateEvent(user);
    const bookingFields = body.bookingFields ? [...body.bookingFields] : undefined;

    if (
      bookingFields?.length &&
      !bookingFields.find((field) => field.type === "email") &&
      !bookingFields.find((field) => field.type === "phone")
    ) {
      bookingFields.push(systemBeforeFieldEmail);
    }

    // Normalize period dates to UTC midnight (only if provided)
    const periodDates =
      body.periodStartDate !== undefined || body.periodEndDate !== undefined
        ? {
            ...(body.periodStartDate !== undefined
              ? { periodStartDate: normalizePeriodDate(body.periodStartDate) }
              : {}),
            ...(body.periodEndDate !== undefined
              ? { periodEndDate: normalizePeriodDate(body.periodEndDate) }
              : {}),
          }
        : {};

    const eventType = await updateEventType({
      input: { ...body, id: eventTypeId, bookingFields, ...periodDates },
      ctx: {
        user: eventTypeUser,
        prisma: this.dbWrite.prisma,
      },
    });

    if (!eventType) {
      throw new NotFoundException(`Event type with id ${eventTypeId} not found`);
    }

    return eventType;
  }

  async checkTeamOwnsEventType(userId: number, eventTypeId: number, teamId: number) {
    const membership = await this.dbRead.prisma.membership.findFirst({
      where: {
        userId,
        teamId,
        accepted: true,
        OR: [{ role: "ADMIN" }, { role: "OWNER" }],
      },
      select: {
        team: {
          select: {
            eventTypes: true,
          },
        },
      },
    });
    if (!membership?.team?.eventTypes?.some((item) => item.id === eventTypeId)) {
      throw new ForbiddenException(
        `Access denied. Either the team with ID=${teamId} does not own the event type with ID=${eventTypeId}, or your MEMBER role does not have permission to access this resource.`
      );
    }
  }

  async getEventTypesAppIntegration(slug: string, user: UserWithProfile, teamId?: number) {
    let credentials = await this.credentialsRepository.getAllUserCredentialsById(user.id);
    let userTeams: TeamQuery[] = [];
    if (teamId) {
      const teamsQuery = await this.atomsRepository.getUserTeams(user.id);
      // If a team is a part of an org then include those apps
      // Don't want to iterate over these parent teams
      const filteredTeams: TeamQuery[] = [];
      const parentTeams: TeamQuery[] = [];
      // Only loop and grab parent teams if a teamId was given. If not then all teams will be queried
      if (teamId) {
        teamsQuery.forEach((team) => {
          if (team?.parent) {
            const { parent, ...filteredTeam } = team;
            filteredTeams.push(filteredTeam);
            // Only add parent team if it's not already in teamsQuery
            if (!teamsQuery.some((t) => t.id === parent.id)) {
              parentTeams.push(parent);
            }
          }
        });
      }
      userTeams = [...teamsQuery, ...parentTeams];
      const teamAppCredentials: CredentialPayload[] = userTeams.flatMap((teamApp) => {
        return teamApp.credentials ? teamApp.credentials.flat() : [];
      });
      if (teamId) {
        credentials = teamAppCredentials;
      } else {
        credentials = credentials.concat(teamAppCredentials);
      }
    } else {
      if (slug !== "stripe") {
        // We only add delegationCredentials if the request for location options is for a user because DelegationCredential Credential is applicable to Users only.
        const { credentials: allCredentials } =
          await enrichUserWithDelegationConferencingCredentialsWithoutOrgId({
            user: {
              ...user,
              credentials,
            },
          });
        credentials = allCredentials as typeof credentials;
      }
    }

    const enabledApps = await getEnabledAppsFromCredentials(
      credentials as unknown as CredentialDataWithTeamName[],
      {
        where: { slug },
      }
    );
    const apps = await Promise.all(
      enabledApps
        .filter(({ ...app }) => app.slug === slug)
        .map(
          async ({
            credentials: _,
            credential,

            key: _2 /* don't leak to frontend */,
            ...app
          }: EnabledAppType) => {
            const userCredentialIds = credentials
              .filter((c) => c.appId === app.slug && !c.teamId)
              .map((c) => c.id);
            const invalidCredentialIds = credentials
              .filter((c) => c.appId === app.slug && c.invalid)
              .map((c) => c.id);
            const teams = await Promise.all(
              credentials
                .filter((c) => c.appId === app.slug && c.teamId)
                .map(async (c) => {
                  const team = userTeams.find((team) => team.id === c.teamId);
                  if (!team) {
                    return null;
                  }
                  return {
                    teamId: team.id,
                    name: team.name,
                    logoUrl: team.logoUrl,
                    credentialId: c.id,
                    isAdmin: checkAdminOrOwner(team.members[0].role),
                  };
                })
            );
            const isSetupAlready = credential && app.categories.includes("payment") ? true : undefined;
            let dependencyData: TDependencyData = [];
            if (app.dependencies?.length) {
              dependencyData = app.dependencies.map((dependency) => {
                const dependencyInstalled = enabledApps.some(
                  (dbAppIterator: EnabledAppType) =>
                    dbAppIterator.credentials.length && dbAppIterator.slug === dependency
                );
                // If the app marked as dependency is simply deleted from the codebase,
                // we can have the situation where App is marked installed in DB but we couldn't get the app.
                const dependencyName = getAppFromSlug(dependency)?.name;
                return { name: dependencyName, installed: dependencyInstalled };
              });
            }
            const credentialOwner: CredentialOwner = {
              name: user.name,
              teamId,
            };
            return {
              ...app,
              ...(teams.length && {
                credentialOwner,
              }),
              userCredentialIds,
              invalidCredentialIds,
              teams,
              isInstalled: !!userCredentialIds.length || !!teams.length || app.isGlobal,
              isSetupAlready,
              ...(app.dependencies && { dependencyData }),
            };
          }
        )
    );
    return apps[0];
  }

  async getUserPaymentInfo(uid: string) {
    const rawPayment = await this.atomsRepository.getRawPayment(uid);
    if (!rawPayment) throw new NotFoundException(`Payment with uid ${uid} not found`);
    const { data, booking: _booking, ...restPayment } = rawPayment;
    const payment = {
      ...restPayment,
      data: data as Record<string, unknown>,
    };
    if (!_booking) throw new NotFoundException(`Booking with uid ${uid} not found`);
    const { startTime, endTime, eventType, ...restBooking } = _booking;
    const booking = {
      ...restBooking,
      startTime: startTime.toString(),
      endTime: endTime.toString(),
    };
    if (!eventType) throw new NotFoundException(`Event type with uid ${uid} not found`);
    if (eventType.users.length === 0 && !eventType.team)
      throw new NotFoundException(`No users found or no team present for event type with uid ${uid}`);
    const [user] = eventType?.users.length
      ? eventType.users
      : [{ name: null, theme: null, hideBranding: null, username: null }];
    const profile = {
      name: eventType.team?.name || user?.name || null,
      theme: (!eventType.team?.name && user?.theme) || null,
      hideBranding: eventType.team?.hideBranding || user?.hideBranding || null,
    };
    return {
      user,
      eventType: {
        ...eventType,
        metadata: EventTypeMetaDataSchema.parse(eventType.metadata),
      },
      booking,
      payment,
      clientSecret: getClientSecretFromPayment(payment),
      profile,
    };
  }

  async bulkUpdateEventTypesDefaultLocation(user: UserWithProfile, eventTypeIds: number[]) {
    return bulkUpdateEventsToDefaultLocation({
      eventTypeIds,
      user,
      prisma: this.dbWrite.prisma as unknown as PrismaClient,
    });
  }

  /**
   * Returns the public event type for atoms, handling both team and user events.
   */
  async getPublicEventTypeForAtoms({
    username,
    eventSlug,
    isTeamEvent,
    orgId,
    teamId,
  }: {
    username?: string;
    eventSlug: string;
    isTeamEvent?: boolean;
    orgId?: number;
    teamId?: number;
  }): Promise<PublicEventType> {
    const orgSlug = orgId ? await this.getTeamSlug(orgId) : null;

    let usernameOrTeamSlug: string | null = null;
    if (isTeamEvent) {
      if (!teamId) {
        throw new BadRequestException("teamId is required for team events, please provide a valid teamId");
      }
      usernameOrTeamSlug = await this.getTeamSlug(teamId);
    } else {
      if (!username) {
        throw new BadRequestException(
          "username is required for non-team events, please provide a valid username"
        );
      }
      usernameOrTeamSlug = username;
    }

    usernameOrTeamSlug = usernameOrTeamSlug.toLowerCase();

    try {
      let event = await getPublicEvent({
        username: usernameOrTeamSlug,
        eventSlug: eventSlug,
        isTeamEvent: isTeamEvent,
        org: orgSlug,
        prisma: this.dbRead.prisma as unknown as PrismaClient,
        // Platform and atoms access is gated behind a license, so unpublished org events can be served safely.
        // If restriction is ever needed, introduce a `fromRedirectOfNonOrgLink` query param instead.
        fromRedirectOfNonOrgLink: true
      });

      const usernamePossiblyNotFromProfile = username && orgId && !event;
      if (usernamePossiblyNotFromProfile) {
        const user = await this.usersRepository.findByUsernameWithProfile(username);
        if (user) {
          const profile = await this.usersService.getUserMainProfile(user);
          if (profile?.username) {
            event = await getPublicEvent({
              username: profile.username,
              eventSlug: eventSlug,
              isTeamEvent: isTeamEvent,
              org: orgSlug,
              prisma: this.dbRead.prisma as unknown as PrismaClient,
              // Platform and atoms access is gated behind a license, so unpublished org events can be served safely.
              // If restriction is ever needed, introduce a `fromRedirectOfNonOrgLink` query param instead.
              fromRedirectOfNonOrgLink: true
            });
          }
        }
      }

      if (!event) {
        throw new NotFoundException(`Event type with slug ${eventSlug} not found`);
      }

      return event;
    } catch (err) {
      if (err instanceof Error) {
        throw new NotFoundException(err.message);
      }
      throw new NotFoundException(`Event type with slug ${eventSlug} not found`);
    }
  }
}
