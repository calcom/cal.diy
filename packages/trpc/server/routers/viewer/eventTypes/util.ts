import type { EventTypeRepository } from "@calcom/features/eventtypes/repositories/eventTypeRepository";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import { markdownToSafeHTML } from "@calcom/lib/markdownToSafeHTML";
import prisma from "@calcom/prisma";
import type { MembershipRole } from "@calcom/prisma/enums";
import { PeriodType } from "@calcom/prisma/enums";
import type { CustomInputSchema } from "@calcom/prisma/zod-utils";
import { EventTypeMetaDataSchema } from "@calcom/prisma/zod-utils";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import authedProcedure from "../../../procedures/authedProcedure";
import type { TUpdateInputSchema } from "./types";

type PermissionString = string;
class PermissionCheckService {
  constructor(private readonly _prismaClient?: typeof prisma) {}
  async checkPermission({
    userId,
    teamId,
    fallbackRoles,
  }: {
    userId: number;
    teamId: number;
    permission: string;
    fallbackRoles?: string[];
  }): Promise<boolean> {
    const client = this._prismaClient ?? prisma;
    const membership = await client.membership.findFirst({
      where: {
        userId,
        teamId,
        accepted: true,
        ...(fallbackRoles && fallbackRoles.length > 0 ? { role: { in: fallbackRoles as import("@calcom/prisma/enums").MembershipRole[] } } : {}),
      },
      select: { id: true },
    });
    return membership !== null;
  }
  async hasPermission(..._args: unknown[]) { return true; }
  async getTeamIdsWithPermission(..._args: unknown[]): Promise<number[]> { return []; }
}

type EventType = Awaited<ReturnType<EventTypeRepository["findAllByUpId"]>>[number];

export const eventOwnerProcedure = authedProcedure
  .input(
    z
      .object({
        id: z.number().optional(),
        eventTypeId: z.number().optional(),
        users: z.array(z.number()).optional().default([]),
      })
      .refine((data) => data.id !== undefined || data.eventTypeId !== undefined, {
        message: "At least one of 'id' or 'eventTypeId' must be present",
        path: ["id", "eventTypeId"],
      })
  )
  .use(async ({ ctx, input, next }) => {
    const id = input.eventTypeId ?? input.id;
    // Prevent non-owners to update/delete a team event
    const event = await ctx.prisma.eventType.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
          },
        },
        team: {
          select: {
            members: {
              select: {
                userId: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!event) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    const isAuthorized = (() => {
      if (event.team) {
        const teamMember = event.team.members.find((member) => member.userId === ctx.user.id);
        const isOwnerOrAdmin = teamMember?.role === "ADMIN" || teamMember?.role === "OWNER";

        return isOwnerOrAdmin;
      }
      return event.userId === ctx.user.id || event.users.find((user) => user.id === ctx.user.id);
    })();

    if (!isAuthorized) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const isAllowed = (() => {
      if (event.team) {
        const allTeamMembers = event.team.members.map((member) => member.userId);
        return input.users.every((userId: number) => allTeamMembers.includes(userId));
      }
      return input.users.every((userId: number) => userId === ctx.user.id);
    })();

    if (!isAllowed) {
      console.warn(
        `User ${ctx.user.id} attempted to an create an event for users ${input.users.join(", ")}.`
      );
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    return next();
  });

/**
 * Creates an event admin procedure with configurable permissions
 * @param permission - The specific permission required (e.g., "eventType.manage", "eventType.update")
 * @param fallbackRoles - Roles to check when PBAC is disabled (defaults to ["ADMIN", "OWNER"])
 * @returns A procedure that checks the specified permission
 */
export const createEventPbacProcedure = (
  permission: PermissionString,
  fallbackRoles: MembershipRole[] = ["ADMIN", "OWNER"]
) => {
  return authedProcedure
    .input(
      z
        .object({
          id: z.number().optional(),
          eventTypeId: z.number().optional(),
          users: z.array(z.number()).optional(),
        })
        .refine((data) => data.id !== undefined || data.eventTypeId !== undefined, {
          message: "At least one of 'id' or 'eventTypeId' must be present",
          path: ["id", "eventTypeId"],
        })
    )
    .use(async ({ ctx, input, next }) => {
      const id = input.eventTypeId ?? input.id;

      const event = await ctx.prisma.eventType.findUnique({
        where: { id },
        select: {
          id: true,
          userId: true,
          teamId: true,
          users: {
            select: {
              id: true,
            },
          },
          team: {
            select: {
              members: {
                select: {
                  userId: true,
                },
              },
            },
          },
        },
      });

      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Check if user has permission to access/modify this event
      if (!event.teamId) {
        // Personal event - must be owner or assigned user
        if (event.userId !== ctx.user.id && !event.users.find((user) => user.id === ctx.user.id)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Permission required: ${permission}`,
          });
        }
      } else {
        // Team event - check PBAC/fallback permissions
        const permissionCheckService = new PermissionCheckService();
        const hasPermission = await permissionCheckService.checkPermission({
          userId: ctx.user.id,
          teamId: event.teamId,
          permission,
          fallbackRoles,
        });

        if (!hasPermission) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Permission required: ${permission}`,
          });
        }
      }

      // Validate that assigned users are allowed
      if (input.users && input.users.length > 0) {
        const isAllowed = (() => {
          if (event.team) {
            const allTeamMembers = event.team.members.map((member) => member.userId);
            return input.users?.every((userId: number) => allTeamMembers.includes(userId)) ?? true;
          }
          return input.users?.every((userId: number) => userId === ctx.user.id) ?? true;
        })();

        if (!isAllowed) {
          console.warn(
            `User ${ctx.user.id} attempted to assign event ${event.id} to users ${input.users.join(", ")}.`
          );
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot assign event to users outside of team membership",
          });
        }
      }

      return next();
    });
};

export function isPeriodType(keyInput: string): keyInput is PeriodType {
  return Object.keys(PeriodType).includes(keyInput);
}

export function handlePeriodType(periodType: string | undefined): PeriodType | undefined {
  if (typeof periodType !== "string") return undefined;
  const passedPeriodType = periodType.toUpperCase();
  if (!isPeriodType(passedPeriodType)) return undefined;
  return PeriodType[passedPeriodType];
}

export function handleCustomInputs(customInputs: CustomInputSchema[], eventTypeId: number) {
  const cInputsIdsToDeleteOrUpdated = customInputs.filter((input) => !input.hasToBeCreated);
  const cInputsIdsToDelete = cInputsIdsToDeleteOrUpdated.map((e) => e.id);
  const cInputsToCreate = customInputs
    .filter((input) => input.hasToBeCreated)
    .map((input) => ({
      type: input.type,
      label: input.label,
      required: input.required,
      placeholder: input.placeholder,
      options: input.options || undefined,
    }));
  const cInputsToUpdate = cInputsIdsToDeleteOrUpdated.map((input) => ({
    data: {
      type: input.type,
      label: input.label,
      required: input.required,
      placeholder: input.placeholder,
      options: input.options || undefined,
    },
    where: {
      id: input.id,
    },
  }));

  return {
    deleteMany: {
      eventTypeId,
      NOT: {
        id: { in: cInputsIdsToDelete },
      },
    },
    createMany: {
      data: cInputsToCreate,
    },
    update: cInputsToUpdate,
  };
}

export function ensureUniqueBookingFields(fields: TUpdateInputSchema["bookingFields"]) {
  if (!fields) {
    return;
  }

  fields.reduce(
    (discoveredFields, field) => {
      if (discoveredFields[field.name]) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Duplicate booking field name: ${field.name}`,
        });
      }

      discoveredFields[field.name] = true;

      return discoveredFields;
    },
    {} as Record<string, true>
  );
}

export function ensureEmailOrPhoneNumberIsPresent(fields: TUpdateInputSchema["bookingFields"]) {
  if (!fields || fields.length === 0) {
    return;
  }

  const attendeePhoneNumberField = fields.find((field) => field.name === "attendeePhoneNumber");

  const emailField = fields.find((field) => field.name === "email");

  if (emailField?.hidden && attendeePhoneNumberField?.hidden) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "booking_fields_email_and_phone_both_hidden",
    });
  }
  if (!emailField?.required && !attendeePhoneNumberField?.required) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "booking_fields_email_or_phone_required",
    });
  }
  if (emailField?.hidden && !attendeePhoneNumberField?.required) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "booking_fields_phone_required_when_email_hidden",
    });
  }
  if (attendeePhoneNumberField?.hidden && !emailField?.required) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "booking_fields_email_required_when_phone_hidden",
    });
  }
}

export const mapEventType = async (eventType: EventType) => ({
  ...eventType,
  safeDescription: eventType?.description ? markdownToSafeHTML(eventType.description) : undefined,
  users: await Promise.all(
    (eventType?.hosts?.length ? eventType.hosts.map((host) => host.user) : eventType.users).map(async (u) =>
      new UserRepository(prisma).enrichUserWithItsProfile({
        user: u,
      })
    )
  ),
  metadata: eventType.metadata ? EventTypeMetaDataSchema.parse(eventType.metadata) : null,
  children: await Promise.all(
    (eventType.children || []).map(async (c) => ({
      ...c,
      users: await Promise.all(
        c.users.map(
          async (u) =>
            await new UserRepository(prisma).enrichUserWithItsProfile({
              user: u,
            })
        )
      ),
    }))
  ),
});
