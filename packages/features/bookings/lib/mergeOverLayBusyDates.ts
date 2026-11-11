
export type BusyInterval = {
  start: string;
  end: string;
};

export function mergeOverlayBusyDates(
  events: BusyInterval[]
): BusyInterval[] {
  const sorted = [...events].sort(
    (a, b) =>
      new Date(a.start).getTime() -
      new Date(b.start).getTime()
  );

  const merged: BusyInterval[] = [];

  for (const event of sorted) {
    const current = merged[merged.length - 1];

    if (
      !current ||
      new Date(event.start).getTime() >
        new Date(current.end).getTime()
    ) {
      merged.push({ ...event });
      continue;
    }

    if (
      new Date(event.end).getTime() >
      new Date(current.end).getTime()
    ) {
      current.end = event.end;
    }
  }

  return merged;
}
