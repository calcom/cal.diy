import type { appDataSchemas } from "@calcom/app-store/apps.schemas.generated";
import { DailyLocationType } from "@calcom/app-store/constants";
import { eventTypeAppMetadataOptionalSchema } from "@calcom/app-store/zod-utils";
import { CalVideoSettingsRepository } from "@calcom/features/calVideoSettings/repositories/CalVideoSettingsRepository";
import { HashedLinkRepository } from "@calcom/features/hashedLink/lib/repository/HashedLinkRepository";
import { HashedLinkService } from "@calcom/features/hashedLink/lib/service/HashedLinkService";
import { MembershipRepository } from "@calcom/features/membership/repositories/MembershipRepository";
import { ScheduleRepository } from "@calcom/features/schedules/repositories/ScheduleRepository";
import tasker from "@calcom/features/tasker";
import { getTranslation } from "@calcom/i18n/server";
import { validateIntervalLimitOrder } from "@calcom/lib/intervalLimits/validateIntervalLimitOrder";
import logger from "@calcom/lib/logger";
import { validateBookerLayouts } from "@calcom/lib/validateBookerLayouts";
import type { PrismaClient } from "@calcom/prisma";
import { Prisma } from "@calcom/prisma/client";
import { EventTypeAutoTranslatedField, RRTimestampBasis, SchedulingType } from "@calcom/prisma/enums";
import { eventTypeLocations } from "@calcom/prisma/zod-utils";
import { TRPCError } from "@trpc/server";
import type { GetServerSidePropsContext, NextApiResponse } from "next";
import type { TrpcSessionUser } from "../../../../types";
import { setDestinationCalendarHandler } from "../../../viewer/calendars/setDestinationCalendar.handler";
import {
  ensureEmailOrPhoneNumberIsPresent,
  ensureUniqueBookingFields,
  handleCustomInputs,
  handlePeriodType,
} from "../util";
import handleChildrenEventTypes from "./handleChildrenEventTypes";
import type { TUpdateInputSchema } from "./update.schema";

const isUrlScanningEnabled = (..._args: unknown[]) => false;
const allowDisablingHostConfirmationEmails = (..._args: unknown[]): boolean => false;
const allowDisablingAttendeeConfirmationEmails = (..._args: unknown[]): boolean => false;

type SessionUser = NonNullable<TrpcSessionUser>;

type User = {
  id: SessionUser["id"];
  username: SessionUser["username"];
  profile: {
    id: SessionUser["profile"]["id"] | null;
  };
  userLevelSelectedCalendars: SessionUser["userLevelSelectedCalendars"];
  organizationId: number | null;
  email: SessionUser["email"];
  locale: string;
};

type UpdateOptions = {
  ctx: {
    user: User;
    res?: NextApiResponse | GetServerSidePropsContext["res"];
    prisma: PrismaClient;
  };
  input: TUpdateInputSchema;
};

export type UpdateEventTypeReturn = Awaited<ReturnType<typeof updateHandler>>;

export const updateHandler = async ({ ctx, input }: UpdateOptions) => {
  const {
    schedule,
    instantMeetingSchedule,
    periodType,
    locations,
    bookingLimits,
    durationLimits,
    maxActiveBookingsPerBooker,
    destinationCalendar,
    customInputs,
    recurringEvent,
    eventTypeColor,
    users,
    children,
    assignAllTeamMembers,
    hosts,
    id,
    multiplePrivateLinks,
    // Extract this from the input so it doesn't get saved in the db
    // eslint-disable-next-line
    userId,
    bookingFields,
    offsetStart,
    secondaryEmailId,
    isRRWeightsEnabled,
    autoTranslateDescriptionEnabled,
    autoTranslateInstantMeetingTitleEnabled,
    description: newDescription,
    title: newTitle,
    seatsPerTimeSlot,
    restrictionScheduleId,
    calVideoSettings,
    hostGroups,
    enablePerHostLocations,
    ...rest
  } = input;

  const eventType = await ctx.prisma.eventType.findUniqueOrThrow({
    where: { id },
    select: {
      title: true,
      locations: true,
      description: true,
      seatsPerTimeSlot: true,
      recurringEvent: true,
      maxActiveBookingsPerBooker: true,
      fieldTranslations: {
        select: {
          field: true,
        },
      },
      isRRWeightsEnabled: true,
      hosts: {
        select: {
          userId: true,
          priority: true,
          weight: true,
          isFixed: true,
        },
      },
      calVideoSettings: {
        select: {
          disableRecordingForOrganizer: true,
          disableRecordingForGuests: true,
          enableAutomaticTranscription: true,
          enableAutomaticRecordingForOrganizer: true,
          requireEmailForGuests: true,
          disableTranscriptionForGuests: true,
          disableTranscriptionForOrganizer: true,
          redirectUrlOnExit: true,
        },
      },
      children: {
        select: {
          userId: true,
        },
      },
      hostGroups: {
        select: {
          id: true,
          name: true,
        },
      },
      team: {
        select: {
          id: true,
          name: true,
          slug: true,
          parentId: true,
          rrTimestampBasis: true,
          parent: {
            select: {
              slug: true,
            },
          },
          members: {
            select: {
              role: true,
              accepted: true,
              user: {
                select: {
                  name: true,
                  id: true,
                  email: true,
                  eventTypes: {
                    select: {
                      slug: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (input.teamId && eventType.team?.id && input.teamId !== eventType.team.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const finalSeatsPerTimeSlot =
    seatsPerTimeSlot === undefined ? eventType.seatsPerTimeSlot : seatsPerTimeSlot;
  const finalRecurringEvent = recurringEvent === undefined ? eventType.recurringEvent : recurringEvent;

  if (finalSeatsPerTimeSlot && finalRecurringEvent) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Recurring Events and Offer Seats cannot be active at the same time.",
    });
  }

  const teamId = input.teamId || eventType.team?.id;
  const guestsField = bookingFields?.find((field) => field.name === "guests");

  ensureUniqueBookingFields(bookingFields);
  ensureEmailOrPhoneNumberIsPresent(bookingFields);

  if (autoTranslateDescriptionEnabled && !ctx.user.organizationId) {
    logger.error(
      "Auto-translating description requires an organization. This should not happen - UI controls should prevent this state."
    );
  }

  const isLoadBalancingDisabled = !!(
    (eventType.team?.rrTimestampBasis && eventType.team?.rrTimestampBasis !== RRTimestampBasis.CREATED_AT) ||
    (hostGroups && hostGroups.length > 1) ||
    (!hostGroups && eventType.hostGroups && eventType.hostGroups.length > 1)
  );

  const data: Prisma.EventTypeUpdateInput = {
    ...rest,
    // Only update autoTranslateInstantMeetingTitleEnabled when explicitly provided to avoid overwriting saved opt-out
    ...(autoTranslateInstantMeetingTitleEnabled !== undefined && { autoTranslateInstantMeetingTitleEnabled }),
    // Only set if explicitly provided to avoid overwriting existing value with false
    ...(autoTranslateDescriptionEnabled !== undefined && {
      autoTranslateDescriptionEnabled: Boolean(ctx.user.organizationId && autoTranslateDescriptionEnabled),
    }),
    description: newDescription,
    title: newTitle,
    bookingFields:
      bookingFields === null ? Prisma.DbNull : (bookingFields as Prisma.InputJsonValue | undefined),
    maxActiveBookingsPerBooker,
    isRRWeightsEnabled,
    rrSegmentQueryValue:
      rest.rrSegmentQueryValue === null ? Prisma.DbNull : (rest.rrSegmentQueryValue as Prisma.InputJsonValue),
    metadata: rest.metadata === null ? Prisma.DbNull : (rest.metadata as Prisma.InputJsonObject),
    eventTypeColor: eventTypeColor === null ? Prisma.DbNull : (eventTypeColor as Prisma.InputJsonObject),
    // Only set disableGuests if bookingFields is explicitly provided to avoid overwriting existing value
    ...(bookingFields !== undefined && {
      disableGuests: guestsField?.hidden ?? false,
    }),
    seatsPerTimeSlot,
    maxLeadThreshold: isLoadBalancingDisabled ? null : rest.maxLeadThreshold,
    ...(enablePerHostLocations !== undefined && { enablePerHostLocations }),
  };
  data.locations = locations ?? undefined;

  if (periodType) {
    data.periodType = handlePeriodType(periodType);
  }

  if (recurringEvent) {
    data.recurringEvent = {
      dstart: recurringEvent.dtstart as unknown as Prisma.InputJsonObject,
      interval: recurringEvent.interval,
      count: recurringEvent.count,
      freq: recurringEvent.freq,
      until: recurringEvent.until as unknown as Prisma.InputJsonObject,
      tzid: recurringEvent.tzid,
    };
  } else if (recurringEvent === null) {
    data.recurringEvent = Prisma.DbNull;
  }

  if (destinationCalendar) {
    /** We connect or create a destination calendar to the event type instead of the user */
    await setDestinationCalendarHandler({
      ctx,
      input: {
        ...destinationCalendar,
        eventTypeId: id,
      },
    });
  }

  if (customInputs) {
    data.customInputs = handleCustomInputs(customInputs, id);
  }

  if (bookingLimits) {
    const isValid = validateIntervalLimitOrder(bookingLimits);
    if (!isValid)
      throw new TRPCError({ code: "BAD_REQUEST", message: "Booking limits must be in ascending order." });
    data.bookingLimits = bookingLimits;
  }

  if (maxActiveBookingsPerBooker) {
    if (maxActiveBookingsPerBooker && maxActiveBookingsPerBooker < 1) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Booker booking limit must be greater than 0." });
    }

    if (maxActiveBookingsPerBooker && (recurringEvent || eventType.recurringEvent)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Recurring Events and booker active bookings limit cannot be active at the same time.",
      });
    }

    if (eventType.maxActiveBookingsPerBooker && recurringEvent) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Recurring Events and booker active bookings limit cannot be active at the same time.",
      });
    }

    data.maxActiveBookingsPerBooker = maxActiveBookingsPerBooker;
  }

  if (durationLimits) {
    const isValid = validateIntervalLimitOrder(durationLimits);
    if (!isValid)
      throw new TRPCError({ code: "BAD_REQUEST", message: "Duration limits must be in ascending order." });
    data.durationLimits = durationLimits;
  }

  if (offsetStart !== undefined) {
    if (offsetStart < 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Offset start time must be zero or greater." });
    }
    data.offsetStart = offsetStart;
  }

  const bookerLayoutsError = validateBookerLayouts(input.metadata?.bookerLayouts || null);
  if (bookerLayoutsError) {
    const t = await getTranslation("en", "common");
    throw new TRPCError({ code: "BAD_REQUEST", message: t(bookerLayoutsError) });
  }

  if (schedule) {
    // Check that the schedule belongs to the user
    const userScheduleQuery = await ctx.prisma.schedule.findFirst({
      where: {
        userId: ctx.user.id,
        id: schedule,
      },
    });
    if (userScheduleQuery) {
      data.schedule = {
        connect: {
          id: schedule,
        },
      };
    }
  }
  // allows unsetting a schedule through { schedule: null, ... }
  else if (null === schedule || schedule === 0) {
    data.schedule = {
      disconnect: true,
    };
  }

  if (instantMeetingSchedule) {
    data.instantMeetingSchedule = {
      connect: {
        id: instantMeetingSchedule,
      },
    };
  } else if (schedule === null) {
    data.instantMeetingSchedule = {
      disconnect: true,
    };
  }

  const membershipRepo = new MembershipRepository(ctx.prisma);

  if (restrictionScheduleId) {
    // Verify that the user owns the restriction schedule or is a team member
    const scheduleRepo = new ScheduleRepository(ctx.prisma);
    const restrictionSchedule = await scheduleRepo.findScheduleByIdForOwnershipCheck({
      scheduleId: restrictionScheduleId,
    });
    // If the user doesn't own the schedule, check if they're a team member
    if (restrictionSchedule?.userId !== ctx.user.id) {
      if (!teamId || !restrictionSchedule) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "The restriction schedule is not owned by you or your team",
        });
      }
      const hasMembership = await membershipRepo.hasMembership({
        teamId,
        userId: restrictionSchedule.userId,
      });
      if (!hasMembership) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "The restriction schedule is not owned by you or your team",
        });
      }
    }

    data.restrictionSchedule = {
      connect: {
        id: restrictionScheduleId,
      },
    };
  } else if (restrictionScheduleId === null || restrictionScheduleId === 0) {
    data.restrictionSchedule = {
      disconnect: true,
    };
  }

  if (users?.length) {
    data.users = {
      set: [],
      connect: users.map((userId: number) => ({ id: userId })),
    };
  }

  // Handle hostGroups updates
  if (hostGroups !== undefined) {
    const existingHostGroups = await ctx.prisma.hostGroup.findMany({
      where: {
        eventTypeId: id,
      },
      select: {
        id: true,
        name: true,
      },
    });

    const existingGroupsMap = new Map(existingHostGroups.map((group) => [group.id, group]));
    const newGroupsMap = new Map(hostGroups.map((group) => [group.id, group]));

    const groupsToCreate = hostGroups.filter((group) => !existingGroupsMap.has(group.id));
    const groupsToUpdate = hostGroups.filter((group) => existingGroupsMap.has(group.id));
    const groupsToDelete = existingHostGroups.filter((existingGroup) => !newGroupsMap.has(existingGroup.id));

    await ctx.prisma.$transaction(async (tx) => {
      // Create new groups
      if (groupsToCreate.length > 0) {
        await tx.hostGroup.createMany({
          data: groupsToCreate.map((group) => ({
            id: group.id,
            name: group.name,
            eventTypeId: id,
          })),
        });
      }

      // Update existing groups
      for (const group of groupsToUpdate) {
        await tx.hostGroup.update({
          where: { id: group.id },
          data: { name: group.name },
        });
      }

      // Delete groups that are no longer in the new list
      if (groupsToDelete.length > 0) {
        await tx.hostGroup.deleteMany({
          where: {
            id: {
              in: groupsToDelete.map((group) => group.id),
            },
          },
        });
      }
    });
  }

  let hostLocationDeletions: { userId: number; eventTypeId: number }[] = [];

  if (teamId && hosts) {
    // check if all hosts can be assigned (memberships that have accepted invite)
    const teamMemberIds = await membershipRepo.listAcceptedTeamMemberIds({ teamId });
    const teamMemberIdSet = new Set(teamMemberIds);
    if (!hosts.every((host) => teamMemberIdSet.has(host.userId)) && !eventType.team?.parentId) {
      throw new TRPCError({
        code: "FORBIDDEN",
      });
    }

    const oldHostsSet = new Set(eventType.hosts.map((oldHost) => oldHost.userId));
    const newHostsSet = new Set(hosts.map((oldHost) => oldHost.userId));

    const existingHosts = hosts.filter((newHost) => oldHostsSet.has(newHost.userId));
    hostLocationDeletions = existingHosts
      .filter((host) => host.location === null)
      .map((host) => ({ userId: host.userId, eventTypeId: id }));
    const newHosts = hosts.filter((newHost) => !oldHostsSet.has(newHost.userId));
    const removedHosts = eventType.hosts.filter((oldHost) => !newHostsSet.has(oldHost.userId));

    data.hosts = {
      deleteMany: {
        OR: removedHosts.map((host) => ({
          userId: host.userId,
          eventTypeId: id,
        })),
      },
      create: newHosts.map((host) => {
        const hostData: {
          userId: number;
          isFixed: boolean;
          priority: number;
          weight: number;
          groupId: string | null | undefined;
          scheduleId?: number | null | undefined;
          location?: {
            create: {
              type: string;
              credentialId: number | null | undefined;
              link: string | null | undefined;
              address: string | null | undefined;
              phoneNumber: string | null | undefined;
            };
          };
        } = {
          userId: host.userId,
          isFixed: data.schedulingType === SchedulingType.COLLECTIVE || host.isFixed || false,
          priority: host.priority ?? 2,
          weight: host.weight ?? 100,
          groupId: host.groupId,
          scheduleId: host.scheduleId ?? null,
        };
        if (host.location) {
          hostData.location = {
            create: {
              type: host.location.type,
              credentialId: host.location.credentialId,
              link: host.location.link,
              address: host.location.address,
              phoneNumber: host.location.phoneNumber,
            },
          };
        }
        return hostData;
      }),
      update: existingHosts.map((host) => {
        const updateData: {
          isFixed: boolean | undefined;
          priority: number;
          weight: number;
          scheduleId: number | null | undefined;
          groupId: string | null | undefined;
          location?: {
            upsert: {
              create: {
                type: string;
                credentialId: number | null | undefined;
                link: string | null | undefined;
                address: string | null | undefined;
                phoneNumber: string | null | undefined;
              };
              update: {
                type: string;
                credentialId: number | null | undefined;
                link: string | null | undefined;
                address: string | null | undefined;
                phoneNumber: string | null | undefined;
              };
            };
          };
        } = {
          isFixed: data.schedulingType === SchedulingType.COLLECTIVE || host.isFixed,
          priority: host.priority ?? 2,
          weight: host.weight ?? 100,
          scheduleId: host.scheduleId === undefined ? undefined : host.scheduleId,
          groupId: host.groupId,
        };
        if (host.location) {
          updateData.location = {
            upsert: {
              create: {
                type: host.location.type,
                credentialId: host.location.credentialId,
                link: host.location.link,
                address: host.location.address,
                phoneNumber: host.location.phoneNumber,
              },
              update: {
                type: host.location.type,
                credentialId: host.location.credentialId,
                link: host.location.link,
                address: host.location.address,
                phoneNumber: host.location.phoneNumber,
              },
            },
          };
        }
        return {
          where: {
            userId_eventTypeId: {
              userId: host.userId,
              eventTypeId: id,
            },
          },
          data: updateData,
        };
      }),
    };
  }

  if (input.metadata?.disableStandardEmails?.all) {
    if (!eventType?.team?.parentId) {
      input.metadata.disableStandardEmails.all.host = false;
      input.metadata.disableStandardEmails.all.attendee = false;
    }
  }

  if (input.metadata?.disableStandardEmails?.confirmation) {
    // Workflows feature removed - always disallow disabling standard emails
    input.metadata.disableStandardEmails.confirmation.host = false;
    input.metadata.disableStandardEmails.confirmation.attendee = false;
  }

  const apps = eventTypeAppMetadataOptionalSchema.parse(input.metadata?.apps);
  for (const appKey in apps) {
    const app = apps[appKey as keyof typeof appDataSchemas] as
      | { enabled?: boolean; price?: number; currency?: string }
      | undefined;
    // There should only be one enabled payment app in the metadata
    if (app?.enabled && app.price && app.currency) {
      data.price = app.price;
      data.currency = app.currency;
      break;
    }
  }
  // Handle multiple private links using the service
  const privateLinksRepo = HashedLinkRepository.create();
  const connectedLinks = await privateLinksRepo.findLinksByEventTypeId(input.id);
  const connectedMultiplePrivateLinks = connectedLinks.map((link) => link.link);

  const privateLinksService = new HashedLinkService();
  await privateLinksService.handleMultiplePrivateLinks({
    eventTypeId: input.id,
    multiplePrivateLinks,
    connectedMultiplePrivateLinks,
  });

  if (assignAllTeamMembers !== undefined) {
    data.assignAllTeamMembers = assignAllTeamMembers;
  }

  // Validate the secondary email
  if (secondaryEmailId) {
    const secondaryEmail = await ctx.prisma.secondaryEmail.findUnique({
      where: {
        id: secondaryEmailId,
        userId: ctx.user.id,
      },
    });
    // Make sure the secondary email id belongs to the current user and its a verified one
    if (secondaryEmail?.emailVerified) {
      data.secondaryEmail = {
        connect: {
          id: secondaryEmailId,
        },
      };
      // Delete the data if the user selected his original email to send the events to, which means the value coming will be -1
    } else if (secondaryEmailId === -1) {
      data.secondaryEmail = {
        disconnect: true,
      };
    }
  }

  if (calVideoSettings) {
    await CalVideoSettingsRepository.createOrUpdateCalVideoSettings({
      eventTypeId: id,
      calVideoSettings,
    });
  }

  const parsedEventTypeLocations = eventTypeLocations.safeParse(eventType.locations ?? []);

  const isCalVideoLocationActive = locations
    ? locations.some((location) => location.type === DailyLocationType)
    : parsedEventTypeLocations.success &&
      parsedEventTypeLocations.data?.some((location) => location.type === DailyLocationType);

  if (eventType.calVideoSettings && !isCalVideoLocationActive) {
    await CalVideoSettingsRepository.deleteCalVideoSettings(id);
  }

  // Logic for updating `fieldTranslations`
  // user has no translations OR user is changing the field
  const hasNoDescriptionTranslations =
    eventType.fieldTranslations.filter((trans) => trans.field === EventTypeAutoTranslatedField.DESCRIPTION)
      .length === 0;
  const description = newDescription ?? (hasNoDescriptionTranslations ? eventType.description : undefined);
  const hasNoTitleTranslations =
    eventType.fieldTranslations.filter((trans) => trans.field === EventTypeAutoTranslatedField.TITLE)
      .length === 0;
  const title = newTitle ?? (hasNoTitleTranslations ? eventType.title : undefined);

  if (ctx.user.organizationId && autoTranslateDescriptionEnabled && (title || description)) {
    await tasker.create("translateEventTypeData", {
      eventTypeId: id,
      description,
      title,
      userLocale: ctx.user.locale,
      userId: ctx.user.id,
    });
  }

  const updatedEventTypeSelect = {
    slug: true,
    schedulingType: true,
  } satisfies Prisma.EventTypeSelect;

  // Explicit type to avoid Prisma.EventTypeGetPayload conditional types leaking into .d.ts files
  type UpdatedEventTypeResult = {
    slug: string;
    schedulingType: import("@calcom/prisma/enums").SchedulingType | null;
  };

  let updatedEventType: UpdatedEventTypeResult;
  try {
    updatedEventType = await ctx.prisma.eventType.update({
      where: { id },
      data,
      select: updatedEventTypeSelect,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        // instead of throwing a 500 error, catch the conflict and throw a 400 error.
        throw new TRPCError({ message: "error_event_type_url_duplicate", code: "BAD_REQUEST" });
      }
    }
    throw e;
  }

  if (hostLocationDeletions.length > 0) {
    await ctx.prisma.hostLocation.deleteMany({
      where: {
        OR: hostLocationDeletions,
      },
    });
  }

  // Handling updates to children event types (managed events types).
  // Propagates the parent's locked managed props (including the `hidden` /
  // "Hide from profile" toggle) to the assigned child event types.
  await handleChildrenEventTypes({
    eventTypeId: id,
    updatedEventType,
    oldEventType: eventType,
    children,
    prisma: ctx.prisma,
  });

  // Clean up empty host groups
  if (hostGroups !== undefined || hosts) {
    await ctx.prisma.hostGroup.deleteMany({
      where: {
        eventTypeId: id,
        hosts: {
          none: {},
        },
      },
    });
  }

  const res = ctx.res as NextApiResponse;
  if (typeof res?.revalidate !== "undefined") {
    try {
      await res?.revalidate(`/${ctx.user.username}/${updatedEventType.slug}`);
    } catch (e) {
      // if reach this it is because the event type page has not been created, so it is not possible to revalidate it
      logger.debug((e as Error)?.message);
    }
  }
  return { eventType };
};
