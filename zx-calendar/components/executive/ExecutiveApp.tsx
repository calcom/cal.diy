"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, visibleRange } from "../calendar/Calendar";
import type { AllDayItem, CalEvent, ViewMode } from "../calendar/types";
import { Calendar as CalendarIcon, ListIcon, Logout, Pie, Plus, Sparkle } from "../Icons";
import { Sheet } from "../Sheet";
import { useToast } from "../Toasts";
import { TopBar } from "../TopBar";
import { type BlockDraft, BlockEditor, type EditorState } from "./BlockEditor";
import { BookingDetails } from "./BookingDetails";
import { BrainDump } from "./BrainDump";
import { CategoryFilters } from "./CategoryFilters";
import { Integrations } from "./Integrations";
import { TasksPanel } from "./TasksPanel";
import { WeekGlance } from "./WeekGlance";
import { api } from "@/lib/api";
import { BOOKING_STYLE, CATEGORIES } from "@/lib/categories";
import {
  addDays,
  addMinutes,
  atMinutes,
  formatDayShort,
  formatTime,
  fromLocalDateTime,
  uid,
} from "@/lib/dates";
import { sampleWeek } from "@/lib/sample";
import type {
  AppStatus,
  Booking,
  BrainDumpEvent,
  BrainDumpTask,
  CategoryId,
  ScheduleBlock,
  Task,
} from "@/lib/types";

interface ScheduleData {
  blocks: ScheduleBlock[];
  bookings: Booking[];
  tasks: Task[];
}

type MobilePanel = "brain" | "tasks" | "week" | null;

const VIEW_KEY = "zx:exec-view";

function readStoredView(): ViewMode | null {
  try {
    const v = window.localStorage.getItem(VIEW_KEY);
    return v === "day" || v === "3day" || v === "week" || v === "month" ? v : null;
  } catch {
    return null;
  }
}

function storeView(view: ViewMode) {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Private mode — the view just won't be remembered.
  }
}

export function ExecutiveApp() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<ScheduleData | null>(null);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [view, setViewState] = useState<ViewMode>("week");
  const [date, setDate] = useState(() => new Date());
  const [hidden, setHidden] = useState<Set<CategoryId | "calls">>(new Set());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [openBooking, setOpenBooking] = useState<Booking | null>(null);
  const [panel, setPanel] = useState<MobilePanel>(null);
  const [highlightTask, setHighlightTask] = useState<string | null>(null);
  const dataRef = useRef<ScheduleData | null>(null);
  dataRef.current = data;

  const setView = useCallback((v: ViewMode) => {
    setViewState(v);
    storeView(v);
  }, []);

  useEffect(() => {
    const stored = readStoredView();
    setViewState(stored ?? (window.matchMedia("(max-width: 899px)").matches ? "3day" : "week"));
  }, []);

  const load = useCallback(async () => {
    try {
      setData(await api<ScheduleData>("/api/blocks"));
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Couldn't load your schedule", { tone: "error" });
    }
  }, [toast]);

  useEffect(() => {
    load();
    api<AppStatus>("/api/status")
      .then(setStatus)
      .catch(() => {});
    // New team bookings show up without a manual refresh.
    const interval = window.setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const google = params.get("google");
    if (!google) return;
    if (google === "connected") toast.show("Google Calendar connected — bookings will sync.");
    else toast.show(`Google connection failed (${google}). Try again.`, { tone: "error" });
    window.history.replaceState(null, "", "/executive");
  }, [toast]);

  // ── Mutations ──────────────────────────────────────────────────────

  const patchLocal = useCallback((fn: (d: ScheduleData) => ScheduleData) => {
    setData((d) => (d ? fn(d) : d));
  }, []);

  const createBlocks = useCallback(
    async (inputs: Omit<ScheduleBlock, "id">[]) => {
      const res = await api<{ blocks: ScheduleBlock[] }>("/api/blocks", {
        method: "POST",
        json: { blocks: inputs },
      });
      patchLocal((d) => ({ ...d, blocks: [...d.blocks, ...res.blocks] }));
      return res.blocks;
    },
    [patchLocal]
  );

  const updateBlock = useCallback(
    async (id: string, patch: Partial<ScheduleBlock>, undoLabel?: string) => {
      const previous = dataRef.current?.blocks.find((b) => b.id === id);
      if (!previous) return;
      patchLocal((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
      try {
        await api(`/api/blocks/${id}`, { method: "PATCH", json: patch });
        if (undoLabel) {
          toast.show(undoLabel, {
            action: {
              label: "Undo",
              run: () =>
                updateBlock(id, {
                  start: previous.start,
                  end: previous.end,
                  category: previous.category,
                  title: previous.title,
                }),
            },
          });
        }
      } catch (err) {
        patchLocal((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? previous : b)) }));
        toast.show(err instanceof Error ? err.message : "Couldn't save that change", { tone: "error" });
      }
    },
    [patchLocal, toast]
  );

  const deleteBlock = useCallback(
    async (block: ScheduleBlock, wholeSeries: boolean) => {
      const before = dataRef.current?.blocks ?? [];
      const removed = before.filter(
        (b) => b.id === block.id || (wholeSeries && block.seriesId && b.seriesId === block.seriesId)
      );
      const removedIds = new Set(removed.map((b) => b.id));
      patchLocal((d) => ({ ...d, blocks: d.blocks.filter((b) => !removedIds.has(b.id)) }));
      setEditor(null);
      try {
        await api(`/api/blocks/${block.id}${wholeSeries ? "?series=1" : ""}`, { method: "DELETE" });
        toast.show(removed.length > 1 ? `Deleted ${removed.length} blocks` : `Deleted “${block.title}”`, {
          action: {
            label: "Undo",
            run: () => createBlocks(removed.map(({ id: _id, ...rest }) => rest)).catch(() => {}),
          },
        });
      } catch (err) {
        patchLocal((d) => ({ ...d, blocks: before }));
        toast.show(err instanceof Error ? err.message : "Couldn't delete", { tone: "error" });
      }
    },
    [createBlocks, patchLocal, toast]
  );

  const saveDraft = useCallback(
    async (draft: BlockDraft) => {
      const base = {
        title: draft.title,
        category: draft.category,
        notes: draft.notes || undefined,
        location: draft.location || undefined,
      };
      try {
        if (editor?.mode === "edit") {
          await updateBlock(editor.block.id, {
            ...base,
            notes: draft.notes,
            location: draft.location,
            start: draft.start.toISOString(),
            end: draft.end.toISOString(),
          });
        } else {
          const seriesId = draft.repeatWeeks > 0 ? uid("ser_") : undefined;
          const inputs = Array.from({ length: draft.repeatWeeks + 1 }, (_, week) => ({
            ...base,
            seriesId,
            start: addDays(draft.start, week * 7).toISOString(),
            end: addDays(draft.end, week * 7).toISOString(),
          }));
          await createBlocks(inputs);
          toast.show(inputs.length > 1 ? `Added ${inputs.length} weekly blocks` : `Added “${draft.title}”`);
        }
        setEditor(null);
      } catch (err) {
        toast.show(err instanceof Error ? err.message : "Couldn't save", { tone: "error" });
      }
    },
    [createBlocks, editor, toast, updateBlock]
  );

  const cancelBooking = useCallback(
    async (booking: Booking) => {
      try {
        const res = await api<{ calendarWarning?: string }>(`/api/bookings/${booking.id}`, {
          method: "DELETE",
        });
        patchLocal((d) => ({ ...d, bookings: d.bookings.filter((b) => b.id !== booking.id) }));
        setOpenBooking(null);
        toast.show(res.calendarWarning ?? `Cancelled the call with ${booking.name}`, {
          tone: res.calendarWarning ? "error" : "info",
        });
      } catch (err) {
        toast.show(err instanceof Error ? err.message : "Couldn't cancel", { tone: "error" });
      }
    },
    [patchLocal, toast]
  );

  const addTasks = useCallback(
    async (items: { title: string; due: string | null; notes?: string | null }[]) => {
      const res = await api<{ tasks: Task[] }>("/api/tasks", { method: "POST", json: { tasks: items } });
      patchLocal((d) => ({ ...d, tasks: [...d.tasks, ...res.tasks] }));
      return res.tasks;
    },
    [patchLocal]
  );

  const toggleTask = useCallback(
    async (task: Task) => {
      patchLocal((d) => ({
        ...d,
        tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)),
      }));
      try {
        await api(`/api/tasks/${task.id}`, { method: "PATCH", json: { done: !task.done } });
      } catch {
        patchLocal((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === task.id ? task : t)) }));
        toast.show("Couldn't update the task", { tone: "error" });
      }
    },
    [patchLocal, toast]
  );

  const removeTask = useCallback(
    async (task: Task) => {
      patchLocal((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== task.id) }));
      try {
        await api(`/api/tasks/${task.id}`, { method: "DELETE" });
        toast.show(`Deleted “${task.title}”`, {
          action: {
            label: "Undo",
            run: () => addTasks([{ title: task.title, due: task.due ?? null, notes: task.notes }]),
          },
        });
      } catch {
        patchLocal((d) => ({ ...d, tasks: [...d.tasks, task] }));
        toast.show("Couldn't delete the task", { tone: "error" });
      }
    },
    [addTasks, patchLocal, toast]
  );

  const applyBrainDump = useCallback(
    async (events: BrainDumpEvent[], tasks: BrainDumpTask[]) => {
      try {
        const blockInputs = events.flatMap((e) => {
          const start = fromLocalDateTime(e.start);
          const end = fromLocalDateTime(e.end);
          if (!start || !end || end <= start) return [];
          return [
            {
              title: e.title,
              category: e.category,
              notes: e.notes ?? undefined,
              start: start.toISOString(),
              end: end.toISOString(),
            },
          ];
        });
        const [created] = await Promise.all([
          blockInputs.length ? createBlocks(blockInputs) : Promise.resolve([]),
          tasks.length
            ? addTasks(tasks.map((t) => ({ title: t.title, due: t.due, notes: t.notes })))
            : Promise.resolve([]),
        ]);
        const first = created[0];
        if (first) setDate(new Date(first.start));
        setPanel(null);
        const parts = [
          created.length && `${created.length} event${created.length === 1 ? "" : "s"}`,
          tasks.length && `${tasks.length} task${tasks.length === 1 ? "" : "s"}`,
        ].filter(Boolean);
        toast.show(`Added ${parts.join(" and ")}`);
      } catch (err) {
        toast.show(err instanceof Error ? err.message : "Couldn't add those items", { tone: "error" });
      }
    },
    [addTasks, createBlocks, toast]
  );

  const loadSample = useCallback(async () => {
    try {
      await createBlocks(sampleWeek(date));
      toast.show("Loaded a sample week — drag things around!");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Couldn't load the sample", { tone: "error" });
    }
  }, [createBlocks, date, toast]);

  const logout = async () => {
    await api("/api/auth", { method: "DELETE" }).catch(() => {});
    router.refresh();
  };

  const newBlockAt = useCallback((category?: CategoryId) => {
    const now = new Date();
    const start = atMinutes(now, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30);
    setEditor({ mode: "create", start, end: addMinutes(start, 60), category });
  }, []);

  // Keyboard shortcuts: n = new, t = today, d/w/m = views.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || target.closest("input, textarea, select, [role=dialog]"))
        return;
      if (e.key === "n") newBlockAt();
      else if (e.key === "t") setDate(new Date());
      else if (e.key === "d") setView("day");
      else if (e.key === "w") setView("week");
      else if (e.key === "m") setView("month");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newBlockAt, setView]);

  // ── Calendar mapping ──────────────────────────────────────────────

  const range = visibleRange(view, date);
  const rangeFrom = range.from.getTime();
  const rangeTo = range.to.getTime();
  const events = useMemo<CalEvent[]>(() => {
    if (!data) return [];
    const from = rangeFrom - 86_400_000;
    const to = rangeTo + 86_400_000;
    const visible = (s: string, e: string) => Date.parse(e) > from && Date.parse(s) < to;
    const blocks = data.blocks
      .filter((b) => !hidden.has(b.category) && visible(b.start, b.end))
      .map<CalEvent>((b) => {
        const c = CATEGORIES[b.category];
        return {
          id: b.id,
          title: b.title || c.label,
          subtitle: b.location || (b.category === "free" ? "Visible to team" : c.short),
          start: new Date(b.start),
          end: new Date(b.end),
          fill: c.fill,
          ink: c.ink,
          accent: c.accent,
          draggable: true,
          background: b.category === "free",
        };
      });
    const calls = hidden.has("calls")
      ? []
      : data.bookings
          .filter((b) => visible(b.start, b.end))
          .map<CalEvent>((b) => ({
            id: b.id,
            title: `Call · ${b.name}`,
            subtitle: b.topic,
            start: new Date(b.start),
            end: new Date(b.end),
            fill: BOOKING_STYLE.fill,
            ink: BOOKING_STYLE.ink,
            accent: "#9FE2EE",
            draggable: false,
          }));
    return [...blocks, ...calls];
  }, [data, hidden, rangeFrom, rangeTo]);

  const allDay = useMemo<AllDayItem[]>(
    () =>
      (data?.tasks ?? [])
        .filter((t) => t.due)
        .map((t) => ({ id: t.id, dateKey: t.due as string, title: t.title, done: t.done })),
    [data?.tasks]
  );

  const onEventClick = useCallback((ev: CalEvent) => {
    const d = dataRef.current;
    if (!d) return;
    const booking = d.bookings.find((b) => b.id === ev.id);
    if (booking) return setOpenBooking(booking);
    const block = d.blocks.find((b) => b.id === ev.id);
    if (block) setEditor({ mode: "edit", block });
  }, []);

  const onEventChange = useCallback(
    (id: string, start: Date, end: Date) => {
      updateBlock(
        id,
        { start: start.toISOString(), end: end.toISOString() },
        `Moved to ${formatDayShort(start)}, ${formatTime(start)}`
      );
    },
    [updateBlock]
  );

  const onCreate = useCallback((start: Date, end: Date) => setEditor({ mode: "create", start, end }), []);

  const onAllDayClick = useCallback((id: string) => {
    setHighlightTask(id);
    window.setTimeout(() => setHighlightTask(null), 1600);
    if (window.matchMedia("(max-width: 899px)").matches) setPanel("tasks");
    else document.getElementById("tasks-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const toggleHidden = (id: CategoryId | "calls") =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const isEmpty = data !== null && data.blocks.length === 0 && data.bookings.length === 0;

  const brainDump = (
    <BrainDump aiEnabled={Boolean(status?.ai)} blocks={data?.blocks ?? []} onApply={applyBrainDump} />
  );
  const tasksPanel = (
    <TasksPanel
      tasks={data?.tasks ?? []}
      highlightId={highlightTask}
      onAdd={(title, due) => {
        addTasks([{ title, due }]).catch((err) => toast.show(err.message, { tone: "error" }));
      }}
      onToggle={toggleTask}
      onRemove={removeTask}
    />
  );

  return (
    <div className="shell">
      <TopBar
        active="/executive"
        right={
          <button
            type="button"
            className="icon-btn desktop-only"
            onClick={logout}
            aria-label="Lock executive view"
            title="Lock">
            <Logout />
          </button>
        }
      />

      <div className="workspace">
        <aside className="sidebar">
          {data && (
            <WeekGlance date={date} blocks={data.blocks} bookings={data.bookings} tasks={data.tasks} />
          )}

          <SideCard title="Brain dump" eyebrow="Type it messy, get a schedule" icon={<Sparkle />}>
            {brainDump}
          </SideCard>

          <SideCard
            id="tasks-card"
            title="Tasks"
            eyebrow={`${data?.tasks.filter((t) => !t.done).length ?? 0} open`}>
            {tasksPanel}
          </SideCard>

          <SideCard title="Your schedule" eyebrow="Toggle what you see · + to add">
            <CategoryFilters hidden={hidden} onToggle={toggleHidden} onQuickAdd={(id) => newBlockAt(id)} />
          </SideCard>

          <SideCard title="Connections" eyebrow="Setup">
            <Integrations status={status} onLoadSample={loadSample} />
          </SideCard>
        </aside>

        <main className="main-panel">
          <Calendar
            events={events}
            allDay={allDay}
            view={view}
            onViewChange={setView}
            date={date}
            onDateChange={setDate}
            editable
            onEventClick={onEventClick}
            onEventChange={onEventChange}
            onCreate={onCreate}
            onAllDayClick={onAllDayClick}
            toolbarExtra={
              <button type="button" className="btn btn-dark btn-sm desktop-only" onClick={() => newBlockAt()}>
                <Plus size={16} /> New block
              </button>
            }
            overlay={
              isEmpty ? (
                <div className="banner" style={{ margin: "0 16px 10px" }}>
                  <span style={{ flex: 1 }}>
                    Your calendar is empty. Click or drag on the grid to add a block, or
                  </span>
                  <button type="button" className="btn btn-dark btn-sm" onClick={loadSample}>
                    Load a sample week
                  </button>
                </div>
              ) : null
            }
          />
        </main>
      </div>

      <nav className="dock mobile-only" aria-label="Executive tools">
        <button
          type="button"
          className="icon-btn"
          aria-label="Calendar"
          aria-pressed={panel === null}
          onClick={() => {
            setPanel(null);
            setDate(new Date());
          }}>
          <CalendarIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Brain dump"
          aria-pressed={panel === "brain"}
          onClick={() => setPanel("brain")}>
          <Sparkle />
        </button>
        <button
          type="button"
          className="icon-btn primary"
          aria-label="New block"
          onClick={() => newBlockAt()}>
          <Plus size={22} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Tasks"
          aria-pressed={panel === "tasks"}
          onClick={() => setPanel("tasks")}>
          <ListIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Week & settings"
          aria-pressed={panel === "week"}
          onClick={() => setPanel("week")}>
          <Pie />
        </button>
      </nav>

      <Sheet open={panel === "brain"} onClose={() => setPanel(null)} title="Brain dump">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Type everything on your mind. It becomes events and tasks you can review before adding.
        </p>
        {brainDump}
      </Sheet>
      <Sheet open={panel === "tasks"} onClose={() => setPanel(null)} title="Tasks">
        {tasksPanel}
      </Sheet>
      <Sheet open={panel === "week"} onClose={() => setPanel(null)} title="Your week">
        {data && <WeekGlance date={date} blocks={data.blocks} bookings={data.bookings} tasks={data.tasks} />}
        <CategoryFilters
          hidden={hidden}
          onToggle={toggleHidden}
          onQuickAdd={(id) => {
            setPanel(null);
            newBlockAt(id);
          }}
        />
        <Integrations status={status} onLoadSample={loadSample} />
        <button type="button" className="btn btn-soft" onClick={logout}>
          <Logout /> Lock executive view
        </button>
      </Sheet>

      <BlockEditor state={editor} onClose={() => setEditor(null)} onSave={saveDraft} onDelete={deleteBlock} />
      <BookingDetails booking={openBooking} onClose={() => setOpenBooking(null)} onCancel={cancelBooking} />
    </div>
  );
}

function SideCard({
  id,
  title,
  eyebrow,
  icon,
  children,
}: {
  id?: string;
  title: string;
  eyebrow?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="card card-pad">
      <div className="card-head">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 className="card-title">{title}</h2>
        </div>
        {icon && <span className="icon-btn sm">{icon}</span>}
      </div>
      {children}
    </section>
  );
}
