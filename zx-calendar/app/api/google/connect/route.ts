import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isExecutive, passcodeSet, unauthorized } from "@/lib/auth";
import { authUrl, googleConfigured } from "@/lib/google";

const STATE_COOKIE = "zx_google_state";

export async function GET(request: Request) {
  if (!(await isExecutive())) return unauthorized();
  if (!passcodeSet) {
    return NextResponse.json(
      { error: "Set EXECUTIVE_PASSCODE before connecting Google so nobody else can change it." },
      { status: 400 }
    );
  }
  if (!googleConfigured) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set." },
      { status: 400 }
    );
  }
  const origin = new URL(request.url).origin;
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(`${origin}/api/google/callback`, state));
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
