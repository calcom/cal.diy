import { createNextApiHandler } from "@calcom/trpc/server/createNextApiHandler";
import { paymentsRouter } from "@calcom/trpc/server/routers/viewer/payments/_router";

export default createNextApiHandler(paymentsRouter);
