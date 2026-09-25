import { EventTypesRepository_2024_06_14 } from "@/ee/event-types/event-types_2024_06_14/event-types.repository";
import { OrganizationsRepository } from "@/modules/organizations/index/organizations.repository";
import { OrganizationsTeamsRepository } from "@/modules/organizations/teams/index/organizations-teams.repository";
import { OrganizationsUsersRepository } from "@/modules/organizations/users/index/organizations-users.repository";
import { TeamsEventTypesRepository } from "@/modules/teams/event-types/teams-event-types.repository";
import { TeamsRepository } from "@/modules/teams/teams/teams.repository";
import { UsersRepository } from "@/modules/users/users.repository";
import { Test, TestingModule } from "@nestjs/testing";

import type { GetSlotsInput_2024_09_04 } from "@calcom/platform-types";

import { SlotsInputService_2024_09_04 } from "./slots-input.service";

describe("SlotsInputService_2024_09_04", () => {
  let service: SlotsInputService_2024_09_04;
  let eventTypesRepository: EventTypesRepository_2024_06_14;
  let teamsEventTypesRepository: TeamsEventTypesRepository;
  let teamsRepository: TeamsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlotsInputService_2024_09_04,
        {
          provide: EventTypesRepository_2024_06_14,
          useValue: {
            getEventTypeById: jest.fn(),
            getUserEventTypeBySlug: jest.fn(),
          },
        },
        {
          provide: UsersRepository,
          useValue: {
            findByUsername: jest.fn(),
          },
        },
        {
          provide: OrganizationsUsersRepository,
          useValue: {
            getOrganizationUserByUsername: jest.fn(),
          },
        },
        {
          provide: OrganizationsTeamsRepository,
          useValue: {
            findOrgTeamBySlug: jest.fn(),
          },
        },
        {
          provide: OrganizationsRepository,
          useValue: {
            findOrgBySlug: jest.fn(),
          },
        },
        {
          provide: TeamsRepository,
          useValue: {
            findTeamBySlug: jest.fn(),
          },
        },
        {
          provide: TeamsEventTypesRepository,
          useValue: {
            getEventTypeByTeamIdAndSlug: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SlotsInputService_2024_09_04>(SlotsInputService_2024_09_04);
    eventTypesRepository = module.get<EventTypesRepository_2024_06_14>(EventTypesRepository_2024_06_14);
    teamsEventTypesRepository = module.get<TeamsEventTypesRepository>(TeamsEventTypesRepository);
    teamsRepository = module.get<TeamsRepository>(TeamsRepository);

    jest.clearAllMocks();
  });

  describe("transformGetSlotsQuery - timezone handling", () => {
    it("uses explicit query timeZone when provided", async () => {
      const input: GetSlotsInput_2024_09_04 = {
        type: "byEventTypeId",
        eventTypeId: 1,
        start: "2025-12-01T18:30:00Z",
        end: "2025-12-02T18:29:59Z",
        timeZone: "Asia/Kolkata",
      } as GetSlotsInput_2024_09_04;

      (eventTypesRepository.getEventTypeById as jest.Mock).mockResolvedValue({
        id: 1,
        slug: "test-event",
        teamId: null,
        schedule: {
          timeZone: "America/New_York",
        },
      });

      const result = await service.transformGetSlotsQuery(input);

      expect(result.timeZone).toBe("Asia/Kolkata");
      // Start time should be interpreted in Asia/Kolkata and then converted to UTC.
      // 2025-12-01T18:30:00Z is 2025-12-02T00:00:00+05:30, so after toUTC() we expect 18:30:00Z again.
      expect(result.startTime).toBe("2025-12-01T18:30:00.000Z");
    });

    it("falls back to eventType.schedule.timeZone when query timeZone is not provided", async () => {
      const input: GetSlotsInput_2024_09_04 = {
        type: "byEventTypeId",
        eventTypeId: 1,
        start: "2025-12-01T18:30:00Z",
        end: "2025-12-02T18:29:59Z",
      } as GetSlotsInput_2024_09_04;

      (eventTypesRepository.getEventTypeById as jest.Mock).mockResolvedValue({
        id: 1,
        slug: "test-event",
        teamId: null,
        schedule: {
          timeZone: "Asia/Kolkata",
        },
      });

      const result = await service.transformGetSlotsQuery(input);

      expect(result.timeZone).toBe("Asia/Kolkata");
      // Same reasoning: interpreting the start in Asia/Kolkata and converting to UTC
      // should still yield 18:30:00Z for this particular instant.
      expect(result.startTime).toBe("2025-12-01T18:30:00.000Z");
    });

    it("uses team event type schedule timeZone when resolving by team slug", async () => {
      const input: GetSlotsInput_2024_09_04 = {
        type: "byTeamSlugAndEventTypeSlug",
        teamSlug: "team-slug",
        eventTypeSlug: "event-slug",
        start: "2025-12-01T18:30:00Z",
        end: "2025-12-02T18:29:59Z",
      } as GetSlotsInput_2024_09_04;

      (teamsRepository.findTeamBySlug as jest.Mock).mockResolvedValue({
        id: 10,
        slug: "team-slug",
      });

      (teamsEventTypesRepository.getEventTypeByTeamIdAndSlug as jest.Mock).mockResolvedValue({
        id: 1,
        slug: "event-slug",
        teamId: 10,
        schedule: {
          timeZone: "Asia/Kolkata",
        },
      });

      const result = await service.transformGetSlotsQuery(input);

      expect(result.timeZone).toBe("Asia/Kolkata");
      expect(result.startTime).toBe("2025-12-01T18:30:00.000Z");
    });
  });
});
