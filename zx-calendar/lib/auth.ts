import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import process from "node:process";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const EXEC_COOKIE = "zx_exec";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const passcode = process.env.EXECUTIVE_PASSCODE ?? "";

export const passcodeSet = passcode.length > 0;

/**
 * Without a passcode the executive view is only open in local development.
 * A production deploy that forgot EXECUTIVE_PASSCODE stays locked rather than
 * letting anyone with the link edit Z's schedule.
 */
export const openAccess = !passcodeSet && process.env.NODE_ENV !== "production";
export const accessConfigured = passcodeSet || openAccess;

function sign(value: string): string {
  const secret = process.env.AUTH_SECRET || `zx-calendar:${passcode}`;
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkPasscode(candidate: string): boolean {
  if (openAccess) return true;
  if (!passcodeSet) return false;
  return safeEqual(sign(candidate), sign(passcode));
}

export function sessionToken(): string {
  return sign(`exec:${passcode}`);
}

/** Executive access: a valid signed cookie, or local development without a passcode. */
export async function isExecutive(): Promise<boolean> {
  if (openAccess) return true;
  if (!passcodeSet) return false;
  const jar = await cookies();
  const value = jar.get(EXEC_COOKIE)?.value;
  return Boolean(value && safeEqual(value, sessionToken()));
}

export function unauthorized() {
  return NextResponse.json({ error: "Executive passcode required" }, { status: 401 });
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
