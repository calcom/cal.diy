import { NextResponse } from "next/server";
import { checkPasscode, EXEC_COOKIE, isExecutive, sessionCookieOptions, sessionToken } from "@/lib/auth";

export async function GET() {
  return NextResponse.json({ executive: await isExecutive() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { passcode?: unknown };
  const passcode = typeof body.passcode === "string" ? body.passcode : "";
  if (!checkPasscode(passcode)) {
    return NextResponse.json({ error: "That passcode isn't right." }, { status: 401 });
  }
  const res = NextResponse.json({ executive: true });
  res.cookies.set(EXEC_COOKIE, sessionToken(), sessionCookieOptions);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ executive: false });
  res.cookies.set(EXEC_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return res;
}
