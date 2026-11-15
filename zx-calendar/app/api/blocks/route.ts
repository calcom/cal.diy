import { NextResponse } from "next/server";
import { isExecutive, unauthorized } from "@/lib/auth";
import { uid } from "@/lib/dates";
import { read, update } from "@/lib/store";
import type { ScheduleBlock } from "@/lib/types";
import { BlockBatchInput, firstIssue } from "@/lib/validation";

export async function GET() {
  if (!(await isExecutive())) return unauthorized();
  const [blocks, bookings, tasks] = await Promise.all([read("blocks"), read("bookings"), read("tasks")]);
  return NextResponse.json({ blocks, bookings, tasks });
}

/** Creates one or more blocks: `{ blocks: [...] }`. */
export async function POST(request: Request) {
  if (!(await isExecutive())) return unauthorized();
  const parsed = BlockBatchInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });

  const created: ScheduleBlock[] = parsed.data.blocks.map((b) => ({
    ...b,
    title: b.title,
    start: new Date(b.start).toISOString(),
    end: new Date(b.end).toISOString(),
    id: uid("blk_"),
  }));
  await update("blocks", (current) => ({ next: [...current, ...created], result: null }));
  return NextResponse.json({ blocks: created }, { status: 201 });
}
