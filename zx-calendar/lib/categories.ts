import type { CategoryId } from "./types.ts";

/** Brand palette: Icy Blue, Cornflower Blue, Persian Blue, Dusk Blue, Deep Navy. */
export const PALETTE = {
  icy: "#ABD2FA",
  cornflower: "#7692FF",
  persian: "#1B2CC1",
  dusk: "#3D518C",
  navy: "#091540",
} as const;

export interface CategoryStyle {
  id: CategoryId;
  label: string;
  short: string;
  /** Background used for event cards. */
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
    fill: "linear-gradient(160deg, #C4DFFC 0%, #ABD2FA 55%, #93BEF3 100%)",
    accent: PALETTE.icy,
    ink: PALETTE.navy,
  },
  nursing: {
    id: "nursing",
    label: "Nursing",
    short: "Nursing",
    fill: "linear-gradient(160deg, #8AA3FF 0%, #7692FF 100%)",
    accent: PALETTE.cornflower,
    ink: "#FFFFFF",
  },
  school: {
    id: "school",
    label: "School",
    short: "School",
    fill: "linear-gradient(160deg, #2A3BD6 0%, #1B2CC1 100%)",
    accent: "#3345E0",
    ink: "#FFFFFF",
  },
  production: {
    id: "production",
    label: "Production (music)",
    short: "Production",
    fill: "linear-gradient(160deg, #6A5CFF 0%, #4B3FD8 100%)",
    accent: "#6A5CFF",
    ink: "#FFFFFF",
  },
  work: {
    id: "work",
    label: "Working",
    short: "Work",
    fill: "linear-gradient(160deg, #4A5F9E 0%, #3D518C 100%)",
    accent: PALETTE.dusk,
    ink: "#E3ECFD",
  },
  duty: {
    id: "duty",
    label: "On duty · Mursezan",
    short: "Mursezan",
    fill: "linear-gradient(160deg, #13235E 0%, #091540 100%)",
    accent: "#2B3E8F",
    ink: PALETTE.icy,
  },
  personal: {
    id: "personal",
    label: "Personal",
    short: "Personal",
    fill: "linear-gradient(160deg, rgba(171, 210, 250, 0.18) 0%, rgba(118, 146, 255, 0.12) 100%)",
    accent: "#8FA6D9",
    ink: "#D6E6FC",
  },
};

export const BOOKING_STYLE = {
  fill: "linear-gradient(135deg, #1B2CC1 0%, #7692FF 60%, #ABD2FA 130%)",
  accent: "#FFFFFF",
  ink: "#FFFFFF",
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
