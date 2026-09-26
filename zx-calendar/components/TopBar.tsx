"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "./Icons";

const TABS = [
  { href: "/executive", label: "Executive" },
  { href: "/team", label: "Team" },
] as const;

export function TopBar({ active, right }: { active: "/executive" | "/team"; right?: ReactNode }) {
  const index = TABS.findIndex((t) => t.href === active);
  return (
    <header className="topbar">
      <Link href="/team" className="brand" aria-label="Z × XOE home">
        <BrandMark />
        <span className="brand-name">
          Z × XOE
          <small>shared calendar</small>
        </span>
      </Link>
      <div className="topbar-spacer" />
      <nav className="tabs" aria-label="Views">
        <span
          className="tabs-indicator"
          style={{ width: `calc((100% - 8px) / ${TABS.length})`, transform: `translateX(${index * 100}%)` }}
        />
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="tab"
            aria-current={tab.href === active ? "page" : undefined}>
            {tab.label}
          </Link>
        ))}
      </nav>
      {right}
    </header>
  );
}
