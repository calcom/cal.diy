import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "../types/events";
import { buildOverlapGroups, calculateEventLayouts, createLayoutMap, sortEvents } from "./overlap";

describe("overlap utility", () => {
  describe("sortEvents", () => {
    it("should sort events by start time ascending", () => {
      const events: CalendarEvent[] = [
        {
          id: 1,
          title: "Event 1",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T11:00:00"),
        },
        {
          id: 2,
          title: "Event 2",
          start: new Date("2024-01-01T09:00:00"),
          end: new Date("2024-01-01T10:00:00"),
        },
        {
          id: 3,
          title: "Event 3",
          start: new Date("2024-01-01T11:00:00"),
          end: new Date("2024-01-01T12:00:00"),
        },
      ];

      const sorted = sortEvents(events);

      expect(sorted[0].id).toBe(2);
      expect(sorted[1].id).toBe(1);
      expect(sorted[2].id).toBe(3);
    });

    it("should sort events with same start time by end time descending (longer first)", () => {
      const events: CalendarEvent[] = [
        {
          id: 1,
          title: "Event 1",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T11:00:00"),
        },
        {
          id: 2,
          title: "Event 2",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T12:00:00"),
        },
        {
          id: 3,
          title: "Event 3",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T10:30:00"),
        },
      ];

      const sorted = sortEvents(events);

      expect(sorted[0].id).toBe(2); // Longest (2 hours)
      expect(sorted[1].id).toBe(1); // Medium (1 hour)
      expect(sorted[2].id).toBe(3); // Shortest (30 min)
    });

    it("should not mutate the original array", () => {
      const events: CalendarEvent[] = [
        {
          id: 1,
          title: "Event 1",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T11:00:00"),
        },
        {
          id: 2,
          title: "Event 2",
          start: new Date("2024-01-01T09:00:00"),
          end: new Date("2024-01-01T10:00:00"),
        },
      ];

      const originalFirstId = events[0].id;
      sortEvents(events);

      expect(events[0].id).toBe(originalFirstId);
    });
  });

  describe("buildOverlapGroups", () => {
    it("should return empty array for no events", () => {
      const groups = buildOverlapGroups([]);
      expect(groups).toEqual([]);
    });

    it("should return single group for single event", () => {
      const events: CalendarEvent[] = [
        {
          id: 1,
          title: "Event 1",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T11:00:00"),
        },
      ];

      const groups = buildOverlapGroups(events);

      expect(groups).toHaveLength(1);
      expect(groups[0]).toHaveLength(1);
      expect(groups[0][0].id).toBe(1);
    });

    it("should group two overlapping events together", () => {
      const events: CalendarEvent[] = [
        {
          id: 1,
          title: "Event 1",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T11:00:00"),
        },
        {
          id: 2,
          title: "Event 2",
          start: new Date("2024-01-01T10:30:00"),
          end: new Date("2024-01-01T11:30:00"),
        },
      ];

      const sorted = sortEvents(events);
      const groups = buildOverlapGroups(sorted);

      expect(groups).toHaveLength(1);
      expect(groups[0]).toHaveLength(2);
      expect(groups[0][0].id).toBe(1);
      expect(groups[0][1].id).toBe(2);
    });

    it("should separate non-overlapping events into different groups", () => {
      const events: CalendarEvent[] = [
        {
          id: 1,
          title: "Event 1",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T11:00:00"),
        },
        {
          id: 2,
          title: "Event 2",
          start: new Date("2024-01-01T11:00:00"),
          end: new Date("2024-01-01T12:00:00"),
        },
      ];

      const sorted = sortEvents(events);
      const groups = buildOverlapGroups(sorted);

      expect(groups).toHaveLength(2);
      expect(groups[0]).toHaveLength(1);
      expect(groups[1]).toHaveLength(1);
      expect(groups[0][0].id).toBe(1);
      expect(groups[1][0].id).toBe(2);
    });

    it("should handle chain overlaps (A overlaps B, B overlaps C)", () => {
      const events: CalendarEvent[] = [
        {
          id: 1,
          title: "Event 1",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T11:00:00"),
        },
        {
          id: 2,
          title: "Event 2",
          start: new Date("2024-01-01T10:30:00"),
          end: new Date("2024-01-01T11:30:00"),
        },
        {
          id: 3,
          title: "Event 3",
          start: new Date("2024-01-01T11:00:00"),
          end: new Date("2024-01-01T12:00:00"),
        },
      ];

      const sorted = sortEvents(events);
      const groups = buildOverlapGroups(sorted);

      expect(groups).toHaveLength(1);
      expect(groups[0]).toHaveLength(3);
      expect(groups[0][0].id).toBe(1);
      expect(groups[0][1].id).toBe(2);
      expect(groups[0][2].id).toBe(3);
    });

    it("should handle multiple separate overlap groups", () => {
      const events: CalendarEvent[] = [
        {
          id: 1,
          title: "Event 1",
          start: new Date("2024-01-01T09:00:00"),
          end: new Date("2024-01-01T10:00:00"),
        },
        {
          id: 2,
          title: "Event 2",
          start: new Date("2024-01-01T09:30:00"),
          end: new Date("2024-01-01T10:30:00"),
        },
        {
          id: 3,
          title: "Event 3",
          start: new Date("2024-01-01T11:00:00"),
          end: new Date("2024-01-01T12:00:00"),
        },
        {
          id: 4,
          title: "Event 4",
          start: new Date("2024-01-01T11:30:00"),
          end: new Date("2024-01-01T12:30:00"),
        },
      ];

      const sorted = sortEvents(events);
      const groups = buildOverlapGroups(sorted);

      expect(groups).toHaveLength(2);
      expect(groups[0]).toHaveLength(2);
      expect(groups[1]).toHaveLength(2);
      expect(groups[0][0].id).toBe(1);
      expect(groups[0][1].id).toBe(2);
      expect(groups[1][0].id).toBe(3);
      expect(groups[1][1].id).toBe(4);
    });

    it("should handle events that start at the same time", () => {
      const events: CalendarEvent[] = [
        {
          id: 1,
          title: "Event 1",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T12:00:00"),
        },
        {
          id: 2,
          title: "Event 2",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T11:00:00"),
        },
        {
          id: 3,
          title: "Event 3",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T10:30:00"),
        },
      ];

      const sorted = sortEvents(events);
      const groups = buildOverlapGroups(sorted);

      expect(groups).toHaveLength(1);
      expect(groups[0]).toHaveLength(3);
    });
  });

  describe("calculateEventLayouts", () => {
    it("should calculate layout for single event", () => {
      const events: CalendarEvent[] = [
        {
          id: 1,
          title: "Event 1",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T11:00:00"),
        },
      ];

      const layouts = calculateEventLayouts(events);

      expect(layouts).toHaveLength(1);
      expect(layouts[0].event.id).toBe(1);
      expect(layouts[0].leftOffsetPercent).toBe(0);
      expect(layouts[0].widthPercent).toBe(99.5);
      expect(layouts[0].baseZIndex).toBe(60);
      expect(layouts[0].groupIndex).toBe(0);
      expect(layouts[0].indexInGroup).toBe(0);
    });

    it("should calculate cascading layout for two overlapping events", () => {
      const events: CalendarEvent[] = [
        {
          id: 1,
          title: "Event 1",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T11:00:00"),
        },
        {
          id: 2,
          title: "Event 2",
          start: new Date("2024-01-01T10:30:00"),
          end: new Date("2024-01-01T11:30:00"),
        },
      ];

      const layouts = calculateEventLayouts(events);

      expect(layouts).toHaveLength(2);

      expect(layouts[0].event.id).toBe(1);
      expect(layouts[0].leftOffsetPercent).toBe(0);
      expect(layouts[0].widthPercent).toBe(80);
      expect(layouts[0].baseZIndex).toBe(60);

      expect(layouts[1].event.id).toBe(2);
      expect(layouts[1].leftOffsetPercent).toBe(49.5);
      expect(layouts[1].widthPercent).toBe(50);
      expect(layouts[1].baseZIndex).toBe(61);
    });

    it("should calculate cascading layout for three overlapping events", () => {
      const events: CalendarEvent[] = [
        {
          id: 1,
          title: "Event 1",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T11:00:00"),
        },
        {
          id: 2,
          title: "Event 2",
          start: new Date("2024-01-01T10:30:00"),
          end: new Date("2024-01-01T11:30:00"),
        },
        {
          id: 3,
          title: "Event 3",
          start: new Date("2024-01-01T11:00:00"),
          end: new Date("2024-01-01T12:00:00"),
        },
      ];

      const layouts = calculateEventLayouts(events);

      expect(layouts).toHaveLength(3);

      expect(layouts[0].leftOffsetPercent).toBe(0);
      expect(layouts[1].leftOffsetPercent).toBeCloseTo(35.315, 1);
      expect(layouts[2].leftOffsetPercent).toBe(66.5);

      expect(layouts[0].baseZIndex).toBe(60);
      expect(layouts[1].baseZIndex).toBe(61);
      expect(layouts[2].baseZIndex).toBe(62);
    });

    it("should respect custom baseZIndex configuration", () => {
      const events: CalendarEvent[] = [
        {
          id: 1,
          title: "Event 1",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T11:00:00"),
        },
        {
          id: 2,
          title: "Event 2",
          start: new Date("2024-01-01T10:30:00"),
          end: new Date("2024-01-01T11:30:00"),
        },
      ];

      const layouts = calculateEventLayouts(events, {
        baseZIndex: 50,
      });

      expect(layouts[0].baseZIndex).toBe(50);
      expect(layouts[1].baseZIndex).toBe(51);
    });

    it("should handle non-overlapping events in separate groups", () => {
      const events: CalendarEvent[] = [
        {
          id: 1,
          title: "Event 1",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T11:00:00"),
        },
        {
          id: 2,
          title: "Event 2",
          start: new Date("2024-01-01T11:00:00"),
          end: new Date("2024-01-01T12:00:00"),
        },
      ];

      const layouts = calculateEventLayouts(events);

      expect(layouts).toHaveLength(2);

      expect(layouts[0].groupIndex).toBe(0);
      expect(layouts[0].indexInGroup).toBe(0);
      expect(layouts[0].leftOffsetPercent).toBe(0);

      expect(layouts[1].groupIndex).toBe(1);
      expect(layouts[1].indexInGroup).toBe(0);
      expect(layouts[1].leftOffsetPercent).toBe(0);
    });

    it("should prevent overflow with many overlapping events (dense scenario)", () => {
      const events: CalendarEvent[] = [
        {
          id: 1,
          title: "Event 1",
          start: new Date("2024-01-01T09:00:00"),
          end: new Date("2024-01-01T09:30:00"),
        },
        {
          id: 2,
          title: "Event 2",
          start: new Date("2024-01-01T09:15:00"),
          end: new Date("2024-01-01T10:00:00"),
        },
        {
          id: 3,
          title: "Event 3",
          start: new Date("2024-01-01T09:45:00"),
          end: new Date("2024-01-01T11:00:00"),
        },
        {
          id: 4,
          title: "Event 4",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T10:30:00"),
        },
        {
          id: 5,
          title: "Event 5",
          start: new Date("2024-01-01T10:15:00"),
          end: new Date("2024-01-01T11:30:00"),
        },
        {
          id: 6,
          title: "Event 6",
          start: new Date("2024-01-01T11:00:00"),
          end: new Date("2024-01-01T12:00:00"),
        },
        {
          id: 7,
          title: "Event 7",
          start: new Date("2024-01-01T11:30:00"),
          end: new Date("2024-01-01T12:30:00"),
        },
        {
          id: 8,
          title: "Event 8",
          start: new Date("2024-01-01T12:00:00"),
          end: new Date("2024-01-01T13:30:00"),
        },
        {
          id: 9,
          title: "Event 9",
          start: new Date("2024-01-01T12:30:00"),
          end: new Date("2024-01-01T13:00:00"),
        },
        {
          id: 10,
          title: "Event 10",
          start: new Date("2024-01-01T13:00:00"),
          end: new Date("2024-01-01T14:00:00"),
        },
        {
          id: 11,
          title: "Event 11",
          start: new Date("2024-01-01T13:15:00"),
          end: new Date("2024-01-01T14:00:00"),
        },
      ];

      const layouts = calculateEventLayouts(events);

      layouts.forEach((layout) => {
        const totalWidth = layout.leftOffsetPercent + layout.widthPercent;
        expect(totalWidth).toBeLessThanOrEqual(100 - 0.5);
      });

      expect(layouts).toHaveLength(11);
    });

    it("should respect safety margin with 20+ overlapping events", () => {
      const events: CalendarEvent[] = Array.from({ length: 21 }, (_, i) => ({
        id: i + 1,
        title: `Event ${i + 1}`,
        start: new Date(`2024-01-01T09:${String(i * 2).padStart(2, "0")}:00`),
        end: new Date(`2024-01-01T10:${String(i * 2).padStart(2, "0")}:00`),
      }));

      const layouts = calculateEventLayouts(events);

      expect(layouts).toHaveLength(21);

      layouts.forEach((layout) => {
        const totalWidth = layout.leftOffsetPercent + layout.widthPercent;
        expect(totalWidth).toBeLessThanOrEqual(100 - 0.5);
      });

      const lastLayout = layouts[layouts.length - 1];
      expect(lastLayout.leftOffsetPercent + lastLayout.widthPercent).toBeLessThanOrEqual(99.5);
    });

    it("should compress offset step for dense overlaps while maintaining cascade", () => {
      const events: CalendarEvent[] = Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        title: `Event ${i + 1}`,
        start: new Date(`2024-01-01T10:${String(i * 5).padStart(2, "0")}:00`),
        end: new Date(`2024-01-01T11:${String(i * 5).padStart(2, "0")}:00`),
      }));

      const layouts = calculateEventLayouts(events);

      expect(layouts).toHaveLength(12);

      layouts.forEach((layout, index) => {
        expect(layout.leftOffsetPercent + layout.widthPercent).toBeLessThanOrEqual(100);

        if (index > 0) {
          expect(layout.leftOffsetPercent).toBeGreaterThan(layouts[index - 1].leftOffsetPercent);
        }
      });

      const lastLayout = layouts[layouts.length - 1];
      expect(lastLayout.leftOffsetPercent + lastLayout.widthPercent).toBeLessThanOrEqual(100);
    });

    it("should use dynamic width for three overlapping events", () => {
      const events: CalendarEvent[] = [
        {
          id: 1,
          title: "Event 1",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T11:00:00"),
        },
        {
          id: 2,
          title: "Event 2",
          start: new Date("2024-01-01T10:30:00"),
          end: new Date("2024-01-01T11:30:00"),
        },
        {
          id: 3,
          title: "Event 3",
          start: new Date("2024-01-01T11:00:00"),
          end: new Date("2024-01-01T12:00:00"),
        },
      ];

      const layouts = calculateEventLayouts(events);

      expect(layouts[0].widthPercent).toBe(55);
      expect(layouts[1].widthPercent).toBeCloseTo(41.9, 0);
      expect(layouts[2].widthPercent).toBe(33);

      expect(layouts[0].leftOffsetPercent).toBe(0);
      expect(layouts[1].leftOffsetPercent).toBeCloseTo(35.315, 1);
      expect(layouts[2].leftOffsetPercent).toBe(66.5);
    });
  });

  describe("createLayoutMap", () => {
    it("should create a map from event ID to layout", () => {
      const events: CalendarEvent[] = [
        {
          id: 1,
          title: "Event 1",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T11:00:00"),
        },
        {
          id: 2,
          title: "Event 2",
          start: new Date("2024-01-01T10:30:00"),
          end: new Date("2024-01-01T11:30:00"),
        },
      ];

      const layouts = calculateEventLayouts(events);
      const map = createLayoutMap(layouts);

      expect(map.size).toBe(2);
      expect(map.get(1)?.event.id).toBe(1);
      expect(map.get(2)?.event.id).toBe(2);
      expect(map.get(1)?.leftOffsetPercent).toBe(0);
      expect(map.get(2)?.leftOffsetPercent).toBe(49.5);
      expect(map.get(1)?.widthPercent).toBe(80);
      expect(map.get(2)?.widthPercent).toBe(50);
    });

    it("should handle empty layouts", () => {
      const map = createLayoutMap([]);
      expect(map.size).toBe(0);
    });
    it("should retrieve layout when event id is 0", () => {
      const events: CalendarEvent[] = [
        {
          id: 0,
          title: "Event 0",
          start: new Date("2024-01-01T10:00:00"),
          end: new Date("2024-01-01T11:00:00"),
        },
      ];

      const layouts = calculateEventLayouts(events);
      const map = createLayoutMap(layouts);

      expect(map.has(0)).toBe(true);
      expect(map.get(0)?.event.id).toBe(0);
    });

    it("should not group non-overlapping events when multi-day event is clipped to day segment", () => {
      const events: CalendarEvent[] = [
        {
          id: 1,
          title: "Multi-day morning segment",
          start: new Date("2024-01-01T00:00:00"),
          end: new Date("2024-01-01T11:00:00"),
        },
        {
          id: 2,
          title: "Afternoon event",
          start: new Date("2024-01-01T15:00:00"),
          end: new Date("2024-01-01T16:00:00"),
        },
      ];

      const layouts = calculateEventLayouts(events);
      expect(layouts[0].groupIndex).toBe(0);
      expect(layouts[1].groupIndex).toBe(1);
      expect(layouts[0].widthPercent).toBe(99.5);
      expect(layouts[1].widthPercent).toBe(99.5);
    });
  });
});
