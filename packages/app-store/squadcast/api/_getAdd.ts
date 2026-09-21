import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import type { NextApiRequest } from "next";
import checkSession from "../../_utils/auth";
import { checkInstalled } from "../../_utils/installation";

export async function getHandler(req: NextApiRequest) {
  const session = checkSession(req);
  await checkInstalled("squadcast", session.user?.id);
  return { url: "/apps/squadcast/setup" };
}

export default defaultResponder(getHandler);
