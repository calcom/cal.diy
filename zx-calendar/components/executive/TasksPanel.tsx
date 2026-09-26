"use client";

import { type FormEvent, useMemo, useState } from "react";
import { Check, Close, Plus } from "../Icons";
import { fromLocal, startOfDay, toDateKey } from "@/lib/dates";
import type { Task } from "@/lib/types";

interface TasksPanelProps {
  tasks: Task[];
  onAdd: (title: string, due: string | null) => void;
  onToggle: (task: Task) => void;
  onRemove: (task: Task) => void;
  highlightId?: string | null;
}

function dueLabel(due: string): { text: string; overdue: boolean } {
  const date = fromLocal(due);
  if (!date) return { text: due, overdue: false };
  const today = startOfDay(new Date());
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return { text: "Today", overdue: false };
  if (diff === 1) return { text: "Tomorrow", overdue: false };
  if (diff < 0)
    return {
      text: `Overdue · ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      overdue: true,
    };
  if (diff < 7) return { text: date.toLocaleDateString(undefined, { weekday: "long" }), overdue: false };
  return { text: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }), overdue: false };
}

export function TasksPanel({ tasks, onAdd, onToggle, onRemove, highlightId }: TasksPanelProps) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const sorted = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.createdAt.localeCompare(b.createdAt);
      }),
    [tasks]
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim(), due || null);
    setTitle("");
    setDue("");
  };

  return (
    <div>
      {sorted.length === 0 ? (
        <p className="muted" style={{ fontSize: 13, margin: "4px 4px 8px" }}>
          Nothing on your list. Add one below or use the brain dump.
        </p>
      ) : (
        <ul className="task-list">
          {sorted.map((task) => {
            const label = task.due ? dueLabel(task.due) : null;
            return (
              <li
                key={task.id}
                className={`task-item${task.done ? " done" : ""}`}
                style={highlightId === task.id ? { background: "rgba(123,117,201,0.1)" } : undefined}>
                <button
                  type="button"
                  className="check"
                  role="checkbox"
                  aria-checked={task.done}
                  aria-label={`Mark "${task.title}" ${task.done ? "not done" : "done"}`}
                  onClick={() => onToggle(task)}>
                  {task.done && <Check size={13} strokeWidth={2.6} />}
                </button>
                <span className="task-text">
                  {task.title}
                  {label && (
                    <span className={`due${label.overdue && !task.done ? " overdue" : ""}`}>
                      {label.text}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="icon-btn sm remove"
                  style={{ width: 26, height: 26 }}
                  aria-label={`Delete "${task.title}"`}
                  onClick={() => onRemove(task)}>
                  <Close size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form className="task-add" onSubmit={submit}>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task"
          aria-label="New task"
          maxLength={200}
        />
        <input
          className="input"
          type="date"
          value={due}
          min={toDateKey(new Date())}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Due date"
          style={{ width: 44, padding: "8px 10px", flex: "none", color: due ? undefined : "transparent" }}
          title={due || "Due date"}
        />
        <button
          type="submit"
          className="icon-btn dark"
          aria-label="Add task"
          disabled={!title.trim()}
          style={{ width: 40, height: 40 }}>
          <Plus />
        </button>
      </form>
    </div>
  );
}
