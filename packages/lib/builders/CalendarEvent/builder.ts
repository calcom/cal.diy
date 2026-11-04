import dayjs from "@calcom/dayjs";
import { getTranslation } from "@calcom/i18n/server";
import { getRescheduleLink } from "@calcom/lib/CalEventParser";
import prisma from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import type { CalendarEvent } from "@calcom/types/Calendar";
import short from "short-uuid";
import { v5 as uuidv5 } from "uuid";
import { CalendarEventClass } from "./class";

const translator = short();
const userSelect = {
  id: true,
  email: true,
  name: true,
  username: true,
  timeZone: true,
  credentials: true,
  bufferTime: true,
  destinationCalendar: true,
  locale: true,
} satisfies Prisma.UserSelect;

// Single source of truth for user type
type User = Prisma.UserGetPayload<{ select: typeof userSelect }>;

// Base fields that are common between attendees and team members
interface PersonAttendeeCommonFields {
  id: number;
  email: string;
  name: string | null;
  locale: string | null;
  timeZone: string;
  username: string | null;
}

// Team members extend the common fields with language
interface TeamMember extends PersonAttendeeCommonFields {
  language: {
    translate: any;
    locale: string;
  };
}

// Add type for event type users that matches Prisma schema
type EventTypeUser = Prisma.UserGetPayload<{
  select: typeof userSelect;
}>;

interface ICalendarEventBuilder {
  calendarEvent: CalendarEventClass;
  eventType: Awaited<ReturnType<CalendarEventBuilder["getEventFromEventId"]>>;
  users: User[];
  attendeesList: PersonAttendeeCommonFields[];
  teamMembers: TeamMember[];
  rescheduleLink: string;
}

export class CalendarEventBuilder implements ICalendarEventBuilder {
  calendarEvent!: CalendarEventClass;
  eventType!: ICalendarEventBuilder["eventType"];
  users!: ICalendarEventBuilder["users"];
  attendeesList: ICalendarEventBuilder["attendeesList"] = [];
  teamMembers: ICalendarEventBuilder["teamMembers"] = [];
  rescheduleLink!: string;

  constructor() {
    this.reset();
  }

  private reset() {
    this.calendarEvent = new CalendarEventClass();
  }

  public init(initProps: CalendarEventClass) {
    this.calendarEvent = new CalendarEventClass(initProps);
  }

  public setEventType(eventType: ICalendarEventBuilder["eventType"]) {
    this.eventType = eventType;
  }

  public async buildEventObjectFromInnerClass(eventId: number) {
    const resultEvent = await this.getEventFromEventId(eventId);
    if (resultEvent) {
      this.eventType = resultEvent;
    }
  }

  public async buildUsersFromInnerClass() {
    if (!this.eventType) {
      throw new Error("exec BuildEventObjectFromInnerClass before calling this function");
    }
    const users = this.eventType.users;

    /* If this event was pre-relationship migration */
    if (!users.length && this.eventType.userId) {
      const eventTypeUser = await this.getUserById(this.eventType.userId);
      if (!eventTypeUser) {
        throw new Error("buildUsersFromInnerClass.eventTypeUser.notFound");
      }
      users.push(eventTypeUser);
    }
    this.setUsers(users);
  }

  public buildAttendeesList() {
    // Language Function was set on builder init
    this.attendeesList = [
      ...(this.calendarEvent.attendees as unknown as PersonAttendeeCommonFields[]),
      ...this.teamMembers,
    ];
  }

  private async getUserById(userId: number): Promise<User> {
    try {
      return await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: userSelect,
      });
    } catch (error) {
      throw new Error("getUsersById.users.notFound");
    }
  }

  private async getEventFromEventId(eventTypeId: number) {
    try {
      return await prisma.eventType.findUniqueOrThrow({
        where: { id: eventTypeId },
        select: {
          id: true,
          users: { select: userSelect },
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          description: true,
          slug: true,
          teamId: true,
          title: true,
          length: true,
          eventName: true,
          schedulingType: true,
          periodType: true,
          periodStartDate: true,
          periodEndDate: true,
          periodDays: true,
          periodCountCalendarDays: true,
          requiresConfirmation: true,
          userId: true,
          price: true,
          currency: true,
          metadata: true,
          destinationCalendar: true,
          hideCalendarNotes: true,
          hideCalendarEventDetails: true,
          disableCancelling: true,
          disableRescheduling: true,
        },
      });
    } catch (error) {
      throw new Error("Error while getting eventType");
    }
  }

  public async buildTeamMembers() {
    this.teamMembers = await this.getTeamMembers();
  }

  private async getTeamMembers(): Promise<TeamMember[]> {
    if (!this.users.length) {
      return [];
    }
    // Users[0] its organizer so we are omitting with slice(1)
    const teamMemberPromises = this.users.slice(1).map(async (user) => {
      if (!user) return null;
      const member: TeamMember = {
        id: user.id,
        username: user.username ?? null,
        email: user.email ?? "",
        name: user.name ?? "",
        timeZone: user.timeZone,
        locale: user.locale ?? "en",
        language: {
          translate: await getTranslation(user.locale ?? "en", "common"),
          locale: user.locale ?? "en",
        },
      };
      return member;
    });
    const members = await Promise.all(teamMemberPromises);
    return members.filter((member): member is TeamMember => member !== null);
  }

  public buildUIDCalendarEvent() {
    if (!this.users?.length) {
      throw new Error("call buildUsers before calling this function");
    }
    const [mainOrganizer] = this.users;
    if (!mainOrganizer?.username) {
      throw new Error("Organizer username is required");
    }
    const seed = `${mainOrganizer.username}:${dayjs(this.calendarEvent.startTime)
      .utc()
      .format()}:${new Date().getTime()}`;
    const uid = translator.fromUUID(uuidv5(seed, uuidv5.URL));
    this.calendarEvent.uid = uid;
  }

  public setLocation(location: CalendarEventClass["location"]) {
    this.calendarEvent.location = location;
  }

  public setUId(uid: CalendarEventClass["uid"]) {
    this.calendarEvent.uid = uid;
  }

  public setDestinationCalendar(destinationCalendar: CalendarEventClass["destinationCalendar"]) {
    this.calendarEvent.destinationCalendar = destinationCalendar;
  }

  public setHideCalendarNotes(hideCalendarNotes: CalendarEventClass["hideCalendarNotes"]) {
    this.calendarEvent.hideCalendarNotes = hideCalendarNotes;
  }

  public setHideCalendarEventDetails(
    hideCalendarEventDetails: CalendarEventClass["hideCalendarEventDetails"]
  ) {
    this.calendarEvent.hideCalendarEventDetails = hideCalendarEventDetails;
  }

  public setDescription(description: CalendarEventClass["description"]) {
    this.calendarEvent.description = description;
  }

  public setNotes(notes: CalendarEvent["additionalNotes"]) {
    this.calendarEvent.additionalNotes = notes;
  }

  public setCancellationReason(cancellationReason: CalendarEventClass["cancellationReason"]) {
    this.calendarEvent.cancellationReason = cancellationReason;
  }

  public setUsers(users: User[]) {
    this.users = users;
  }

  public async setUsersFromId(userId: User["id"]) {
    try {
      const resultUser = await this.getUserById(userId);
      this.setUsers([resultUser]);
    } catch (error) {
      throw new Error("getUsersById.users.notFound");
    }
  }

  public buildRescheduleLink({
    allowRescheduleForCancelledBooking = false,
  }: {
    allowRescheduleForCancelledBooking?: boolean;
  } = {}) {
    try {
      this.rescheduleLink = getRescheduleLink({
        calEvent: this.calendarEvent,
        allowRescheduleForCancelledBooking,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`buildRescheduleLink.error: ${error.message}`);
      }
    }
  }
}
