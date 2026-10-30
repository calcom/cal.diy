import process from "node:process";
import { NextResponse } from "next/server";
import { isExecutive, passcodeSet, unauthorized } from "@/lib/auth";
import { aiConfigured } from "@/lib/brainDumpAI";
import { googleConfigured, googleRefreshToken } from "@/lib/google";
import { emailConfigured } from "@/lib/notify";
import { inviteRecipients } from "@/lib/recipients";
import { storageMode } from "@/lib/store";
import type { AppStatus } from "@/lib/types";

export async function GET() {
  if (!(await isExecutive())) return unauthorized();
  const status: AppStatus = {
    storage: storageMode,
    google: {
      configured: googleConfigured,
      connected: googleConfigured && Boolean(await googleRefreshToken()),
    },
    ai: aiConfigured,
    passcodeSet,
    invites: { recipients: inviteRecipients(process.env), email: emailConfigured },
  };
  return NextResponse.json(status);
}
