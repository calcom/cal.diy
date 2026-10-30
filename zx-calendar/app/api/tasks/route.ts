import { NextResponse } from "next/server";
import { isExecutive, unauthorized } from "@/lib/auth";
import { uid } from "@/lib/dates";
import { update } from "@/lib/store";
import type { Task } from "@/lib/types";
import { firstIssue, TaskInput } from "@/lib/validation";

/** Creates one or more tasks: `{ tasks: [...] }`. */
export async function POST(request: Request) {
  if (!(await isExecutive())) return unauthorized();
  const body = (await request.json().catch(() => null)) as { tasks?: unknown } | null;
  const parsed = TaskInput.array().min(1).max(100).safeParse(body?.tasks);
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });

  const created: Task[] = parsed.data.map((t) => ({
    id: uid("tsk_"),
    title: t.title,
    due: t.due ?? undefined,
    notes: t.notes ?? undefined,
    done: false,
    createdAt: new Date().toISOString(),
  }));
  await update("tasks", (tasks) => ({ next: [...tasks, ...created], result: null }));
  return NextResponse.json({ tasks: created }, { status: 201 });
}
