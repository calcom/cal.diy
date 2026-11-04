import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { TaskProcessor } from "../task-processor";

async function handler(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const processor = new TaskProcessor();
  await processor.processQueue();
  return NextResponse.json({ success: true });
}

export async function GET(request: NextRequest) {
  return await handler(request);
}

export async function POST(request: NextRequest) {
  return await handler(request);
}
