import { findUsersForAvailabilityCheck } from "@calcom/features/availability/lib/findUsersForAvailabilityCheck";
import { getUserAvailabilityService } from "@calcom/features/di/containers/GetUserAvailability";
import { TRPCError } from "@trpc/server";
import type { TrpcSessionUser } from "../../../types";
import type { TUserInputSchema } from "./user.schema";

type UserOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TUserInputSchema;
};

function getUser(username: string) {
  return findUsersForAvailabilityCheck({
    where: {
      username,
    },
  });
}

export const userHandler = async ({ ctx, input }: UserOptions) => {
  const userAvailabilityService = getUserAvailabilityService();
  const user = await getUser(input.username);
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  // Titles of calendar events are private. Only the owner gets them, anyone else just sees busy times.
  // Compared by id because usernames aren't unique across organizations.
  const isOwnAvailability = user.id === ctx.user.id;
  return userAvailabilityService.getUserAvailabilityIncludingBusyTimesFromLimits(
    {
      returnDateOverrides: true,
      bypassBusyCalendarTimes: false,
      ...input,
      ...(isOwnAvailability ? { mode: "overlay" as const } : {}),
    },
    {
      user,
    }
  );
};
