import {
  EVENT_TYPE_READ,
  EVENT_TYPE_WRITE,
  SUCCESS_STATUS,
  X_CAL_CLIENT_ID,
} from "@calcom/platform-constants";
import { getEventTypesByViewer, getPublicEvent } from "@calcom/platform-libraries/event-types";
import type { PrismaClient } from "@calcom/prisma";
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiExcludeController as DocsExcludeController } from "@nestjs/swagger";
import { CreateEventTypeInput_2024_04_15 } from "@/platform/event-types/event-types_2024_04_15/inputs/create-event-type.input";
import { EventTypeIdParams_2024_04_15 } from "@/platform/event-types/event-types_2024_04_15/inputs/event-type-id.input";
import { GetPublicEventTypeQueryParams_2024_04_15 } from "@/platform/event-types/event-types_2024_04_15/inputs/get-public-event-type-query-params.input";
import { UpdateEventTypeInput_2024_04_15 } from "@/platform/event-types/event-types_2024_04_15/inputs/update-event-type.input";
import { CreateEventTypeOutput } from "@/platform/event-types/event-types_2024_04_15/outputs/create-event-type.output";
import { DeleteEventTypeOutput } from "@/platform/event-types/event-types_2024_04_15/outputs/delete-event-type.output";
import { GetEventTypeOutput } from "@/platform/event-types/event-types_2024_04_15/outputs/get-event-type.output";
import {
  GetEventTypePublicOutput,
  PublicEventTypeOutput,
} from "@/platform/event-types/event-types_2024_04_15/outputs/get-event-type-public.output";
import {
  GetEventTypesData,
  GetEventTypesOutput,
} from "@/platform/event-types/event-types_2024_04_15/outputs/get-event-types.output";
import { GetEventTypesPublicOutput } from "@/platform/event-types/event-types_2024_04_15/outputs/get-event-types-public.output";
import { UpdateEventTypeOutput } from "@/platform/event-types/event-types_2024_04_15/outputs/update-event-type.output";
import { EventTypesService_2024_04_15 } from "@/platform/event-types/event-types_2024_04_15/services/event-types.service";
import { VERSION_2024_04_15, VERSION_2024_06_11 } from "@/lib/api-versions";
import { GetUser } from "@/modules/auth/decorators/get-user/get-user.decorator";
import { Permissions } from "@/modules/auth/decorators/permissions/permissions.decorator";
import { ApiAuthGuard } from "@/modules/auth/guards/api-auth/api-auth.guard";
import { PermissionsGuard } from "@/modules/auth/guards/permissions/permissions.guard";
import { OrganizationsRepository } from "@/modules/organizations/index/organizations.repository";
import { PrismaReadService } from "@/modules/prisma/prisma-read.service";
import { UserWithProfile } from "@/modules/users/users.repository";

@Controller({
  path: "/v2/event-types",
  version: [VERSION_2024_04_15, VERSION_2024_06_11],
})
@UseGuards(PermissionsGuard)
@DocsExcludeController(true)
export class EventTypesController_2024_04_15 {
  constructor(
    private readonly eventTypesService: EventTypesService_2024_04_15,
    private readonly prismaReadService: PrismaReadService,
    private readonly organizationsRepository: OrganizationsRepository
  ) {}

  @Post("/")
  @Permissions([EVENT_TYPE_WRITE])
  @UseGuards(ApiAuthGuard)
  async createEventType(
    @Body() body: CreateEventTypeInput_2024_04_15,
    @GetUser() user: UserWithProfile
  ): Promise<CreateEventTypeOutput> {
    const eventType = await this.eventTypesService.createUserEventType(user, body);

    return {
      status: SUCCESS_STATUS,
      data: eventType,
    };
  }

  @Get("/:eventTypeId")
  @Permissions([EVENT_TYPE_READ])
  @UseGuards(ApiAuthGuard)
  async getEventType(
    @Param("eventTypeId", ParseIntPipe) eventTypeId: number,
    @GetUser() user: UserWithProfile
  ): Promise<GetEventTypeOutput> {
    const eventType = await this.eventTypesService.getUserEventTypeForAtom(user, Number(eventTypeId));

    if (!eventType) {
      throw new NotFoundException(`Event type with id ${eventTypeId} not found`);
    }

    return {
      status: SUCCESS_STATUS,
      data: eventType,
    };
  }

  @Get("/")
  @Permissions([EVENT_TYPE_READ])
  @UseGuards(ApiAuthGuard)
  async getEventTypes(@GetUser() user: UserWithProfile): Promise<GetEventTypesOutput> {
    const eventTypes = await getEventTypesByViewer({
      id: user.id,
      profile: {
        upId: `usr-${user.id}`,
      },
    });

    return {
      status: SUCCESS_STATUS,
      data: eventTypes as GetEventTypesData,
    };
  }

  @Get("/:username/:eventSlug/public")
  async getPublicEventType(
    @Param("username") username: string,
    @Param("eventSlug") eventSlug: string,
    @Query() queryParams: GetPublicEventTypeQueryParams_2024_04_15,
    @Headers(X_CAL_CLIENT_ID) clientId?: string
  ): Promise<GetEventTypePublicOutput> {
    try {
      let orgSlug = queryParams.org;

      if (clientId && !orgSlug && username.includes(`-${clientId}`)) {
        const org = await this.organizationsRepository
          .findTeamIdAndSlugFromClientId(clientId)
          .catch(() => null);
        if (org) {
          orgSlug = org.slug;
        }
      }

      const event = await getPublicEvent({
          username: username.toLowerCase(),
          eventSlug: eventSlug,
          isTeamEvent: queryParams.isTeamEvent,
          org: orgSlug ?? null,
          prisma: this.prismaReadService.prisma as unknown as PrismaClient,
          // We should be fine allowing unpublished orgs events to be servable through platform because Platform access is behind license
          // If there is ever a need to restrict this, we can introduce a new query param `fromRedirectOfNonOrgLink`
          fromRedirectOfNonOrgLink: true
        }
      );

      return {
        data: event as unknown as PublicEventTypeOutput,
        status: SUCCESS_STATUS,
      };
    } catch (err) {
      if (err instanceof Error) {
        throw new NotFoundException(err.message);
      }
    }
    throw new InternalServerErrorException("Could not find public event.");
  }

  @Get("/:username/public")
  async getPublicEventTypes(@Param("username") username: string): Promise<GetEventTypesPublicOutput> {
    const eventTypes = await this.eventTypesService.getEventTypesPublicByUsername(username);

    return {
      status: SUCCESS_STATUS,
      data: eventTypes,
    };
  }

  @Patch("/:eventTypeId")
  @Permissions([EVENT_TYPE_WRITE])
  @UseGuards(ApiAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateEventType(
    @Param() params: EventTypeIdParams_2024_04_15,
    @Param("eventTypeId", ParseIntPipe) eventTypeId: number,
    @Body() body: UpdateEventTypeInput_2024_04_15,
    @GetUser() user: UserWithProfile
  ): Promise<UpdateEventTypeOutput> {
    const eventType = await this.eventTypesService.updateEventType(eventTypeId, body, user);

    return {
      status: SUCCESS_STATUS,
      data: eventType,
    };
  }

  @Delete("/:eventTypeId")
  @Permissions([EVENT_TYPE_WRITE])
  @UseGuards(ApiAuthGuard)
  async deleteEventType(
    @Param() params: EventTypeIdParams_2024_04_15,
    @Param("eventTypeId", ParseIntPipe) eventTypeId: number,
    @GetUser("id") userId: number
  ): Promise<DeleteEventTypeOutput> {
    const eventType = await this.eventTypesService.deleteEventType(eventTypeId, userId);

    return {
      status: SUCCESS_STATUS,
      data: {
        id: eventType.id,
        length: eventType.length,
        slug: eventType.slug,
        title: eventType.title,
      },
    };
  }
}
