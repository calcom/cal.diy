import type { NextApiRequest } from "next";
import { stringify } from "node:querystring";

import { WEBAPP_URL } from "@calcom/lib/constants";
import { defaultHandler } from "@calcom/lib/server/defaultHandler";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import prisma from "@calcom/prisma";

import { signOAuthState } from "../../_utils/oauth/encodeOAuthState";
import { getBasecampKeys } from "../lib/getBasecampKeys";

async function handler(req: NextApiRequest) {
  await prisma.user.findFirstOrThrow({
    where: {
      id: req.session?.user?.id,
    },
    select: {
      id: true,
    },
  });

  const { client_id } = await getBasecampKeys();

  const params = {
    type: "web_server",
    client_id,
    state: signOAuthState({ fromApp: false }, req.session?.user?.id),
  };
  const query = stringify(params);
  const url = `https://launchpad.37signals.com/authorization/new?${query}&redirect_uri=${WEBAPP_URL}/api/integrations/basecamp3/callback`;
  return { url };
}

export default defaultHandler({
  GET: Promise.resolve({ default: defaultResponder(handler) }),
});
