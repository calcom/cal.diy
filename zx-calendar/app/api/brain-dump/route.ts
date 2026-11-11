import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { isExecutive, unauthorized } from "@/lib/auth";
import { aiConfigured, BrainDumpError, parseWithClaude } from "@/lib/brainDumpAI";
import { BrainDumpInput, firstIssue } from "@/lib/validation";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!(await isExecutive())) return unauthorized();
  if (!aiConfigured) {
    // The client falls back to its built-in offline parser on this status.
    return NextResponse.json({ error: "ai_unavailable" }, { status: 503 });
  }
  const parsed = BrainDumpInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });

  try {
    return NextResponse.json(await parseWithClaude(parsed.data));
  } catch (error) {
    if (error instanceof BrainDumpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "The AI is busy right now — try again in a moment." },
        { status: 429 }
      );
    }
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("[brain-dump] Anthropic authentication failed", error.message);
      return NextResponse.json({ error: "ai_unavailable" }, { status: 503 });
    }
    if (error instanceof Anthropic.APIError) {
      console.error("[brain-dump] Anthropic API error", error.status, error.message);
      return NextResponse.json({ error: "The AI couldn't parse that right now." }, { status: 502 });
    }
    throw error;
  }
}
