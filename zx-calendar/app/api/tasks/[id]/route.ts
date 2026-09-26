import { NextResponse } from "next/server";
import { isExecutive, unauthorized } from "@/lib/auth";
import { update } from "@/lib/store";
import type { Task } from "@/lib/types";
import { firstIssue, TaskPatch } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  if (!(await isExecutive())) return unauthorized();
  const { id } = await params;
  const parsed = TaskPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });

  const { due, notes, ...rest } = parsed.data;
  const task = await update("tasks", (tasks) => {
    const index = tasks.findIndex((t) => t.id === id);
    if (index === -1) return { next: tasks, result: null };
    const merged: Task = {
      ...tasks[index],
      ...rest,
      ...(due !== undefined && { due: due ?? undefined }),
      ...(notes !== undefined && { notes: notes ?? undefined }),
    };
    const next = [...tasks];
    next[index] = merged;
    return { next, result: merged };
  });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ task });
}

export async function DELETE(_request: Request, { params }: Params) {
  if (!(await isExecutive())) return unauthorized();
  const { id } = await params;
  await update("tasks", (tasks) => ({ next: tasks.filter((t) => t.id !== id), result: null }));
  return NextResponse.json({ removed: id });
}
