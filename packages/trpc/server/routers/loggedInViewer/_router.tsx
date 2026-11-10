import authedProcedure from "../../procedures/authedProcedure";
import { router } from "../../trpc";
import { ZAddNotificationsSubscriptionInputSchema } from "./addNotificationsSubscription.schema";
import { ZAddSecondaryEmailInputSchema } from "./addSecondaryEmail.schema";
import { ZConnectAndJoinInputSchema } from "./connectAndJoin.schema";
import { ZEventTypeOrderInputSchema } from "./eventTypeOrder.schema";
import { ZNoShowInputSchema } from "./markNoShow.schema";
import { teamsAndUserProfilesQuery } from "./procedures/teamsAndUserProfilesQuery";
import { ZRemoveNotificationsSubscriptionInputSchema } from "./removeNotificationsSubscription.schema";

type AppsRouterHandlerCache = {
  eventTypeOrder?: typeof import("./eventTypeOrder.handler").eventTypeOrderHandler;
  teamsAndUserProfilesQuery?: typeof import("./teamsAndUserProfilesQuery.handler").teamsAndUserProfilesQuery;
  connectAndJoin?: typeof import("./connectAndJoin.handler").Handler;
  addSecondaryEmail?: typeof import("./addSecondaryEmail.handler").addSecondaryEmailHandler;
  addNotificationsSubscription?: typeof import("./addNotificationsSubscription.handler").addNotificationsSubscriptionHandler;
  removeNotificationsSubscription?: typeof import("./removeNotificationsSubscription.handler").removeNotificationsSubscriptionHandler;
  markNoShow?: typeof import("./markNoShow.handler").markNoShow;
};

export const loggedInViewerRouter = router({
  unlinkConnectedAccount: authedProcedure.mutation(async (opts) => {
    const unlinkConnectedAccountHandler = await import("./unlinkConnectedAccount.handler").then(
      (mod) => mod.default
    );
    return unlinkConnectedAccountHandler(opts);
  }),

  eventTypeOrder: authedProcedure.input(ZEventTypeOrderInputSchema).mutation(async ({ ctx, input }) => {
    const { eventTypeOrderHandler } = await import("./eventTypeOrder.handler");
    return eventTypeOrderHandler({ ctx, input });
  }),

  teamsAndUserProfilesQuery,
  connectAndJoin: authedProcedure.input(ZConnectAndJoinInputSchema).mutation(async ({ ctx, input }) => {
    const { Handler } = await import("./connectAndJoin.handler");
    return Handler({ ctx, input });
  }),
  addSecondaryEmail: authedProcedure.input(ZAddSecondaryEmailInputSchema).mutation(async ({ ctx, input }) => {
    const { addSecondaryEmailHandler } = await import("./addSecondaryEmail.handler");
    return addSecondaryEmailHandler({ ctx, input });
  }),
  addNotificationsSubscription: authedProcedure
    .input(ZAddNotificationsSubscriptionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { addNotificationsSubscriptionHandler } = await import("./addNotificationsSubscription.handler");
      return addNotificationsSubscriptionHandler({ ctx, input });
    }),
  removeNotificationsSubscription: authedProcedure
    .input(ZRemoveNotificationsSubscriptionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { removeNotificationsSubscriptionHandler } = await import(
        "./removeNotificationsSubscription.handler"
      );
      return removeNotificationsSubscriptionHandler({ ctx, input });
    }),
  markNoShow: authedProcedure.input(ZNoShowInputSchema).mutation(async (opts) => {
    const { markNoShow } = await import("./markNoShow.handler");
    return markNoShow(opts);
  }),
});
