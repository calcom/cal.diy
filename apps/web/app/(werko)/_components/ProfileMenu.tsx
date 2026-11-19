"use client";

import { FOCUS_RING } from "@devx-agency/werko-ui/styles";
import { useEffect, useId, useRef, useState } from "react";
import { copy } from "../_lib/copy";

type ProfileMenuProps = {
  name: string;
  email: string;
};

const initials = (name: string, email: string) => {
  const words = (name || email).split(/[\s@._-]+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
};

export default function ProfileMenu({ name, email }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !rootRef.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={copy.profile.open}
        onClick={() => setOpen(!open)}
        className={`relative isolate flex size-12 shrink-0 cursor-pointer items-center justify-center font-semibold text-deep-blue text-s transition-[filter] duration-150 before:absolute before:inset-0 before:-z-10 before:bg-neon-green before:clip-chamfer before:transition-[clip-path,background-color] before:duration-150 hover:drop-shadow-glow hover:before:bg-neon-green-bold hover:before:clip-chamfer-alt ${FOCUS_RING}`}>
        {initials(name, email)}
      </button>

      {open && (
        <div
          id={menuId}
          className="absolute top-full right-0 z-50 mt-3 flex w-72 flex-col border border-white/15 bg-deep-blue-green text-white shadow-header">
          <div className="flex flex-col gap-1 border-white/15 border-b px-5 py-4">
            <p className="font-semibold text-s">{name || email}</p>
            {name && <p className="text-white/70 text-werko-xs">{email}</p>}
          </div>
          <a href="/rezervace" className={`px-5 py-3 text-s hover:bg-white/10 ${FOCUS_RING}`}>
            {copy.profile.newBooking}
          </a>
          <a href="/moje-rezervace" className={`px-5 py-3 text-s hover:bg-white/10 ${FOCUS_RING}`}>
            {copy.profile.bookings}
          </a>
          <a
            href={`/api/authentik-logout?callbackUrl=${encodeURIComponent("/rezervace")}`}
            className={`px-5 py-3 text-neon-green text-s hover:bg-white/10 hover:text-neon-green-bold ${FOCUS_RING}`}>
            {copy.profile.logout}
          </a>
        </div>
      )}
    </div>
  );
}
