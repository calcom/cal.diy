import type { NextApiHandler } from "next";
import type { Session } from "next-auth";
import type { z } from "zod";

import type { Credential } from "@calcom/prisma/client";

type RedirectOptions = {
  newTab?: boolean;
  url: string;
};

type DefaultQuery = Partial<{
  [key: string]: string | string[];
}>;

// Default query follows the Next.js API query convention
export type AppDeclarativeHandler<Body = unknown, Query = DefaultQuery> = {
  validators?: {
    bodySchema?: z.ZodSchema<Body>;
    querySchema?: z.ZodSchema<Query>;
  };
  appType: string;
  slug: string;
  variant: string;
  supportsMultipleInstalls: false;
  handlerType: "add";
  createCredential: (arg: {
    method: string;
    user: Session["user"];
    appType: string;
    slug: string;
    teamId?: number;
    body?: Body;
    query: Query;
    // Allow return of Credential for backwards compatibility
  }) => Promise<Credential | { credential: Credential | null; redirect?: RedirectOptions }>;
  supportsMultipleInstalls: boolean;
  redirect?: RedirectOptions;
};
export type AppHandler = AppDeclarativeHandler | NextApiHandler;
