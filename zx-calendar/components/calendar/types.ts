export type ViewMode = "day" | "3day" | "week" | "month";

export interface CalEvent {
  id: string;
  title: string;
  subtitle?: string;
  start: Date;
  end: Date;
  fill: string;
  ink: string;
  accent: string;
  draggable: boolean;
  variant?: "booked";
  /** Rendered full-width underneath other events (e.g. free time with calls on top). */
  background?: boolean;
}

export interface AllDayItem {
  id: string;
  dateKey: string;
  title: string;
  done?: boolean;
}

export interface CalendarHandlers {
  onEventClick?: (event: CalEvent, at: Date | null) => void;
  onEventChange?: (id: string, start: Date, end: Date) => void;
  onCreate?: (start: Date, end: Date) => void;
  onAllDayClick?: (id: string) => void;
}
