import { v4 as uuidv4 } from "uuid";

import { selectOOOEntries } from "@calcom/app-store/zapier/api/subscriptions/listOOOEntries";
import dayjs from "@calcom/dayjs";
import { sendBookingRedirectNotification } from "@calcom/emails/workflow-email-service";
import type { GetSubscriberOptions } from "@calcom/features/webhooks/lib/getWebhooks";
import getWebhooks from "@calcom/features/webhooks/lib/getWebhooks";
import type { OOOEntryPayloadType } from "@calcom/features/webhooks/lib/sendPayload";
import sendPayload from "@calcom/features/webhooks/lib/sendPayload";
import { getTranslation } from "@calcom/i18n/server";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import prisma from "@calcom/prisma";
import { WebhookTriggerEvents } from "@calcom/prisma/enums";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";

import { TRPCError } from "@trpc/server";

import { isAdminForUser } from "./outOfOffice.utils";
import { type TOutOfOfficeInputSchema } from "./outOfOfficeCreateOrUpdate.schema";

type TBookingRedirect = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TOutOfOfficeInputSchema;
};

export const outOfOfficeCreateOrUpdate = async ({ ctx, input }: TBookingRedirect) => {
  const { startDate, endDate } = input.dateRange;
  if (!startDate || !endDate) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "start_date_and_end_date_required" });
  }

  const startTimeUtc = dayjs.utc(startDate).add(input.startDateOffset, "minute").startOf("day");
  const endTimeUtc = dayjs.utc(endDate).add(input.endDateOffset, "minute").endOf("day");

  // If start date is after end date throw error
  if (startTimeUtc.isAfter(endTimeUtc)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "start_date_must_be_before_end_date" });
  }

  let oooUserId = ctx.user.id;
  let oooUserName = ctx.user.username;
  let oooUserEmail = ctx.user.email;
  let oooUserTimeZone = ctx.user.timeZone;
  let oooUserOrgId = ctx.user.organizationId;
  let oooUserFullName = ctx.user.name;

  let isAdmin: boolean | undefined;
  if (input.forUserId) {
    isAdmin = await isAdminForUser(ctx.user.id, input.forUserId);
    if (!isAdmin) {
      throw new TRPCError({ code: "NOT_FOUND", message: "only_admin_can_create_ooo" });
    }
    oooUserId = input.forUserId;
    const oooForUser = await prisma.user.findUnique({
      where: { id: input.forUserId },
      select: { username: true, email: true, timeZone: true, organizationId: true, name: true },
    });
    if (oooForUser) {
      oooUserEmail = oooForUser.email;
      oooUserName = oooForUser.username;
      oooUserFullName = oooForUser.name;
      oooUserTimeZone = oooForUser.timeZone;
      oooUserOrgId = oooForUser.organizationId;
    }
  }

  let toUserId: number | null = null;

  if (input.toTeamUserId === oooUserId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "cannot_redirect_to_self" });
  }

  if (input.toTeamUserId) {
    const user = await prisma.user.findUnique({
      where: {
        id: input.toTeamUserId,
        /** You can only redirect OOO for members of teams you belong to */
        teams: {
          some: {
            team: {
              members: {
                some: {
                  userId: oooUserId,
                  accepted: true,
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
      },
    });
    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: input.forUserId ? "forward_to_team_member_only" : "user_not_found",
      });
    }
    toUserId = user?.id;
  }

  if (!input.reasonId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "reason_id_required" });
  }

  // Prevent infinite redirects but consider time ranges
  const existingOutOfOfficeEntry = await prisma.outOfOfficeEntry.findFirst({
    select: {
      userId: true,
      toUserId: true,
    },
    where: {
      ...(toUserId && { userId: toUserId }),
      toUserId: oooUserId,
      // Check for time overlap or collision
      OR: [
        // Outside of range
        {
          AND: [{ start: { lte: endTimeUtc.toISOString() } }, { end: { gte: startTimeUtc.toISOString() } }],
        },
        // Inside of range
        {
          AND: [{ start: { gte: startTimeUtc.toISOString() } }, { end: { lte: endTimeUtc.toISOString() } }],
        },
      ],
    },
  });

  // don't allow infinite redirects
  if (existingOutOfOfficeEntry) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: input.forUserId
        ? "ooo_team_redirect_infinite_not_allowed"
        : "booking_redirect_infinite_not_allowed",
    });
  }

  const isDuplicateOutOfOfficeEntry = await prisma.outOfOfficeEntry.findFirst({
    where: {
      userId: oooUserId,
      start: startTimeUtc.toISOString(),
      end: endTimeUtc.toISOString(),
    },
  });

  if (isDuplicateOutOfOfficeEntry && isDuplicateOutOfOfficeEntry?.uuid !== input.uuid) {
    throw new TRPCError({ code: "CONFLICT", message: "out_of_office_entry_already_exists" });
  }

  // Get the existing redirected user from existing out of office entry to send that user appropriate email.
  const previousOutOfOfficeEntry = await prisma.outOfOfficeEntry.findUnique({
    where: {
      uuid: input.uuid ?? "",
    },
    select: {
      start: true,
      end: true,
      toUser: {
        select: {
          email: true,
          username: true,
        },
      },
    },
  });

  const createdOrUpdatedOutOfOffice = await prisma.outOfOfficeEntry.upsert({
    where: {
      uuid: input.uuid ?? "",
      userId: oooUserId,
    },
    create: {
      uuid: uuidv4(),
      start: startTimeUtc.toISOString(),
      end: endTimeUtc.toISOString(),
      notes: input.notes,
      showNotePublicly: input.showNotePublicly ?? false,
      userId: oooUserId,
      reasonId: input.reasonId,
      toUserId: toUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      start: startTimeUtc.toISOString(),
      end: endTimeUtc.toISOString(),
      notes: input.notes,
      ...(input.showNotePublicly !== undefined && { showNotePublicly: input.showNotePublicly }),
      userId: oooUserId,
      reasonId: input.reasonId,
      toUserId: toUserId ? toUserId : null,
    },
  });
  // Explicit type to avoid Prisma.OutOfOfficeEntryGetPayload conditional types leaking into .d.ts files
  type OOOEntryResult = {
    id: number;
    start: Date;
    end: Date;
    createdAt: Date;
    updatedAt: Date;
    notes: string | null;
    showNotePublicly: boolean;
    reason: { reason: string; emoji: string } | null;
    reasonId: number | null;
    user: { id: number; name: string | null; email: string; timeZone: string };
    toUser: { id: number; name: string | null; email: string; timeZone: string } | null;
    uuid: string;
  };

  let resultRedirect: OOOEntryResult | null = null;
  if (createdOrUpdatedOutOfOffice) {
    const findRedirect = await prisma.outOfOfficeEntry.findUnique({
      where: {
        uuid: createdOrUpdatedOutOfOffice.uuid,
      },
      select: selectOOOEntries,
    });
    if (findRedirect) {
      resultRedirect = findRedirect;
    }
  }
  if (!resultRedirect) {
    return;
  }
  const toUser = toUserId
    ? await prisma.user.findUnique({
        where: {
          id: toUserId,
        },
        select: {
          name: true,
          username: true,
          timeZone: true,
          email: true,
        },
      })
    : null;
  const reason = await prisma.outOfOfficeReason.findUnique({
    where: {
      id: input.reasonId,
    },
    select: {
      reason: true,
      emoji: true,
    },
  });
  if (toUserId) {
    // await send email to notify user
    const userToNotify = await prisma.user.findUnique({
      where: {
        id: toUserId,
      },
      select: {
        email: true,
        username: true,
      },
    });
    const t = await getTranslation(ctx.user.locale ?? "en", "common");
    const formattedStartDate = new Intl.DateTimeFormat("en-US").format(createdOrUpdatedOutOfOffice.start);
    const formattedEndDate = new Intl.DateTimeFormat("en-US").format(createdOrUpdatedOutOfOffice.end);

    const existingFormattedStartDate = previousOutOfOfficeEntry
      ? new Intl.DateTimeFormat("en-US").format(previousOutOfOfficeEntry.start)
      : "";
    const existingFormattedEndDate = previousOutOfOfficeEntry
      ? new Intl.DateTimeFormat("en-US").format(previousOutOfOfficeEntry.end)
      : "";

    const existingRedirectedUser = previousOutOfOfficeEntry?.toUser
      ? previousOutOfOfficeEntry.toUser
      : undefined;

    // Send cancel email to the old redirect user if it is not same as the current redirect user.
    if (existingRedirectedUser && existingRedirectedUser?.email !== userToNotify?.email) {
      await sendBookingRedirectNotification({
        language: t,
        fromEmail: oooUserEmail,
        eventOwner: oooUserName || oooUserEmail,
        toEmail: existingRedirectedUser.email,
        toName: existingRedirectedUser.username || "",
        dates: `${existingFormattedStartDate} - ${existingFormattedEndDate}`,
        action: "cancel",
      });
    }

    if (userToNotify?.email) {
      // If new redirect user exists and it is same as the old redirect user, then send update email.
      if (
        existingRedirectedUser &&
        existingRedirectedUser.email === userToNotify.email &&
        (formattedStartDate !== existingFormattedStartDate || formattedEndDate !== existingFormattedEndDate)
      ) {
        await sendBookingRedirectNotification({
          language: t,
          fromEmail: oooUserEmail,
          eventOwner: oooUserName || oooUserEmail,
          toEmail: userToNotify.email,
          toName: userToNotify.username || "",
          oldDates: `${existingFormattedStartDate} - ${existingFormattedEndDate}`,
          dates: `${formattedStartDate} - ${formattedEndDate}`,
          action: "update",
        });
        // If new redirect user exists and the previous redirect user didn't existed or the previous redirect user is not same as the new user, then send add email.
      } else if (
        !existingRedirectedUser ||
        (existingRedirectedUser && existingRedirectedUser.email !== userToNotify.email)
      ) {
        await sendBookingRedirectNotification({
          language: t,
          fromEmail: oooUserEmail,
          eventOwner: oooUserName || oooUserEmail,
          toEmail: userToNotify.email,
          toName: userToNotify.username || "",
          dates: `${formattedStartDate} - ${formattedEndDate}`,
          action: "add",
        });
      }
    }
  }

  const memberships = await prisma.membership.findMany({
    where: {
      userId: oooUserId,
      accepted: true,
    },
  });

  const teamIds = memberships.map((membership) => membership.teamId);

  // Send webhook to notify other services
  const subscriberOptions: GetSubscriberOptions = {
    userId: oooUserId,
    teamId: teamIds,
    orgId: oooUserOrgId,
    triggerEvent: WebhookTriggerEvents.OOO_CREATED,
  };

  const subscribers = await getWebhooks(subscriberOptions);

  const payload: OOOEntryPayloadType = {
    oooEntry: {
      id: createdOrUpdatedOutOfOffice.id,
      start: dayjs(createdOrUpdatedOutOfOffice.start)
        .tz(oooUserTimeZone, true)
        .format("YYYY-MM-DDTHH:mm:ssZ"),
      end: dayjs(createdOrUpdatedOutOfOffice.end).tz(oooUserTimeZone, true).format("YYYY-MM-DDTHH:mm:ssZ"),
      createdAt: createdOrUpdatedOutOfOffice.createdAt.toISOString(),
      updatedAt: createdOrUpdatedOutOfOffice.updatedAt.toISOString(),
      notes: createdOrUpdatedOutOfOffice.notes,
      reason: {
        emoji: reason?.emoji,
        reason: reason?.reason,
      },
      reasonId: input.reasonId,
      user: {
        id: oooUserId,
        name: oooUserFullName,
        username: oooUserName,
        email: oooUserEmail,
        timeZone: oooUserTimeZone,
      },
      toUser: toUserId
        ? {
            id: toUserId,
            name: toUser?.name,
            username: toUser?.username,
            email: toUser?.email,
            timeZone: toUser?.timeZone,
          }
        : null,
      uuid: createdOrUpdatedOutOfOffice.uuid,
    },
  };

  await Promise.all(
    subscribers.map((subscriber) =>
      sendPayload(
        subscriber.secret,
        WebhookTriggerEvents.OOO_CREATED,
        dayjs().toISOString(),
        {
          appId: subscriber.appId,
          subscriberUrl: subscriber.subscriberUrl,
          payloadTemplate: subscriber.payloadTemplate,
          version: subscriber.version,
        },
        payload
      ).catch((e) => {
        logger.error(
          `Error executing webhook for event: ${WebhookTriggerEvents.OOO_CREATED}, URL: ${subscriber.subscriberUrl}, ooo uuid: ${createdOrUpdatedOutOfOffice.uuid}`,
          safeStringify(e)
        );
      })
    )
  );

  return {};
};
