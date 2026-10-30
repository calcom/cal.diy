import { dynamicEvent } from "@calcom/platform-libraries";
import {
  ById_2024_09_04_type,
  ByTeamSlugAndEventTypeSlug_2024_09_04,
  ByTeamSlugAndEventTypeSlug_2024_09_04_type,
  ByUsernameAndEventTypeSlug_2024_09_04,
  ByUsernameAndEventTypeSlug_2024_09_04_type,
  GetSlotsInput_2024_09_04,
  GetSlotsInputWithRouting_2024_09_04,
} from "@calcom/platform-types";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DateTime } from "luxon";
import { EventTypesRepository_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/event-types.repository";
import { TeamsEventTypesRepository } from "@/modules/teams/event-types/teams-event-types.repository";
import { TeamsRepository } from "@/modules/teams/teams/teams.repository";
import { UsersRepository } from "@/modules/users/users.repository";

export type InternalGetSlotsQuery = {
  isTeamEvent: boolean;
  startTime: string;
  endTime: string;
  duration?: number;
  eventTypeId: number;
  eventTypeSlug: string;
  usernameList: string[];
  timeZone: string | undefined;
  orgSlug: string | null | undefined;
  rescheduleUid: string | null;
  rrHostSubsetIds?: number[];
};

export type InternalGetSlotsQueryWithRouting = InternalGetSlotsQuery & {
  routedTeamMemberIds: number[] | null;
  skipContactOwner: boolean;
  teamMemberEmail: string | null;
};

@Injectable()
export class SlotsInputService_2024_09_04 {
  constructor(
    private readonly eventTypeRepository: EventTypesRepository_2024_06_14,
    private readonly usersRepository: UsersRepository,
    private readonly teamsRepository: TeamsRepository,
    private readonly teamsEventTypesRepository: TeamsEventTypesRepository
  ) {}

  async transformGetSlotsQuery(query: GetSlotsInput_2024_09_04): Promise<InternalGetSlotsQuery> {
    const eventType = await this.getEventType(query);
    if (!eventType) {
      throw new NotFoundException(`Event Type not found`);
    }
    const isTeamEvent = !!eventType?.teamId;

    const timeZone = query.timeZone || eventType.timeZone || eventType.schedule?.timeZone || undefined;

    const startTime = this.adjustStartTime(query.start, timeZone);
    const endTime = this.adjustEndTime(query.end, timeZone);
    const duration = query.duration;
    const eventTypeId = eventType.id;
    const eventTypeSlug = eventType.slug;
    const usernameList = "usernames" in query ? query.usernames : [];
    const orgSlug = "organizationSlug" in query ? query.organizationSlug : null;
    const rescheduleUid = query.bookingUidToReschedule || null;

    return {
      isTeamEvent,
      startTime,
      endTime,
      duration,
      eventTypeId,
      eventTypeSlug,
      usernameList,
      timeZone,
      orgSlug,
      rescheduleUid,
      rrHostSubsetIds: query.rrHostSubsetIds,
    };
  }

  async transformRoutingGetSlotsQuery(
    query: GetSlotsInputWithRouting_2024_09_04
  ): Promise<InternalGetSlotsQueryWithRouting> {
    const { routedTeamMemberIds, skipContactOwner, teamMemberEmail, ...baseQuery } = query;

    const baseTransformation = await this.transformGetSlotsQuery(baseQuery);

    return {
      ...baseTransformation,
      routedTeamMemberIds: routedTeamMemberIds || null,
      skipContactOwner: skipContactOwner || false,
      teamMemberEmail: teamMemberEmail || null,
    };
  }

  private async getEventType(input: GetSlotsInput_2024_09_04) {
    if (input.type === ById_2024_09_04_type) {
      return this.eventTypeRepository.getEventTypeById(input.eventTypeId);
    }

    if (input.type === ByUsernameAndEventTypeSlug_2024_09_04_type) {
      const user = await this.getEventTypeUser(input);
      if (!user) {
        throw new NotFoundException(`User with username ${input.username} not found`);
      }
      return this.eventTypeRepository.getUserEventTypeBySlug(user.id, input.eventTypeSlug);
    }

    if (input.type === ByTeamSlugAndEventTypeSlug_2024_09_04_type) {
      const team = await this.getEventTypeTeam(input);
      if (!team) {
        throw new NotFoundException(`Team with slug ${input.teamSlug} not found`);
      }
      return this.teamsEventTypesRepository.getEventTypeByTeamIdAndSlug(team.id, input.eventTypeSlug);
    }

    return input.duration ? { ...dynamicEvent, length: input.duration } : dynamicEvent;
  }

  private async getEventTypeUser(input: ByUsernameAndEventTypeSlug_2024_09_04) {
    return await this.usersRepository.findByUsername(input.username);
  }

  private async getEventTypeTeam(input: ByTeamSlugAndEventTypeSlug_2024_09_04) {
    return await this.teamsRepository.findTeamBySlug(input.teamSlug);
  }

  private adjustStartTime(startTime: string, timeZone?: string) {
    const zone = timeZone || "utc";
    let dateTime = DateTime.fromISO(startTime, { zone });

    if (!dateTime.isValid) {
      throw new BadRequestException("Invalid start date");
    }

    if (dateTime.hour === 0 && dateTime.minute === 0 && dateTime.second === 0) {
      dateTime = dateTime.set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
    }

    const ISOStartTime = dateTime.toUTC().toISO();
    if (ISOStartTime === null) {
      throw new BadRequestException("Invalid start date");
    }

    return ISOStartTime;
  }

  private adjustEndTime(endTime: string, timeZone?: string) {
    const zone = timeZone || "utc";
    let dateTime = DateTime.fromISO(endTime, { zone });

    if (!dateTime.isValid) {
      throw new BadRequestException("Invalid end date");
    }
    if (dateTime.hour === 0 && dateTime.minute === 0 && dateTime.second === 0) {
      dateTime = dateTime.set({ hour: 23, minute: 59, second: 59 });
    }

    const ISOEndTime = dateTime.toUTC().toISO();
    if (ISOEndTime === null) {
      throw new BadRequestException("Invalid end date");
    }

    return ISOEndTime;
  }
}
