import type { NextApiRequest, NextApiResponse } from "next";
import type { Session } from "next-auth";

import { throwIfNotHaveAdminAccessToTeam } from "@calcom/app-store/_utils/throwIfNotHaveAdminAccessToTeam";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { deriveAppDictKeyFromType } from "@calcom/lib/deriveAppDictKeyFromType";
import { HttpError } from "@calcom/lib/http-error";
import { getServerErrorFromUnknown } from "@calcom/lib/server/getServerErrorFromUnknown";
import prisma from "@calcom/prisma";
import type { AppDeclarativeHandler, AppHandler } from "@calcom/types/AppHandler";

const defaultIntegrationAddHandler = async ({
  slug,
  supportsMultipleInstalls,
  appType,
  user,
  teamId = undefined,
  createCredential,
  req,
  validators,
}: {
  slug: string;
  supportsMultipleInstalls: boolean;
  appType: string;
  user?: Session["user"];
  teamId?: number;
  req: NextApiRequest;
  createCredential: AppDeclarativeHandler["createCredential"];
  validators?: AppDeclarativeHandler["validators"];
}) => {
  if (!user?.id) {
    throw new HttpError({ statusCode: 401, message: "You must be logged in to do this" });
  }
  if (!supportsMultipleInstalls) {
    const alreadyInstalled = await prisma.credential.findFirst({
      where: {
        appId: slug,
        ...(teamId ? { AND: [{ userId: user.id }, { teamId }] } : { userId: user.id }),
      },
    });
    if (alreadyInstalled) {
      throw new Error("App is already installed");
    }
  }

  await throwIfNotHaveAdminAccessToTeam({ teamId: teamId ?? null, userId: user.id });

  // Validate the request if needed
  let query = req.query;
  if (query && validators?.querySchema) {
    const validated = validators.querySchema.safeParse(query);
    if (!validated.success) {
      throw new HttpError({ statusCode: 422, message: "Invalid query" });
    }
    query = validated.data;
  }

  let body = req.body;
  if (body && validators?.bodySchema) {
    const validated = validators.bodySchema.safeParse(body);
    if (!validated.success) {
      throw new HttpError({ statusCode: 422, message: "Invalid body" });
    }
    body = validated.data;
  }

  return await createCredential({ user: user, appType, slug, teamId, query, body, method: req.method });
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  // Check that user is authenticated
  req.session = await getServerSession({ req });

  const { args, teamId } = req.query;

  if (!Array.isArray(args)) {
    return res.status(404).json({ message: `API route not found` });
  }

  const [appName, apiEndpoint] = args;

  if (apiEndpoint === "add" && !req.session?.user?.id) {
    return res.status(401).json({ message: "You must be logged in to do this" });
  }

  try {
    /* Absolute path didn't work */
    const handlerMap = (await import("@calcom/app-store/apps.server.generated")).apiHandlers;
    const handlerKey = deriveAppDictKeyFromType(appName, handlerMap);
    const handlers = await handlerMap[handlerKey as keyof typeof handlerMap];
    if (!handlers) throw new HttpError({ statusCode: 404, message: `No handlers found for ${handlerKey}` });
    const handler = handlers[apiEndpoint as keyof typeof handlers] as AppHandler;
    if (typeof handler === "undefined")
      throw new HttpError({ statusCode: 404, message: `API handler not found` });

    if (typeof handler === "function") {
      await handler(req, res);
    } else {
      // See if there's
      const result = await defaultIntegrationAddHandler({
        user: req.session?.user,
        teamId: Number(teamId),
        ...handler,
        req,
      });
      const redirectOptions = "redirect" in result && result.redirect ? result.redirect : handler.redirect;
      // No redirection in json. What should we do as a default fallback?
      res.json(redirectOptions ?? { done: true });
    }
    if (!res.writableEnded) res.status(200);
    return;
  } catch (error) {
    console.error(error);
    const httpError = getServerErrorFromUnknown(error);
    return res.status(httpError.statusCode).json({ message: httpError.message });
  }
};

export default handler;
