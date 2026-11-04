import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isValidCronRequest } from "@calcom/lib/cronAuth";
import { CalendarCacheEventRepository } from "@calcom/features/calendar-subscription/lib/cache/CalendarCacheEventRepository";
import { CalendarCacheEventService } from "@calcom/features/calendar-subscription/lib/cache/CalendarCacheEventService";
import { prisma } from "@calcom/prisma";
import { defaultResponderForAppDir } from "@calcom/web/app/api/defaultResponderForAppDir";

/**
 * Cron webhook
 * Cleanup stale calendar cache
 *
 * @param request
 * @returns
 */
async function getHandler(request: NextRequest) {
  if (!isValidCronRequest(request)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  // instantiate dependencies
  const calendarCacheEventRepository = new CalendarCacheEventRepository(prisma);
  const calendarCacheEventService = new CalendarCacheEventService({
    calendarCacheEventRepository,
  });

  try {
    await calendarCacheEventService.cleanupStaleCache();
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(`[calendar-subscriptions-cleanup] ${message}:`, e);
    return NextResponse.json({ message }, { status: 500 });
  }
}

export const GET = defaultResponderForAppDir(getHandler);
