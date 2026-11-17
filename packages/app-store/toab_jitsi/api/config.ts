// Next.js API route reference: https://nextjs.org/docs/pages/building-your-application/routing/api-routes
import { getServerErrorFromUnknown } from "@calcom/lib/server/getServerErrorFromUnknown";
import prisma from "@calcom/prisma";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { canConfigureEventType } from "../lib/canConfigureEventType";
import { moderatorRequest } from "../lib/common";

const moderatorUserSchema: z.ZodType<{ id: number }> = z.object({ id: z.number().int().positive() });
const moderatorServerSchema: z.ZodType<
  Array<{ id: number; name: string; serverUrl: string; serverType: "CUSTOM" | "DEFAULT" }>
> = z.array(
  z.object({
    id: z.number().int().positive(),
    name: z.string(),
    serverUrl: z.string().min(1),
    serverType: z.enum(["CUSTOM", "DEFAULT"]),
  })
);

export default async function configHandler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });

  const sessionUserId = Number(req.session?.user?.id);
  if (!Number.isSafeInteger(sessionUserId) || sessionUserId <= 0) {
    return res.status(401).json({ message: "You must be signed in" });
  }

  const eventTypeId = Number(req.query.eventTypeId);
  if (!Number.isSafeInteger(eventTypeId) || eventTypeId <= 0) {
    return res.status(400).json({ message: "A valid eventTypeId is required" });
  }

  const eventType = await prisma.eventType.findUnique({
    where: { id: eventTypeId },
    select: {
      userId: true,
      teamId: true,
      owner: { select: { email: true } },
      hosts: {
        orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
        take: 1,
        select: { user: { select: { email: true } } },
      },
    },
  });
  if (!eventType) return res.status(404).json({ message: "Event type not found" });

  if (!(await canConfigureEventType({ sessionUserId, eventType }))) {
    return res.status(403).json({ message: "You cannot configure this event type" });
  }
  let organizerEmail: string | undefined;
  if (eventType.teamId) {
    organizerEmail = eventType.hosts[0]?.user.email;
  } else {
    organizerEmail = eventType.owner?.email;
  }
  if (!organizerEmail) {
    return res.status(404).json({ message: "Event organizer host has no email address" });
  }

  try {
    const user = moderatorUserSchema.parse(
      await moderatorRequest<unknown>(`/api/users/search?email=${encodeURIComponent(organizerEmail)}`)
    );
    const servers = moderatorServerSchema.parse(
      await moderatorRequest<unknown>(`/api/servers?userId=${user.id}`)
    );
    return res.status(200).json({ userId: user.id, servers });
  } catch (error: unknown) {
    let errorMessage = String(error);
    if (error instanceof Error) errorMessage = error.message;
    console.error("[toab_jitsi] config load failed", { eventTypeId, message: errorMessage });
    const serverError = getServerErrorFromUnknown(error);
    let statusCode = serverError.statusCode;
    if (statusCode >= 500) statusCode = 502;
    return res.status(statusCode).json({
      message: "Unable to load TOAB Jitsi servers from Moderator",
    });
  }
}
