import { createNextApiHandler } from "@calcom/trpc/server/createNextApiHandler";
import { eventTypesRouter } from "@calcom/trpc/server/routers/viewer/eventTypes/heavy/_router";

// Event type updates can carry large payloads (rich-text descriptions with embedded
// images, many hosts/children for managed events). Next.js rejects bodies over 1mb by
// default with a 413, which the client then surfaces as an unrelated JSON parse error.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4mb",
    },
  },
};

export default createNextApiHandler(eventTypesRouter);
