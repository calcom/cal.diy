"use client";

import { Check, Phone } from "../Icons";
import { BOOKING_STYLE, CATEGORIES, CATEGORY_ORDER } from "@/lib/categories";
import type { CategoryId } from "@/lib/types";

interface CategoryFiltersProps {
  hidden: Set<CategoryId | "calls">;
  onToggle: (id: CategoryId | "calls") => void;
  onQuickAdd: (id: CategoryId) => void;
}

export function CategoryFilters({ hidden, onToggle, onQuickAdd }: CategoryFiltersProps) {
  return (
    <div className="filter-list">
      {CATEGORY_ORDER.map((id) => {
        const c = CATEGORIES[id];
        const visible = !hidden.has(id);
        return (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              className="filter-item"
              style={{ flex: 1 }}
              aria-pressed={visible}
              onClick={() => onToggle(id)}
              title={visible ? `Hide ${c.label}` : `Show ${c.label}`}>
              <span className="swatch" style={{ background: c.fill, color: c.ink }}>
                {visible && <Check size={12} strokeWidth={2.6} />}
              </span>
              {c.label}
              {id === "free" && <span className="team-badge">team sees</span>}
            </button>
            <button
              type="button"
              className="icon-btn sm"
              style={{ width: 28, height: 28, fontSize: 16 }}
              aria-label={`Add ${c.label} block`}
              onClick={() => onQuickAdd(id)}>
              +
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="filter-item"
        aria-pressed={!hidden.has("calls")}
        onClick={() => onToggle("calls")}>
        <span className="swatch" style={{ background: BOOKING_STYLE.fill, color: BOOKING_STYLE.ink }}>
          {hidden.has("calls") ? null : <Phone size={11} />}
        </span>
        Booked calls
      </button>
    </div>
  );
}
