import type { ReactNode } from "react";

export function DurationText({ label, children }: { label: string; children: ReactNode }) {
  return <span aria-label={label}>{children}</span>;
}
