import { z } from "zod";
import { MembershipStatus } from "@calcom/prisma/enums";

export const ZUpdateMembershipStatusInput = z.object({
  userId: z.number(),
  teamId: z.number(),
  status: z.nativeEnum(MembershipStatus),
});
