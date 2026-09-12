import { GOOGLE_CALENDAR, SUCCESS_STATUS } from "@calcom/platform-constants";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiTags as DocsTags } from "@nestjs/swagger";
import { GetBusyTimesOutput } from "@/platform/calendars/outputs/busy-times.output";
import { API_VERSIONS_VALUES } from "@/lib/api-versions";
import { API_KEY_OR_ACCESS_TOKEN_HEADER } from "@/lib/docs/headers";
import { GetUser } from "@/modules/auth/decorators/get-user/get-user.decorator";
import { ApiAuthGuard } from "@/modules/auth/guards/api-auth/api-auth.guard";
import { PermissionsGuard } from "@/modules/auth/guards/permissions/permissions.guard";
import { CreateUnifiedCalendarEventInput } from "@/modules/cal-unified-calendars/inputs/create-unified-calendar-event.input";
import { FreebusyUnifiedInput } from "@/modules/cal-unified-calendars/inputs/freebusy-unified.input";
import { ListUnifiedCalendarEventsInput } from "@/modules/cal-unified-calendars/inputs/list-unified-calendar-events.input";
import { UpdateUnifiedCalendarEventInput } from "@/modules/cal-unified-calendars/inputs/update-unified-calendar-event.input";
import {
  GetUnifiedCalendarEventOutput,
  ListUnifiedCalendarEventsOutput,
} from "@/modules/cal-unified-calendars/outputs/get-unified-calendar-event.output";
import { ListConnectionsOutput } from "@/modules/cal-unified-calendars/outputs/list-connections.output";
import { ParseConnectionIdPipe } from "@/modules/cal-unified-calendars/pipes/parse-connection-id.pipe";
import { UnifiedCalendarService } from "@/modules/cal-unified-calendars/services/unified-calendar.service";

const UNIFIED_CALENDAR_PARAM = ["google", "office365", "apple"] as const;

@Controller({
  path: "/v2/calendars",
  version: API_VERSIONS_VALUES,
})
@DocsTags("Cal Unified Calendars")
export class CalUnifiedCalendarsController {
  constructor(private readonly unifiedCalendarService: UnifiedCalendarService) {}

  @Get("connections")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiAuthGuard, PermissionsGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "List calendar connections",
    description:
      "Returns all calendar connections for the authenticated user (Google, Office 365, Apple). Use connectionId in connection-scoped endpoints. Note: Event CRUD (list/create/get/update/delete events) is currently only supported for Google Calendar connections; other types will return 400.",
  })
  async listConnections(@GetUser("id") userId: number): Promise<ListConnectionsOutput> {
    const connections = await this.unifiedCalendarService.getConnections(userId);
    // Defense-in-depth: only forward the public fields so that any future service
    // regression that accidentally includes credential.key cannot leak to the client.
    const safeConnections = connections.map(({ connectionId, type, email }) => ({ connectionId, type, email }));
    return {
      status: SUCCESS_STATUS,
      data: { connections: safeConnections },
    };
  }

  @ApiParam({
    name: "connectionId",
    description: "Calendar connection ID from GET /connections",
    type: String,
  })
  @Get("connections/:connectionId/events")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiAuthGuard, PermissionsGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "List events for a connection",
    description:
      "List events in a date range for a specific calendar connection. Only supported for Google Calendar connections; other connection types return 400.",
  })
  @ApiQuery({ name: "from", required: true, type: String })
  @ApiQuery({ name: "to", required: true, type: String })
  @ApiQuery({ name: "timeZone", required: false, type: String })
  @ApiQuery({ name: "calendarId", required: false, type: String })
  async listConnectionEvents(
    @Param("connectionId", ParseConnectionIdPipe) credentialId: number,
    @GetUser("id") userId: number,
    @Query() query: ListUnifiedCalendarEventsInput
  ): Promise<ListUnifiedCalendarEventsOutput> {
    const timeMin = query.from.includes("T") ? query.from : `${query.from}T00:00:00.000Z`;
    const timeMax = query.to.includes("T") ? query.to : `${query.to}T23:59:59.999Z`;
    const data = await this.unifiedCalendarService.listConnectionEvents(
      userId,
      credentialId,
      query.calendarId ?? "primary",
      timeMin,
      timeMax
    );
    return { status: SUCCESS_STATUS, data };
  }

  @ApiParam({ name: "connectionId", type: String })
  @Post("connections/:connectionId/events")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ApiAuthGuard, PermissionsGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Create event on a connection",
    description:
      "Create a new event on the specified calendar connection. Only supported for Google Calendar connections; other connection types return 400.",
  })
  @ApiQuery({ name: "calendarId", required: false, type: String })
  async createConnectionEvent(
    @Param("connectionId", ParseConnectionIdPipe) credentialId: number,
    @GetUser("id") userId: number,
    @Body() body: CreateUnifiedCalendarEventInput,
    @Query("calendarId") calendarId?: string
  ): Promise<GetUnifiedCalendarEventOutput> {
    const data = await this.unifiedCalendarService.createConnectionEvent(
      userId,
      credentialId,
      calendarId ?? "primary",
      body
    );
    return { status: SUCCESS_STATUS, data };
  }

  @ApiParam({ name: "connectionId", type: String })
  @ApiParam({ name: "eventId", type: String })
  @Get("connections/:connectionId/events/:eventId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiAuthGuard, PermissionsGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Get event for a connection",
    description:
      "Get a single event by ID for the specified calendar connection. Only supported for Google Calendar connections; other connection types return 400.",
  })
  @ApiQuery({ name: "calendarId", required: false, type: String })
  async getConnectionEvent(
    @Param("connectionId", ParseConnectionIdPipe) credentialId: number,
    @Param("eventId") eventId: string,
    @GetUser("id") userId: number,
    @Query("calendarId") calendarId?: string
  ): Promise<GetUnifiedCalendarEventOutput> {
    const data = await this.unifiedCalendarService.getConnectionEvent(
      userId,
      credentialId,
      calendarId ?? "primary",
      eventId
    );
    return { status: SUCCESS_STATUS, data };
  }

  @ApiParam({ name: "connectionId", type: String })
  @ApiParam({ name: "eventId", type: String })
  @Patch("connections/:connectionId/events/:eventId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiAuthGuard, PermissionsGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Update event for a connection",
    description:
      "Update an event on the specified calendar connection. Only supported for Google Calendar connections; other connection types return 400.",
  })
  @ApiQuery({ name: "calendarId", required: false, type: String })
  async updateConnectionEvent(
    @Param("connectionId", ParseConnectionIdPipe) credentialId: number,
    @Param("eventId") eventId: string,
    @GetUser("id") userId: number,
    @Body() updateData: UpdateUnifiedCalendarEventInput,
    @Query("calendarId") calendarId?: string
  ): Promise<GetUnifiedCalendarEventOutput> {
    const data = await this.unifiedCalendarService.updateConnectionEvent(
      userId,
      credentialId,
      calendarId ?? "primary",
      eventId,
      updateData
    );
    return { status: SUCCESS_STATUS, data };
  }

  @ApiParam({ name: "connectionId", type: String })
  @ApiParam({ name: "eventId", type: String })
  @Delete("connections/:connectionId/events/:eventId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(ApiAuthGuard, PermissionsGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Delete event for a connection",
    description:
      "Delete/cancel an event on the specified calendar connection. Only supported for Google Calendar connections; other connection types return 400.",
  })
  @ApiQuery({ name: "calendarId", required: false, type: String })
  async deleteConnectionEvent(
    @Param("connectionId", ParseConnectionIdPipe) credentialId: number,
    @Param("eventId") eventId: string,
    @GetUser("id") userId: number,
    @Query("calendarId") calendarId?: string
  ): Promise<void> {
    await this.unifiedCalendarService.deleteConnectionEvent(userId, credentialId, calendarId ?? "primary", eventId);
  }

  @ApiParam({ name: "connectionId", type: String })
  @Get("connections/:connectionId/freebusy")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiAuthGuard, PermissionsGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Get free/busy for a connection",
    description: "Get busy time slots for the specified calendar connection.",
  })
  @ApiQuery({ name: "from", required: true, type: String })
  @ApiQuery({ name: "to", required: true, type: String })
  @ApiQuery({ name: "timeZone", required: false, type: String })
  async getConnectionFreeBusy(
    @Param("connectionId", ParseConnectionIdPipe) credentialId: number,
    @GetUser("id") userId: number,
    @Query() query: FreebusyUnifiedInput
  ): Promise<GetBusyTimesOutput> {
    const timezone = query.timeZone ?? "UTC";
    const data = await this.unifiedCalendarService.getConnectionFreeBusy(
      userId,
      credentialId,
      query.from,
      query.to,
      timezone
    );
    return { status: SUCCESS_STATUS, data };
  }

  @ApiParam({
    name: "calendar",
    enum: [GOOGLE_CALENDAR],
    type: String,
  })
  @ApiParam({
    name: "eventUid",
    description:
      "The Google Calendar event ID. You can retrieve this by getting booking references from the following endpoints:\n\n- For user events: GET /v2/bookings/{bookingUid}/references",
    type: String,
  })
  @Get("/:calendar/events/:eventUid")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiAuthGuard, PermissionsGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Get meeting details from calendar",
    description:
      "Returns detailed information about a meeting including attendance metrics. For connection-scoped access use GET /connections/{connectionId}/events/{eventId}.",
  })
  async getCalendarEventDetails(
    @Param("calendar") calendar: string,
    @Param("eventUid") eventUid: string
  ): Promise<GetUnifiedCalendarEventOutput> {
    const data = await this.unifiedCalendarService.getEventDetails(calendar, eventUid);
    return { status: SUCCESS_STATUS, data };
  }

  @ApiParam({
    name: "calendar",
    enum: [GOOGLE_CALENDAR],
    type: String,
  })
  @ApiParam({
    name: "eventUid",
    description:
      "The Google Calendar event ID. You can retrieve this by getting booking references from the following endpoints:\n\n- For user events: GET /v2/bookings/{bookingUid}/references",
    type: String,
  })
  @Get("/:calendar/event/:eventUid")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiAuthGuard, PermissionsGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    deprecated: true,
    summary: "Get meeting details from calendar (deprecated path)",
    description:
      "Deprecated singular alias of GET /v2/calendars/{calendar}/events/{eventUid} \u2014 use the plural /events/ path instead.",
  })
  async getCalendarEventDetailsByDeprecatedPath(
    @Param("calendar") calendar: string,
    @Param("eventUid") eventUid: string
  ): Promise<GetUnifiedCalendarEventOutput> {
    return this.getCalendarEventDetails(calendar, eventUid);
  }

  @ApiParam({
    name: "calendar",
    enum: [GOOGLE_CALENDAR],
    type: String,
  })
  @ApiParam({
    name: "eventUid",
    description:
      "The Google Calendar event ID. You can retrieve this by getting booking references from the following endpoints:\n\n- For user events: GET /v2/bookings/{bookingUid}/references",
    type: String,
  })
  @Patch("/:calendar/events/:eventUid")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiAuthGuard, PermissionsGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Update meeting details in calendar",
    description:
      "Updates event information in the specified calendar provider. For connection-scoped access use PATCH /connections/{connectionId}/events/{eventId}.",
  })
  async updateCalendarEvent(
    @Param("calendar") calendar: string,
    @Param("eventUid") eventUid: string,
    @Body() updateData: UpdateUnifiedCalendarEventInput
  ): Promise<GetUnifiedCalendarEventOutput> {
    const data = await this.unifiedCalendarService.updateEventDetails(calendar, eventUid, updateData);
    return { status: SUCCESS_STATUS, data };
  }

  @ApiParam({
    name: "calendar",
    enum: [GOOGLE_CALENDAR],
    type: String,
  })
  @ApiParam({
    name: "eventUid",
    description:
      "The Google Calendar event ID. You can retrieve this by getting booking references from the following endpoints:\n\n- For user events: GET /v2/bookings/{bookingUid}/references",
    type: String,
  })
  @Patch("/:calendar/event/:eventUid")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiAuthGuard, PermissionsGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    deprecated: true,
    summary: "Update meeting details in calendar (deprecated path)",
    description:
      "Deprecated singular alias of PATCH /v2/calendars/{calendar}/events/{eventUid} \u2014 use the plural /events/ path instead.",
  })
  async updateCalendarEventByDeprecatedPath(
    @Param("calendar") calendar: string,
    @Param("eventUid") eventUid: string,
    @Body() updateData: UpdateUnifiedCalendarEventInput
  ): Promise<GetUnifiedCalendarEventOutput> {
    return this.updateCalendarEvent(calendar, eventUid, updateData);
  }

  @ApiParam({ name: "calendar", enum: UNIFIED_CALENDAR_PARAM, type: String })
  @Get("/:calendar/events")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiAuthGuard, PermissionsGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "List calendar events",
    description:
      "List events in a date range for the authenticated user's calendar. Currently only Google Calendar is supported.",
  })
  @ApiQuery({ name: "from", required: true, type: String })
  @ApiQuery({ name: "to", required: true, type: String })
  @ApiQuery({ name: "timeZone", required: false, type: String })
  @ApiQuery({ name: "calendarId", required: false, type: String })
  async listCalendarEvents(
    @Param("calendar") calendar: string,
    @GetUser("id") userId: number,
    @Query() query: ListUnifiedCalendarEventsInput
  ): Promise<ListUnifiedCalendarEventsOutput> {
    const timeMin = query.from.includes("T") ? query.from : `${query.from}T00:00:00.000Z`;
    const timeMax = query.to.includes("T") ? query.to : `${query.to}T23:59:59.999Z`;
    const data = await this.unifiedCalendarService.listEvents(
      calendar,
      userId,
      query.calendarId ?? "primary",
      timeMin,
      timeMax
    );
    return { status: SUCCESS_STATUS, data };
  }

  @ApiParam({ name: "calendar", enum: UNIFIED_CALENDAR_PARAM, type: String })
  @Post("/:calendar/events")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ApiAuthGuard, PermissionsGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Create a calendar event",
    description:
      "Create a new event on the authenticated user's calendar. Currently only Google Calendar is supported.",
  })
  async createCalendarEvent(
    @Param("calendar") calendar: string,
    @GetUser("id") userId: number,
    @Body() body: CreateUnifiedCalendarEventInput
  ): Promise<GetUnifiedCalendarEventOutput> {
    const data = await this.unifiedCalendarService.createEvent(calendar, userId, "primary", body);
    return { status: SUCCESS_STATUS, data };
  }

  @ApiParam({ name: "calendar", enum: UNIFIED_CALENDAR_PARAM, type: String })
  @ApiParam({
    name: "eventUid",
    description: "The calendar provider's event ID (e.g. Google Calendar event ID)",
    type: String,
  })
  @Delete("/:calendar/events/:eventUid")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(ApiAuthGuard, PermissionsGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Delete a calendar event",
    description:
      "Delete/cancel an event on the authenticated user's calendar. Currently only Google Calendar is supported.",
  })
  async deleteCalendarEvent(
    @Param("calendar") calendar: string,
    @Param("eventUid") eventUid: string,
    @GetUser("id") userId: number
  ): Promise<void> {
    await this.unifiedCalendarService.deleteEvent(calendar, userId, "primary", eventUid);
  }

  @ApiParam({ name: "calendar", enum: UNIFIED_CALENDAR_PARAM, type: String })
  @Get("/:calendar/freebusy")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiAuthGuard, PermissionsGuard)
  @ApiHeader(API_KEY_OR_ACCESS_TOKEN_HEADER)
  @ApiOperation({
    summary: "Get free/busy times",
    description:
      "Get busy time slots for the authenticated user's selected calendars in the given date range. Currently only Google Calendar is supported.",
  })
  @ApiQuery({ name: "from", required: true, type: String })
  @ApiQuery({ name: "to", required: true, type: String })
  @ApiQuery({ name: "timeZone", required: false, type: String })
  async getFreeBusy(
    @Param("calendar") calendar: string,
    @GetUser("id") userId: number,
    @Query() query: FreebusyUnifiedInput
  ): Promise<GetBusyTimesOutput> {
    const timezone = query.timeZone ?? "UTC";
    const data = await this.unifiedCalendarService.getFreeBusy(calendar, userId, query.from, query.to, timezone);
    return { status: SUCCESS_STATUS, data };
  }
}
