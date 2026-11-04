import { addDays, atMinutes, startOfWeek } from "./dates.ts";
import type { CategoryId } from "./types.ts";

interface SampleBlock {
  title: string;
  category: CategoryId;
  start: string;
  end: string;
}

const PLAN: [day: number, from: number, to: number, category: CategoryId, title: string][] = [
  [0, 7, 15, "nursing", "Clinical shift"],
  [0, 17, 19, "free", "Free time"],
  [0, 20, 22.5, "production", "Beat session"],
  [1, 9, 12, "school", "Pathophysiology lecture"],
  [1, 13, 16, "free", "Free time"],
  [1, 17, 21, "duty", "Mursezan on duty"],
  [2, 7, 15, "nursing", "Clinical shift"],
  [2, 16, 17.5, "free", "Free time"],
  [3, 9, 12, "school", "Pharmacology"],
  [3, 12.5, 14, "free", "Free time"],
  [3, 14, 18, "work", "Work"],
  [4, 9, 13, "work", "Work"],
  [4, 14, 17, "free", "Free time"],
  [4, 20, 23, "production", "Mix & master"],
  [5, 10, 16, "duty", "Mursezan on duty"],
  [5, 17, 19, "free", "Free time"],
  [6, 11, 14, "production", "Studio"],
  [6, 15, 18, "free", "Free time"],
];

export function sampleWeek(reference: Date): SampleBlock[] {
  const monday = startOfWeek(reference);
  return PLAN.map(([day, from, to, category, title]) => {
    const d = addDays(monday, day);
    return {
      title,
      category,
      start: atMinutes(d, from * 60).toISOString(),
      end: atMinutes(d, to * 60).toISOString(),
    };
  });
}
