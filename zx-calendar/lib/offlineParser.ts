/**
 * Rule-based brain-dump parser used when no ANTHROPIC_API_KEY is configured.
 * It runs in the browser so relative dates resolve in the user's own timezone.
 */
import {
  addDays,
  addMinutes,
  atMinutes,
  MINUTE,
  overlaps,
  startOfDay,
  toDateKey,
  toLocalDateTime,
} from "./dates.ts";
import type { BrainDumpEvent, BrainDumpResult, BrainDumpTask, CategoryId } from "./types.ts";

interface Busy {
  start: Date;
  end: Date;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_RE = "(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const CATEGORY_KEYWORDS: [CategoryId, RegExp][] = [
  ["duty", /\b(mursezan|on duty|on[- ]call|duty)\b/i],
  ["nursing", /\b(nurs\w*|clinical\w*|shift|patient\w*|hospital|ward|rotation)\b/i],
  ["school", /\b(class\w*|school|lecture|exam|quiz|study|studying|homework|assignment|seminar|thesis)\b/i],
  ["production", /\b(beat\w*|music|studio|mix\w*|master\w*|produc\w*|track\w*|song\w*|record\w*|session)\b/i],
  ["work", /\b(work|deep work|meeting|sop|report|client|office|draft|proposal|standup)\b/i],
  ["free", /\b(free time|chill|rest|nap|downtime|relax)\b/i],
];

const TASK_HINT =
  /\b(remind me|don'?t forget|pay|submit|due|deadline|renew|buy|order|file|send|todo|to-do)\b/i;

export function splitClauses(text: string): string[] {
  return text
    .split(
      /[.;!?\n]+|,\s*(?:and\s+)?(?=(?:also\s+)?(?:i\s+)?(?:need|remind|block|call|pay|schedule|book|add|and|don'?t|plus|then|gotta|have)\b)|\s+(?:and|also|plus)\s+(?=(?:i\s+)?(?:need|remind|block|call|pay|schedule|book|add|don'?t|gotta|have to)\b)/i
    )
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

/** Upcoming occurrence of `weekday`; today counts unless `skipToday`. */
function nextWeekday(from: Date, weekday: number, skipToday: boolean): Date {
  const today = startOfDay(from);
  let diff = (weekday - today.getDay() + 7) % 7;
  if (skipToday && diff === 0) diff = 7;
  return addDays(today, diff);
}

interface DateRange {
  from: Date;
  to: Date;
  exact: boolean;
  phrase: RegExp;
}

export function findDate(clause: string, now: Date): DateRange | null {
  const today = startOfDay(now);
  const lower = clause.toLowerCase();

  if (/\b(today|tonight|this evening|this afternoon)\b/.test(lower)) {
    return {
      from: today,
      to: today,
      exact: true,
      phrase: /\b(today|tonight|this evening|this afternoon)\b/i,
    };
  }
  if (/\btomorrow\b/.test(lower)) {
    const d = addDays(today, 1);
    return { from: d, to: d, exact: true, phrase: /\btomorrow\b/i };
  }

  const weekdayMatch = new RegExp(`\\b(next\\s+|this\\s+|on\\s+)?${WEEKDAY_RE}\\b`, "i").exec(clause);
  if (weekdayMatch) {
    const key = weekdayMatch[2].toLowerCase().slice(0, 3);
    const index = WEEKDAYS.findIndex((w) => w.startsWith(key));
    const d = nextWeekday(now, index, /next/i.test(weekdayMatch[1] ?? ""));
    return {
      from: d,
      to: d,
      exact: true,
      phrase: new RegExp(`\\b(next\\s+|this\\s+|on\\s+)?${WEEKDAY_RE}\\b`, "i"),
    };
  }

  const monthDay = new RegExp(
    `\\b(?:on\\s+)?(${MONTHS.join("|")})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
    "i"
  ).exec(clause);
  if (monthDay) {
    const month = MONTHS.indexOf(monthDay[1].toLowerCase().slice(0, 3));
    let d = new Date(today.getFullYear(), month, Number(monthDay[2]));
    if (d < today) d = new Date(today.getFullYear() + 1, month, Number(monthDay[2]));
    return {
      from: d,
      to: d,
      exact: true,
      phrase: new RegExp(monthDay[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    };
  }

  const ordinal = /\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/i.exec(clause);
  if (ordinal) {
    const dayOfMonth = Number(ordinal[1]);
    let d = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
    if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth);
    return { from: d, to: d, exact: true, phrase: /\b(?:on\s+)?the\s+\d{1,2}(?:st|nd|rd|th)\b/i };
  }

  if (/\bnext week\b/.test(lower)) {
    const monday = addDays(today, (8 - today.getDay()) % 7 || 7);
    return { from: monday, to: addDays(monday, 6), exact: false, phrase: /\b(sometime\s+)?next week\b/i };
  }
  if (/\b(this week|sometime|at some point|soon)\b/.test(lower)) {
    const sunday = addDays(today, (7 - today.getDay()) % 7);
    return {
      from: today,
      to: sunday,
      exact: false,
      phrase: /\b(sometime\s+)?(this week|at some point|soon)\b|\bsometime\b/i,
    };
  }
  if (/\bweekend\b/.test(lower)) {
    const saturday = addDays(today, (6 - today.getDay() + 7) % 7);
    return {
      from: saturday,
      to: addDays(saturday, 1),
      exact: false,
      phrase: /\b(this\s+|on the\s+)?weekend\b/i,
    };
  }
  return null;
}

export function findTime(clause: string): { minutes: number; phrase: RegExp } | null {
  const ampm = /\b(?:at\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i.exec(clause);
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (/p/i.test(ampm[3])) hour += 12;
    return {
      minutes: hour * 60 + Number(ampm[2] ?? 0),
      phrase: /\b(?:at\s+|@\s*)?\d{1,2}(?::\d{2})?\s*(am|pm|a\.m\.|p\.m\.)/i,
    };
  }
  const clock = /\bat\s+(\d{1,2}):(\d{2})\b/i.exec(clause);
  if (clock) return { minutes: Number(clock[1]) * 60 + Number(clock[2]), phrase: /\bat\s+\d{1,2}:\d{2}\b/i };
  if (/\bnoon\b/i.test(clause)) return { minutes: 12 * 60, phrase: /\b(at\s+)?noon\b/i };
  if (/\btonight\b/i.test(clause)) return { minutes: 19 * 60, phrase: /\btonight\b/i };
  if (/\bmorning\b/i.test(clause)) return { minutes: 9 * 60, phrase: /\b(in the |this )?morning\b/i };
  if (/\bafternoon\b/i.test(clause)) return { minutes: 14 * 60, phrase: /\b(in the |this )?afternoon\b/i };
  if (/\bevening\b/i.test(clause)) return { minutes: 18 * 60, phrase: /\b(in the |this )?evening\b/i };
  return null;
}

export function findDuration(clause: string): { minutes: number; phrase: RegExp } | null {
  const numeric = /\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?)\b/i.exec(clause);
  if (numeric) {
    const value = Number(numeric[1]);
    const minutes = /^h/i.test(numeric[2]) ? value * 60 : value;
    return {
      minutes: Math.round(minutes),
      phrase: /\b(for\s+)?\d+(?:\.\d+)?\s*(hours?|hrs?|h|minutes?|mins?)\b/i,
    };
  }
  if (/\bhalf an hour\b/i.test(clause)) return { minutes: 30, phrase: /\b(for\s+)?half an hour\b/i };
  if (/\ban hour\b/i.test(clause)) return { minutes: 60, phrase: /\b(for\s+)?an hour\b/i };
  return null;
}

function categorize(clause: string): CategoryId {
  for (const [id, re] of CATEGORY_KEYWORDS) if (re.test(clause)) return id;
  return "personal";
}

function defaultDuration(clause: string, category: CategoryId): number {
  if (/\bcall|phone|ring\b/i.test(clause)) return 30;
  if (/\bdeep work|focus|write|writing\b/i.test(clause)) return 120;
  if (category === "nursing" || category === "duty") return 480;
  return 60;
}

function cleanTitle(clause: string, phrases: RegExp[]): string {
  let title = clause;
  for (const re of phrases) title = title.replace(re, " ");
  title = title
    .replace(/^\s*(and|also|plus|then|so)\s+/i, "")
    .replace(/\b(i\s+)?(really\s+)?(need|have|got|gotta|want)\s+(to\s+)?/i, "")
    .replace(/\b(please\s+)?(remind me to|remind me|don'?t forget to|make sure to|i should)\b/i, "")
    .replace(/^\s*(block|schedule|book|add|put)\s+(in\s+|out\s+)?(time\s+)?(for\s+)?/i, "")
    .replace(/^\s*(for|to)\s+/i, "")
    .replace(/\s+(on|at|by|for|in)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!title) return "Untitled";
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** First gap of `minutes` between 08:00 and 21:00 on days in [from, to], at or after `notBefore`. */
export function findSlot(from: Date, to: Date, minutes: number, busy: Busy[], notBefore: Date): Date | null {
  const sorted = [...busy].sort((a, b) => a.start.getTime() - b.start.getTime());
  for (let day = startOfDay(from); day <= to; day = addDays(day, 1)) {
    const dayEnd = atMinutes(day, 21 * 60);
    let candidate = atMinutes(day, 8 * 60);
    if (candidate < notBefore) {
      const rounded = Math.ceil(notBefore.getTime() / (30 * MINUTE)) * 30 * MINUTE;
      candidate = new Date(rounded);
    }
    for (const b of sorted) {
      const candidateEnd = addMinutes(candidate, minutes);
      if (candidateEnd > dayEnd) break;
      if (overlaps(candidate.getTime(), candidateEnd.getTime(), b.start.getTime(), b.end.getTime())) {
        candidate = new Date(Math.max(candidate.getTime(), b.end.getTime()));
      }
    }
    if (addMinutes(candidate, minutes) <= dayEnd && startOfDay(candidate).getTime() === day.getTime()) {
      return candidate;
    }
  }
  return null;
}

export function parseOffline(text: string, now: Date, existing: Busy[]): BrainDumpResult {
  const events: BrainDumpEvent[] = [];
  const tasks: BrainDumpTask[] = [];
  const busy = [...existing];

  for (const clause of splitClauses(text)) {
    const date = findDate(clause, now);
    const time = findTime(clause);
    const duration = findDuration(clause);
    const phrases = [date?.phrase, time?.phrase, duration?.phrase].filter((p): p is RegExp => Boolean(p));
    const title = cleanTitle(clause, phrases);
    const category = categorize(clause);

    const looksLikeTask = TASK_HINT.test(clause) && !time && !duration;
    if (looksLikeTask || (!date && !time && !duration)) {
      tasks.push({ title, due: date ? toDateKey(date.from) : null, notes: null });
      continue;
    }

    const minutes = duration?.minutes ?? defaultDuration(clause, category);
    const from = date?.from ?? startOfDay(now);
    let start: Date | null = null;
    if (time) {
      start = atMinutes(from, time.minutes);
      if (!date && start < now) start = addDays(start, 1);
    } else {
      start = findSlot(from, date?.to ?? addDays(from, 6), minutes, busy, now);
    }
    if (!start) {
      tasks.push({
        title,
        due: date ? toDateKey(date.to) : null,
        notes: "Couldn't find a free slot — schedule manually.",
      });
      continue;
    }
    const end = addMinutes(start, minutes);
    busy.push({ start, end });
    events.push({ title, category, start: toLocalDateTime(start), end: toLocalDateTime(end), notes: null });
  }

  const parts = [
    events.length && `${events.length} event${events.length === 1 ? "" : "s"}`,
    tasks.length && `${tasks.length} task${tasks.length === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return {
    events,
    tasks,
    summary: parts.length
      ? `Found ${parts.join(" and ")}.`
      : "Nothing to schedule found — try adding days or times.",
    engine: "offline",
  };
}
