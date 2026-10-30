import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeIntervals, openWindows, slotStarts, subtractIntervals } from "./availability.ts";
import { parseOffline, splitClauses } from "./offlineParser.ts";

// Friday 2026-09-25 10:00 local
const NOW = new Date(2026, 8, 25, 10, 0);

test("splits a chaotic paragraph into clauses", () => {
  const clauses = splitClauses(
    "Need to call mom Tuesday, block 2 hours for deep work on the SOP draft sometime this week, and remind me to pay rent on the 1st"
  );
  assert.equal(clauses.length, 3);
});

test("parses the canonical brain dump", () => {
  const result = parseOffline(
    "Need to call mom Tuesday, block 2 hours for deep work on the SOP draft sometime this week, and remind me to pay rent on the 1st",
    NOW,
    []
  );
  assert.equal(result.events.length, 2);
  assert.equal(result.tasks.length, 1);

  const call = result.events.find((e) => /mom/i.test(e.title));
  assert.ok(call);
  assert.equal(call.start.slice(0, 10), "2026-09-29");
  assert.equal(call.title, "Call mom");

  const deepWork = result.events.find((e) => /SOP/i.test(e.title));
  assert.ok(deepWork);
  assert.equal(deepWork.category, "work");
  const minutes = (new Date(deepWork.end).getTime() - new Date(deepWork.start).getTime()) / 60_000;
  assert.equal(minutes, 120);
  assert.ok(deepWork.start >= "2026-09-25T10:00" && deepWork.start <= "2026-09-27T21:00");

  assert.equal(result.tasks[0].due, "2026-10-01");
  assert.match(result.tasks[0].title, /pay rent/i);
});

test("respects explicit times and avoids busy slots", () => {
  const busy = [{ start: new Date(2026, 8, 25, 10, 0), end: new Date(2026, 8, 25, 18, 0) }];
  const result = parseOffline(
    "studio session for 3 hours sometime this week. Class tomorrow at 9:30am",
    NOW,
    busy
  );
  const studio = result.events.find((e) => e.category === "production");
  assert.ok(studio);
  assert.equal(studio.start, "2026-09-25T18:00");
  const cls = result.events.find((e) => e.category === "school");
  assert.ok(cls);
  assert.equal(cls.start, "2026-09-26T09:30");
});

test("interval helpers", () => {
  assert.deepEqual(
    mergeIntervals([
      { start: 5, end: 8 },
      { start: 0, end: 5 },
      { start: 10, end: 12 },
    ]),
    [
      { start: 0, end: 8 },
      { start: 10, end: 12 },
    ]
  );
  assert.deepEqual(
    subtractIntervals(
      [
        { start: 0, end: 100 },
        { start: 200, end: 300 },
      ],
      [
        { start: 10, end: 20 },
        { start: 90, end: 210 },
        { start: 250, end: 260 },
      ]
    ),
    [
      { start: 0, end: 10 },
      { start: 20, end: 90 },
      { start: 210, end: 250 },
      { start: 260, end: 300 },
    ]
  );
  assert.deepEqual(openWindows([{ start: 0, end: 100 }], [], 50), [{ start: 50, end: 100 }]);
  const quarter = 15 * 60_000;
  assert.equal(slotStarts({ start: 0, end: 4 * quarter }, 30).length, 3);
});
