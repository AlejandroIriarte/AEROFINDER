// =============================================================================
// AEROFINDER Frontend — Topbar de navegación
// Breadcrumb, rol chip, campana de notificaciones, avatar del usuario
// =============================================================================

"use client";

import { useEffect, useRef, useState } from "react";
import { RoleName } from "@/lib/types";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useAuthStore } from "@/store/auth";

interface TopbarProps {
  breadcrumb: string;
  role: RoleName;
  userName: string;
  onToggleSidebar: () => void;
}

// Mapa de colores por rol
const ROLE_STYLES: Record<RoleName, { bg: string; text: string; label: string }> = {
  super_admin: {
    bg: "bg-red-100",
    text: "text-red-700",
    label: "Super Admin",
  },
  admin: {
    bg: "bg-violet-100",
    text: "text-violet-700",
    label: "Admin",
  },
  buscador: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    label: "Buscador",
  },
  ayudante: {
    bg: "bg-green-100",
    text: "text-green-700",
    label: "Ayudante",
  },
  familiar: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    label: "Familiar",
  },
};

// Extraer iniciales del nombre
function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Topbar({
  breadcrumb,
  role,
  userName,
  onToggleSidebar,
}: TopbarProps) {
  const roleStyle  = ROLE_STYLES[role];
  const initials   = getInitials(userName);
  const logout     = useAuthStore((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="flex h-[52px] items-center border-b border-slate-200 bg-white px-4 gap-4">
      {/* Logo button — drone SVG */}
      <button
        onClick={onToggleSidebar}
        className="flex items-center justify-center flex-shrink-0 h-[34px] w-[34px] bg-blue-600 rounded-lg text-white hover:bg-blue-700 transition-colors"
        aria-label="Toggle sidebar"
      >
        <svg
          viewBox="0 0 24 24"
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M5 5l3 3M19 5l-3 3M5 19l3-3M19 19l-3-3" />
          <circle cx="5" cy="5" r="2" />
          <circle cx="19" cy="5" r="2" />
          <circle cx="5" cy="19" r="2" />
          <circle cx="19" cy="19" r="2" />
        </svg>
      </button>

      {/* Vertical divider */}
      <div className="h-7 w-px bg-slate-200" aria-hidden="true" />

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm min-w-0">
        <span className="hidden sm:inline text-slate-500">Dashboard</span>
        <span className="hidden sm:inline text-slate-300">/</span>
        <span className="font-semibold text-slate-900 truncate">{breadcrumb}</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Role chip */}
      <div className={`hidden sm:block ${roleStyle.bg} ${roleStyle.text} px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap`}>
        {roleStyle.label}
      </div>

      {/* NotificationBell — only if role !== "familiar" */}
      {role !== "familiar" && <NotificationBell />}

      {/* Avatar con dropdown */}
      <div ref={ref} className="relative flex-shrink-0">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-center w-8 h-8 bg-blue-600 text-white rounded-full text-xs font-semibold hover:bg-blue-700 transition-colors"
          aria-label={userName}
          title={userName}
        >
          {initials || "U"}
        </button>

        {open && (
          <div className="absolute right-0 top-10 z-50 w-48 rounded-xl border border-slate-200 bg-white shadow-lg py-1">
            <div className="px-3 py-2 border-b border-slate-100">
              <p className="text-[12px] font-semibold text-slate-800 truncate">{userName}</p>
              <p className={`text-[11px] font-medium ${roleStyle.text}`}>{roleStyle.label}</p>
            </div>
            <button
              onClick={() => { setOpen(false); logout(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-red-500 hover:bg-red-50 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
