// =============================================================================
// AEROFINDER Frontend — Topbar de navegación
// Breadcrumb, rol chip, campana de notificaciones, avatar del usuario
// =============================================================================

"use client";

import { RoleName } from "@/lib/types";
import { NotificationBell } from "@/components/notifications/NotificationBell";

interface TopbarProps {
  breadcrumb: string;
  role: RoleName;
  userName: string;
  onToggleSidebar: () => void;
}

// Mapa de colores por rol
const ROLE_STYLES: Record<RoleName, { bg: string; text: string; label: string }> = {
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
  const roleStyle = ROLE_STYLES[role];
  const initials = getInitials(userName);

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

      {/* Avatar */}
      <div
        className="flex items-center justify-center w-8 h-8 bg-blue-600 text-white rounded-full text-xs font-semibold flex-shrink-0"
        aria-label={userName}
        title={userName}
      >
        {initials || "U"}
      </div>
    </div>
  );
}
