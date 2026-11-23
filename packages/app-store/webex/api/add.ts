import type { NextApiRequest } from "next";
import { stringify } from "node:querystring";

import { WEBAPP_URL_FOR_OAUTH } from "@calcom/lib/constants";
import { defaultHandler } from "@calcom/lib/server/defaultHandler";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import prisma from "@calcom/prisma";

import { signOAuthState } from "../../_utils/oauth/encodeOAuthState";
import config from "../config.json";
import { getWebexAppKeys } from "../lib/getWebexAppKeys";

async function handler(req: NextApiRequest) {
  // Get user
  await prisma.user.findFirstOrThrow({
    where: {
      id: req.session?.user?.id,
    },
    select: {
      id: true,
    },
  });

  const { client_id } = await getWebexAppKeys();

  /** @link https://developer.webex.com/docs/integrations#requesting-permission */
  const params = {
    response_type: "code",
    client_id,
    redirect_uri: `${WEBAPP_URL_FOR_OAUTH}/api/integrations/${config.slug}/callback`,
    scope: "spark:kms meeting:schedules_read meeting:schedules_write", //should be "A space-separated list of scopes being requested by your integration"
    state: signOAuthState({ fromApp: false }, req.session?.user?.id),
  };
  const query = stringify(params).replaceAll("+", "%20");
  const url = `https://webexapis.com/v1/authorize?${query}`;
  return { url };
}

export default defaultHandler({
  GET: Promise.resolve({ default: defaultResponder(handler) }),
});
