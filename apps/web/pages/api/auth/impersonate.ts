import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { defaultCookies } from "@calcom/lib/default-cookies";
import { WEBAPP_URL } from "@calcom/lib/constants";
import prisma from "@calcom/prisma";
import type { NextApiRequest, NextApiResponse } from "next";
import { encode } from "next-auth/jwt";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

function buildCookieString(
  name: string,
  value: string,
  options: { httpOnly?: boolean; sameSite?: string; secure?: boolean; domain?: string; path?: string }
): string {
  let cookie = `${name}=${value}`;
  if (options.path) cookie += `; Path=${options.path}`;
  if (options.httpOnly) cookie += "; HttpOnly";
  if (options.sameSite) cookie += `; SameSite=${options.sameSite}`;
  if (options.secure) cookie += "; Secure";
  if (options.domain) cookie += `; Domain=${options.domain}`;
  cookie += `; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
  return cookie;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const session = await getServerSession({ req });

  // Only global instance admins can impersonate
  if (!session || session.user.role !== "ADMIN") {
    return res.status(401).json({ error: "Unauthorized: admin role required" });
  }

  const targetUserId = Number(req.body?.targetUserId);
  if (!targetUserId || isNaN(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ error: "Invalid targetUserId" });
  }

  // Prevent admins from impersonating themselves
  if (targetUserId === session.user.id) {
    return res.status(400).json({ error: "Cannot impersonate yourself" });
  }

  const [adminUser, targetUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, uuid: true, role: true },
    }),
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        uuid: true,
        email: true,
        name: true,
        username: true,
        role: true,
        locale: true,
        locked: true,
      },
    }),
  ]);

  if (!adminUser) {
    return res.status(404).json({ error: "Admin user not found" });
  }
  if (!targetUser) {
    return res.status(404).json({ error: "Target user not found" });
  }
  if (targetUser.locked) {
    return res.status(400).json({ error: "Cannot impersonate a locked user" });
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "Server misconfiguration: missing NEXTAUTH_SECRET" });
  }

  const encodedToken = await encode({
    secret,
    token: {
      sub: String(targetUser.id),
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      username: targetUser.username,
      role: targetUser.role,
      locale: targetUser.locale ?? undefined,
      upId: `usr-${targetUser.id}`,
      impersonatedBy: {
        id: adminUser.id,
        uuid: adminUser.uuid,
        role: adminUser.role,
      },
    },
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  const isSecure = WEBAPP_URL?.startsWith("https://");
  const cookieConfig = defaultCookies(isSecure);
  const { name, options } = cookieConfig.sessionToken;

  res.setHeader("Set-Cookie", buildCookieString(name, encodedToken, options));

  return res.status(200).json({ success: true });
}
