import type { CategoryId } from "./types.ts";

export interface CategoryStyle {
  id: CategoryId;
  label: string;
  short: string;
  /** Gradient fill used for event cards. */
  fill: string;
  /** Solid accent (dots, bars, charts). */
  accent: string;
  ink: string;
}

export const CATEGORIES: Record<CategoryId, CategoryStyle> = {
  free: {
    id: "free",
    label: "Free time",
    short: "Free",
    fill: "linear-gradient(165deg, #E4F1E0 0%, #BCD2B7 100%)",
    accent: "#8FAE8A",
    ink: "#27402B",
  },
  nursing: {
    id: "nursing",
    label: "Nursing",
    short: "Nursing",
    fill: "linear-gradient(165deg, #E0FAFF 0%, #9FE2EE 100%)",
    accent: "#5FC3D6",
    ink: "#12505C",
  },
  school: {
    id: "school",
    label: "School",
    short: "School",
    fill: "linear-gradient(165deg, #CFDDF2 0%, #80A4D4 100%)",
    accent: "#80A4D4",
    ink: "#18304F",
  },
  production: {
    id: "production",
    label: "Production (music)",
    short: "Production",
    fill: "linear-gradient(165deg, #A9A4E4 0%, #7B75C9 100%)",
    accent: "#7B75C9",
    ink: "#FFFFFF",
  },
  work: {
    id: "work",
    label: "Working",
    short: "Work",
    fill: "linear-gradient(165deg, #E6EAE8 0%, #BCC5C0 100%)",
    accent: "#9AA6A0",
    ink: "#262D2A",
  },
  duty: {
    id: "duty",
    label: "On duty · Mursezan",
    short: "Mursezan",
    fill: "linear-gradient(165deg, #6C67B8 0%, #45408C 100%)",
    accent: "#4F4A9A",
    ink: "#FFFFFF",
  },
  personal: {
    id: "personal",
    label: "Personal",
    short: "Personal",
    fill: "linear-gradient(165deg, #F4FBF6 0%, #EAF7ED 100%)",
    accent: "#B9D3BF",
    ink: "#34503C",
  },
};

export const BOOKING_STYLE = {
  fill: "linear-gradient(165deg, #2B302F 0%, #1B1F1E 100%)",
  accent: "#1D2221",
  ink: "#F3F6F4",
};

export const CATEGORY_ORDER: CategoryId[] = [
  "free",
  "nursing",
  "school",
  "production",
  "work",
  "duty",
  "personal",
];
