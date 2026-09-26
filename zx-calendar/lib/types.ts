export const CATEGORY_IDS = ["free", "nursing", "school", "production", "work", "duty", "personal"] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

/** A block on Z's schedule. Times are ISO-8601 instants (UTC). */
export interface ScheduleBlock {
  id: string;
  title: string;
  category: CategoryId;
  start: string;
  end: string;
  notes?: string;
  location?: string;
  seriesId?: string;
}

export interface Booking {
  id: string;
  start: string;
  end: string;
  name: string;
  email: string;
  topic: string;
  notes?: string;
  createdAt: string;
  googleEventId?: string;
  googleEventLink?: string;
  meetLink?: string;
}

export interface Task {
  id: string;
  title: string;
  /** Local calendar date, YYYY-MM-DD. */
  due?: string;
  notes?: string;
  done: boolean;
  createdAt: string;
}

/** What the Team view is allowed to see: free windows and anonymous busy ranges. */
export interface PublicAvailability {
  free: { id: string; start: string; end: string }[];
  booked: { start: string; end: string }[];
}

export interface AppStatus {
  storage: "redis" | "memory";
  google: { configured: boolean; connected: boolean };
  ai: boolean;
  passcodeSet: boolean;
}

export interface BrainDumpEvent {
  title: string;
  category: CategoryId;
  /** Local wall time in the requester's timezone, YYYY-MM-DDTHH:mm. */
  start: string;
  end: string;
  notes: string | null;
}

export interface BrainDumpTask {
  title: string;
  due: string | null;
  notes: string | null;
}

export interface BrainDumpResult {
  events: BrainDumpEvent[];
  tasks: BrainDumpTask[];
  summary: string;
  engine: "claude" | "offline";
}
