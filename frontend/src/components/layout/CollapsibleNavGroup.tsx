// =============================================================================
// AEROFINDER — CollapsibleNavGroup
// Grupo colapsable de nav para el sidebar. Estado persiste en localStorage.
// =============================================================================

"use client";

import { useState } from "react";

interface CollapsibleNavGroupProps {
  label: string;
  storageKey: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleNavGroup({
  label,
  storageKey,
  defaultOpen = true,
  children,
}: CollapsibleNavGroupProps) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const stored = localStorage.getItem(`aerofinder_nav_${storageKey}`);
    return stored !== null ? stored === "1" : defaultOpen;
  });

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      localStorage.setItem(`aerofinder_nav_${storageKey}`, next ? "1" : "0");
      return next;
    });
  };

  return (
    <div className="mb-0.5">
      <button
        onClick={toggle}
        className="flex w-full items-center gap-1 px-2 py-1.5 hover:opacity-80 transition-opacity"
      >
        <span className="flex-1 text-left text-[9px] font-semibold uppercase tracking-widest text-slate-400">
          {label}
        </span>
        <svg
          viewBox="0 0 24 24"
          className={`h-3 w-3 text-slate-300 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>
      {open && (
        <div className="flex flex-col gap-0.5 pb-1">
          {children}
        </div>
      )}
    </div>
  );
}
