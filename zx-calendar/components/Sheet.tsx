"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { Close } from "./Icons";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Replaces the default title header (e.g. a coloured hero). */
  hero?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/** Centered modal on desktop, bottom sheet on mobile. */
export function Sheet({ open, onClose, title, hero, children, footer, wide }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      "input, textarea, select, button:not(.sheet-close)"
    );
    (focusable ?? panelRef.current)?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="sheet-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}>
      <div
        ref={panelRef}
        className={`sheet${wide ? " wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}>
        <div className="sheet-handle" />
        {hero ?? (
          <div className="sheet-hero">
            <h2 id={titleId} className="card-title" style={{ fontSize: 20, fontWeight: 500 }}>
              {title}
            </h2>
          </div>
        )}
        <button type="button" className="icon-btn sm sheet-close" onClick={onClose} aria-label="Close">
          <Close size={16} />
        </button>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>
  );
}
