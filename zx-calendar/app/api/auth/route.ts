import { NextResponse } from "next/server";
import {
  accessConfigured,
  checkPasscode,
  EXEC_COOKIE,
  isExecutive,
  sessionCookieOptions,
  sessionToken,
} from "@/lib/auth";
import { bumpCounter, clearCounter, peekCounter } from "@/lib/store";

const MAX_FAILURES = 8;
const LOCKOUT_SECONDS = 15 * 60;

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `login:${forwarded || request.headers.get("x-real-ip") || "unknown"}`;
}

export async function GET() {
  return NextResponse.json({ executive: await isExecutive() });
}

export async function POST(request: Request) {
  if (!accessConfigured) {
    return NextResponse.json(
      { error: "Executive access isn't configured yet. Set EXECUTIVE_PASSCODE in Vercel." },
      { status: 503 }
    );
  }
  const key = clientKey(request);
  if ((await peekCounter(key)) >= MAX_FAILURES) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429, headers: { "Retry-After": String(LOCKOUT_SECONDS) } }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { passcode?: unknown };
  const passcode = typeof body.passcode === "string" ? body.passcode : "";
  if (!checkPasscode(passcode)) {
    const failures = await bumpCounter(key, LOCKOUT_SECONDS);
    const left = Math.max(0, MAX_FAILURES - failures);
    return NextResponse.json(
      {
        error:
          left > 0
            ? `That password isn't right. ${left} attempts left.`
            : "Too many attempts. Try again in 15 minutes.",
      },
      { status: left > 0 ? 401 : 429 }
    );
  }
  await clearCounter(key);
  const res = NextResponse.json({ executive: true });
  res.cookies.set(EXEC_COOKIE, sessionToken(), sessionCookieOptions);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ executive: false });
  res.cookies.set(EXEC_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return res;
}
