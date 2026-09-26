import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isExecutive, unauthorized } from "@/lib/auth";
import { exchangeCode } from "@/lib/google";

export async function GET(request: Request) {
  if (!(await isExecutive())) return unauthorized();
  const url = new URL(request.url);
  const jar = await cookies();
  const expected = jar.get("zx_google_state")?.value;
  const back = new URL("/executive", url.origin);

  if (!expected || url.searchParams.get("state") !== expected) {
    back.searchParams.set("google", "state_mismatch");
    return NextResponse.redirect(back);
  }
  const code = url.searchParams.get("code");
  if (!code) {
    back.searchParams.set("google", url.searchParams.get("error") ?? "denied");
    return NextResponse.redirect(back);
  }
  try {
    await exchangeCode(code, `${url.origin}/api/google/callback`);
    back.searchParams.set("google", "connected");
  } catch (error) {
    console.error("[google] OAuth exchange failed", error);
    back.searchParams.set("google", "failed");
  }
  const res = NextResponse.redirect(back);
  res.cookies.set("zx_google_state", "", { path: "/", maxAge: 0 });
  return res;
}
