import "@tanstack/react-start/server-only";

import process from "node:process";
import { IS_PRODUCTION_BUILD } from "../build";
import { getDb } from "../db";
import { createEmailService } from "../emails/container";
import { type Auth, type AuthEmailSender, createAuth } from "./createAuth";
import { oidcConfigFromEnv } from "./oidc";
import { authSecret } from "./secret";
import { CLIENT_IP_HEADERS } from "#runtime";

let authPromise: Promise<Auth> | undefined;

function authEmailSender(): AuthEmailSender | null {
  const emails = createEmailService();
  return emails ? (kind, recipient, url, values) => emails.sendAuthEmail(kind, recipient, url, values) : null;
}

async function init(): Promise<Auth> {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  return createAuth({
    db: await getDb(),
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    secret: authSecret(),
    clientIpHeaders: CLIENT_IP_HEADERS,
    rateLimit: IS_PRODUCTION_BUILD,
    sendAuthEmail: authEmailSender(),
    requireAdminTwoFactor: IS_PRODUCTION_BUILD,
    google:
      GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
        ? { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET }
        : undefined,
    oidc: oidcConfigFromEnv(process.env) ?? undefined,
  });
}

export function getAuth(): Promise<Auth> {
  authPromise ??= init().catch((error) => {
    authPromise = undefined;
    throw error;
  });
  return authPromise;
}
