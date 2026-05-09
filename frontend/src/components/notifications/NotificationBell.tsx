// =============================================================================
// AEROFINDER Frontend — Campana de notificaciones con badge y dropdown
// Se integra en el sidebar. Muestra las últimas notificaciones con scroll.
// =============================================================================

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotificationsStore } from "@/store/notifications";

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  warning:  "bg-amber-400",
  info:     "bg-blue-400",
};

export function NotificationBell() {
  const router      = useRouter();
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const items       = useNotificationsStore((s) => s.items);
  const markAsRead  = useNotificationsStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationsStore((s) => s.markAllAsRead);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al hacer click fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleItemClick(item: typeof items[0]) {
    markAsRead(item.id);
    if (item.missionId) {
      router.push(`/dashboard/missions/${item.missionId}`);
    } else if (item.type === "alert") {
      router.push("/dashboard/alerts");
    }
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center rounded-lg p-2 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
        aria-label="Notificaciones"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Badge de conteo */}
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-lg border border-gray-700 bg-gray-800 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-700 px-3 py-2">
            <span className="text-xs font-semibold text-gray-300">
              Notificaciones {unreadCount > 0 && `(${unreadCount})`}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-[10px] text-blue-400 hover:text-blue-300"
              >
                Marcar todas leídas
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="max-h-64 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-500">
                Sin notificaciones
              </div>
            ) : (
              items.slice(0, 15).map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-gray-700 ${
                    item.read ? "opacity-60" : ""
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      SEVERITY_DOT[item.severity] ?? "bg-gray-400"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-gray-200">
                      {item.title}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-gray-400">
                      {item.message}
                    </p>
                    <p className="mt-0.5 text-[10px] text-gray-500">
                      {new Date(item.timestamp).toLocaleTimeString("es-BO", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {!item.read && (
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="border-t border-gray-700 px-3 py-2">
              <button
                onClick={() => {
                  router.push("/dashboard/alerts");
                  setOpen(false);
                }}
                className="w-full text-center text-[10px] font-medium text-blue-400 hover:text-blue-300"
              >
                Ver todas las alertas
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
