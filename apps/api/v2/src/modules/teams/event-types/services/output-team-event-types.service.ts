import { SchedulingType } from "@calcom/platform-libraries";
import { EventTypeMetadata } from "@calcom/platform-libraries/event-types";
import type { HostPriority, TeamEventTypeResponseHost } from "@calcom/platform-types";
import type {
  CalVideoSettings,
  DestinationCalendar,
  EventType,
  Host,
  Schedule,
  Team,
  User,
} from "@calcom/prisma/client";
import { Injectable } from "@nestjs/common";
import { OutputEventTypesService_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/services/output-event-types.service";
import { TeamsEventTypesRepository } from "@/modules/teams/event-types/teams-event-types.repository";
import { UsersRepository } from "@/modules/users/users.repository";

type EventTypeRelations = {
  users: User[];
  schedule: Schedule | null;
  hosts: Host[];
  destinationCalendar?: DestinationCalendar | null;
  team?: Pick<
    Team,
    "bannerUrl" | "name" | "logoUrl" | "slug" | "weekStart" | "brandColor" | "darkBrandColor" | "theme"
  > | null;
  calVideoSettings?: CalVideoSettings | null;
};
export type DatabaseTeamEventType = EventType & EventTypeRelations;

type Input = Pick<
  DatabaseTeamEventType,
  | "id"
  | "length"
  | "title"
  | "description"
  | "disableGuests"
  | "slotInterval"
  | "minimumBookingNotice"
  | "beforeEventBuffer"
  | "afterEventBuffer"
  | "slug"
  | "schedulingType"
  | "requiresConfirmation"
  | "price"
  | "currency"
  | "lockTimeZoneToggleOnBookingPage"
  | "seatsPerTimeSlot"
  | "forwardParamsSuccessRedirect"
  | "successRedirectUrl"
  | "seatsShowAvailabilityCount"
  | "isInstantEvent"
  | "locations"
  | "bookingFields"
  | "recurringEvent"
  | "metadata"
  | "users"
  | "scheduleId"
  | "hosts"
  | "teamId"
  | "userId"
  | "parentId"
  | "assignAllTeamMembers"
  | "bookingLimits"
  | "durationLimits"
  | "onlyShowFirstAvailableSlot"
  | "offsetStart"
  | "periodType"
  | "periodDays"
  | "periodCountCalendarDays"
  | "periodStartDate"
  | "periodEndDate"
  | "requiresBookerEmailVerification"
  | "hideCalendarNotes"
  | "lockTimeZoneToggleOnBookingPage"
  | "eventTypeColor"
  | "seatsShowAttendees"
  | "requiresConfirmationWillBlockSlot"
  | "eventName"
  | "useEventTypeDestinationCalendarEmail"
  | "hideCalendarEventDetails"
  | "hideOrganizerEmail"
  | "team"
  | "calVideoSettings"
  | "hidden"
  | "bookingRequiresAuthentication"
  | "rescheduleWithSameRoundRobinHost"
  | "maxActiveBookingPerBookerOfferReschedule"
  | "maxActiveBookingsPerBooker"
  | "disableCancelling"
  | "disableRescheduling"
  | "minimumRescheduleNotice"
  | "minimumCancellationNotice"
  | "canSendCalVideoTranscriptionEmails"
  | "interfaceLanguage"
  | "allowReschedulingPastBookings"
  | "allowReschedulingCancelledBookings"
  | "showOptimizedSlots"
  | "rrHostSubsetEnabled"
>;

@Injectable()
export class OutputTeamEventTypesService {
  constructor(
    private readonly outputEventTypesService: OutputEventTypesService_2024_06_14,
    private readonly teamsEventTypesRepository: TeamsEventTypesRepository,
    private readonly usersRepository: UsersRepository
  ) {}

  async getResponseTeamEventType(databaseEventType: Input, isOrgTeamEvent: boolean) {
    const metadata = this.outputEventTypesService.transformMetadata(databaseEventType.metadata);

    const emailSettings = this.transformEmailSettings(metadata);

    const {
      teamId,
      userId,
      parentId,
      assignAllTeamMembers,
      rescheduleWithSameRoundRobinHost,
      rrHostSubsetEnabled,
    } = databaseEventType;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { ownerId, users, ...rest } = this.outputEventTypesService.getResponseEventType(
      0,
      databaseEventType,
      isOrgTeamEvent
    );
    const hosts =
      databaseEventType.schedulingType === "MANAGED"
        ? await this.getManagedEventTypeHosts(databaseEventType.id)
        : await this.getNonManagedEventTypeHosts(databaseEventType.hosts, databaseEventType.schedulingType);

    return {
      ...rest,
      hosts,
      teamId,
      ownerId: userId,
      parentEventTypeId: parentId,
      schedulingType: databaseEventType.schedulingType
        ? this.getResponseSchedulingType(databaseEventType.schedulingType)
        : databaseEventType.schedulingType,
      assignAllTeamMembers: teamId ? assignAllTeamMembers : undefined,
      emailSettings,
      team: {
        id: teamId,
        name: databaseEventType?.team?.name,
        slug: databaseEventType?.team?.slug,
        bannerUrl: databaseEventType?.team?.bannerUrl,
        logoUrl: databaseEventType?.team?.logoUrl,
        weekStart: databaseEventType?.team?.weekStart,
        brandColor: databaseEventType?.team?.brandColor,
        darkBrandColor: databaseEventType?.team?.darkBrandColor,
        theme: databaseEventType?.team?.theme,
      },
      rescheduleWithSameRoundRobinHost,
      rrHostSubsetEnabled,
    };
  }

  getResponseSchedulingType(schedulingType: SchedulingType) {
    if (schedulingType === SchedulingType.COLLECTIVE) {
      return "collective";
    }
    if (schedulingType === SchedulingType.ROUND_ROBIN) {
      return "roundRobin";
    }
    if (schedulingType === SchedulingType.MANAGED) {
      return "managed";
    }
    return schedulingType;
  }

  async getManagedEventTypeHosts(eventTypeId: number) {
    const children = await this.teamsEventTypesRepository.getEventTypeChildren(eventTypeId);
    const transformedHosts: TeamEventTypeResponseHost[] = [];
    for (const child of children) {
      if (child.userId) {
        const user = await this.usersRepository.findById(child.userId);
        transformedHosts.push({
          userId: child.userId,
          name: user?.name || "",
          username: user?.username || "",
          avatarUrl: user?.avatarUrl,
        });
      }
    }
    return transformedHosts;
  }

  async getNonManagedEventTypeHosts(
    databaseHosts: Host[],
    schedulingType: SchedulingType | null
  ): Promise<TeamEventTypeResponseHost[]> {
    if (!schedulingType) return [];

    const transformedHosts: TeamEventTypeResponseHost[] = [];
    const databaseUsers = await this.usersRepository.findByIds(databaseHosts.map((host) => host.userId));

    for (const databaseHost of databaseHosts) {
      const databaseUser = databaseUsers.find((u) => u.id === databaseHost.userId);
      if (schedulingType === "ROUND_ROBIN") {
        // note(Lauris): round robin is the only team event where mandatory (isFixed) and priority are used
        transformedHosts.push({
          userId: databaseHost.userId,
          name: databaseUser?.name || "",
          username: databaseUser?.username || "",
          mandatory: !!databaseHost.isFixed,
          priority: getPriorityLabel(databaseHost.priority || 2),
          avatarUrl: databaseUser?.avatarUrl,
        });
      } else {
        transformedHosts.push({
          userId: databaseHost.userId,
          name: databaseUser?.name || "",
          username: databaseUser?.username || "",
          avatarUrl: databaseUser?.avatarUrl,
        });
      }
    }

    return transformedHosts;
  }

  private transformEmailSettings(metadata: EventTypeMetadata) {
    if (!metadata?.disableStandardEmails?.all) {
      return undefined;
    }

    const { attendee, host } = metadata.disableStandardEmails.all;

    if (attendee !== undefined || host !== undefined) {
      return {
        disableEmailsToAttendees: attendee ?? false,
        disableEmailsToHosts: host ?? false,
      };
    }

    return undefined;
  }
}

function getPriorityLabel(priority: number): keyof typeof HostPriority {
  switch (priority) {
    case 0:
      return "lowest";
    case 1:
      return "low";
    case 2:
      return "medium";
    case 3:
      return "high";
    case 4:
      return "highest";
    default:
      throw new Error("Invalid HostPriority value");
  }
}
