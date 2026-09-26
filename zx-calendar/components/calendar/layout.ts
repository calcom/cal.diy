import type { CalEvent } from "./types";
import { addDays, minutesIntoDay } from "@/lib/dates";

export interface PlacedSegment {
  event: CalEvent;
  /** Minutes from the start of the column's day. */
  top: number;
  bottom: number;
  column: number;
  columns: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  /** A foreground event that sits on top of a background event. */
  overBackground: boolean;
}

/** Splits events into per-day segments and lays out overlaps side by side. */
export function layoutDays(days: Date[], events: CalEvent[]): PlacedSegment[][] {
  const sorted = [...events].sort(
    (a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime()
  );
  return days.map((day) => {
    const dayStart = day.getTime();
    const dayEnd = addDays(day, 1).getTime();
    const segments: PlacedSegment[] = [];
    for (const event of sorted) {
      const s = event.start.getTime();
      const e = event.end.getTime();
      if (e <= dayStart || s >= dayEnd) continue;
      segments.push({
        event,
        // Local wall-clock minutes keep DST-transition days aligned with the hour labels.
        top: s <= dayStart ? 0 : minutesIntoDay(event.start),
        bottom: e >= dayEnd ? 1440 : minutesIntoDay(event.end),
        column: 0,
        columns: 1,
        continuesBefore: s < dayStart,
        continuesAfter: e > dayEnd,
        overBackground: false,
      });
    }
    // Background events (free time) only share columns with each other so calls
    // booked inside free time render on top of it rather than beside it.
    assignColumns(segments.filter((seg) => seg.event.background));
    const foreground = segments.filter((seg) => !seg.event.background);
    assignColumns(foreground);
    const background = segments.filter((seg) => seg.event.background);
    for (const seg of foreground) {
      seg.overBackground = background.some((bg) => seg.top < bg.bottom && seg.bottom > bg.top);
    }
    return segments;
  });
}

function assignColumns(segments: PlacedSegment[]) {
  let cluster: PlacedSegment[] = [];
  let clusterEnd = -1;
  let columnEnds: number[] = [];

  const flush = () => {
    const count = columnEnds.length;
    for (const seg of cluster) seg.columns = count;
    cluster = [];
    columnEnds = [];
  };

  for (const seg of segments) {
    if (seg.top >= clusterEnd && cluster.length) flush();
    let column = columnEnds.findIndex((end) => end <= seg.top);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(seg.bottom);
    } else {
      columnEnds[column] = seg.bottom;
    }
    seg.column = column;
    cluster.push(seg);
    clusterEnd = Math.max(clusterEnd, seg.bottom);
  }
  if (cluster.length) flush();
}
