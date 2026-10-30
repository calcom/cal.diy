"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark, Lock, Users } from "./Icons";

type Route = "/executive" | "/team";

const ROUTES: { href: Route; label: string; icon: ReactNode }[] = [
  { href: "/executive", label: "Executive", icon: <Lock /> },
  { href: "/team", label: "Team booking", icon: <Users /> },
];

export interface RailSection {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
}

interface AppShellProps {
  active: Route;
  children: ReactNode;
  aside?: ReactNode;
  sections?: RailSection[];
  railCard?: ReactNode;
  railFooter?: ReactNode;
  /** Rendered outside the grid: dock, sheets, dialogs. */
  overlays?: ReactNode;
}

function Brand() {
  return (
    <Link href="/team" className="brand" aria-label="Z × XOE home">
      <BrandMark />
      <span className="brand-name">
        Z × XOE.
        <small>Shared Calendar</small>
      </span>
    </Link>
  );
}

export function AppShell({
  active,
  children,
  aside,
  sections,
  railCard,
  railFooter,
  overlays,
}: AppShellProps) {
  const activeIndex = ROUTES.findIndex((r) => r.href === active);
  return (
    <div className={`app${aside ? "" : " no-aside"}`}>
      <nav className="rail" aria-label="Main">
        <Brand />
        <div className="rail-nav">
          {ROUTES.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className="rail-link"
              aria-current={route.href === active ? "page" : undefined}
              title={route.label}>
              {route.icon}
              <span>{route.label}</span>
            </Link>
          ))}
          {sections && sections.length > 0 && (
            <>
              <p className="rail-label">Jump to</p>
              {sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className="rail-link"
                  onClick={section.onSelect}
                  title={section.label}>
                  {section.icon}
                  <span>{section.label}</span>
                </button>
              ))}
            </>
          )}
        </div>
        <div className="rail-spacer" />
        {railCard && <div className="rail-card">{railCard}</div>}
        {railFooter}
      </nav>

      <header className="mobile-top">
        <Brand />
        <nav className="tabs" aria-label="Views">
          <span
            className="tabs-indicator"
            style={{
              width: `calc((100% - 8px) / ${ROUTES.length})`,
              transform: `translateX(${activeIndex * 100}%)`,
            }}
          />
          {ROUTES.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className="tab"
              aria-current={route.href === active ? "page" : undefined}>
              {route.href === "/executive" ? "Executive" : "Team"}
            </Link>
          ))}
        </nav>
      </header>

      <main className="stage">{children}</main>
      {aside && <aside className="aside">{aside}</aside>}
      {overlays}
    </div>
  );
}
