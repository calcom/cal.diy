import "server-only";

import process from "node:process";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { BrainDumpResult } from "./types";
import { CATEGORY_IDS } from "./types";

export const aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

const LOCAL_DATETIME =
  "Local wall-clock time in the user's timezone, formatted YYYY-MM-DDTHH:mm (no offset).";

const ResultSchema = z.object({
  events: z.array(
    z.object({
      title: z.string().describe("Short, clean calendar title (3–7 words), sentence case."),
      category: z.enum(CATEGORY_IDS),
      start: z.string().describe(LOCAL_DATETIME),
      end: z.string().describe(LOCAL_DATETIME),
      notes: z.string().nullable().describe("Extra context from the dump, or null."),
    })
  ),
  tasks: z.array(
    z.object({
      title: z.string().describe("Short, actionable task title starting with a verb."),
      due: z.string().nullable().describe("Due date YYYY-MM-DD, or null if none was implied."),
      notes: z.string().nullable(),
    })
  ),
  summary: z.string().describe("One friendly sentence summarising what was scheduled."),
});

export interface BrainDumpRequest {
  text: string;
  /** Requester's current local time, YYYY-MM-DDTHH:mm. */
  now: string;
  weekday: string;
  timezone: string;
  /** Existing commitments over the next two weeks, as local times. */
  busy: { title: string; category: string; start: string; end: string }[];
}

const SYSTEM_PROMPT = `You turn a chaotic "brain dump" paragraph into a clean schedule for Z, who juggles nursing shifts, school, music production, a job, on-duty shifts for Mursezan, and personal life.

Split the dump into discrete items and decide for each whether it is:
- an EVENT: something that occupies time on the calendar (calls, focus blocks, classes, sessions, appointments). Give it a concrete start and end.
- a TASK: a to-do or reminder with at most a due date (payments, submissions, "remind me to…").

Scheduling rules:
- Resolve relative dates ("Tuesday", "next Friday", "the 1st", "tomorrow") against the provided current date. A weekday with no qualifier means its next occurrence (today counts only if the time has not passed). "The 1st" means the next 1st of a month that is not in the past.
- When no time is given, pick a sensible slot between 08:00 and 21:00 that does not overlap the existing commitments listed. Prefer the earliest reasonable fit inside the range the user implied ("sometime this week" = before the end of Sunday).
- Default durations when unspecified: calls 30 min, meetings 60 min, focus/deep work 120 min, errands 60 min.
- Categories: free (explicit downtime/"free"), nursing (clinicals, shifts, patient care), school (classes, studying, assignments), production (music: beats, mixing, studio, writing songs), work (the job, deep work, documents like SOPs), duty (on duty/on call for Mursezan), personal (family, friends, health, chores).
- Never invent items the user did not mention. Keep titles short and human.`;

export async function parseWithClaude(req: BrainDumpRequest): Promise<BrainDumpResult> {
  const client = new Anthropic();

  const busyList = req.busy.length
    ? req.busy.map((b) => `- ${b.start} → ${b.end} · ${b.title} (${b.category})`).join("\n")
    : "(none)";

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: betaZodOutputFormat(ResultSchema) },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Current local time: ${req.now} (${req.weekday}), timezone ${req.timezone}.

Existing commitments (avoid overlapping these):
${busyList}

Brain dump:
"""
${req.text}
"""`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new BrainDumpError("Claude declined to process this text. Try rephrasing it.", 422);
  }
  const parsed = response.parsed_output;
  if (!parsed) {
    throw new BrainDumpError("Claude's response could not be read. Please try again.", 502);
  }
  return { ...parsed, engine: "claude" };
}

export class BrainDumpError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}
