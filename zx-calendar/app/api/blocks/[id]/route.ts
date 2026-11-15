import { NextResponse } from "next/server";
import { isExecutive, unauthorized } from "@/lib/auth";
import { update } from "@/lib/store";
import type { ScheduleBlock } from "@/lib/types";
import { BlockPatch, firstIssue } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  if (!(await isExecutive())) return unauthorized();
  const { id } = await params;
  const parsed = BlockPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });

  const patch = parsed.data;
  const updated = await update<"blocks", ScheduleBlock | "invalid" | null>("blocks", (blocks) => {
    const index = blocks.findIndex((b) => b.id === id);
    if (index === -1) return { next: blocks, result: null };
    const merged: ScheduleBlock = {
      ...blocks[index],
      ...patch,
      ...(patch.start && { start: new Date(patch.start).toISOString() }),
      ...(patch.end && { end: new Date(patch.end).toISOString() }),
    };
    if (Date.parse(merged.end) <= Date.parse(merged.start)) return { next: blocks, result: "invalid" };
    const next = [...blocks];
    next[index] = merged;
    return { next, result: merged };
  });

  if (updated === "invalid") return NextResponse.json({ error: "End must be after start" }, { status: 400 });
  if (!updated) return NextResponse.json({ error: "Block not found" }, { status: 404 });
  return NextResponse.json({ block: updated });
}

/** `?series=1` removes every block created together with this one. */
export async function DELETE(request: Request, { params }: Params) {
  if (!(await isExecutive())) return unauthorized();
  const { id } = await params;
  const wholeSeries = new URL(request.url).searchParams.get("series") === "1";

  const removed = await update("blocks", (blocks) => {
    const target = blocks.find((b) => b.id === id);
    if (!target) return { next: blocks, result: [] as string[] };
    const matches = (b: ScheduleBlock) =>
      b.id === id || (wholeSeries && target.seriesId !== undefined && b.seriesId === target.seriesId);
    return { next: blocks.filter((b) => !matches(b)), result: blocks.filter(matches).map((b) => b.id) };
  });
  return NextResponse.json({ removed });
}
