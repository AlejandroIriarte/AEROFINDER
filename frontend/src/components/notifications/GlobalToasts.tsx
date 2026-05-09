// =============================================================================
// AEROFINDER Frontend — Toast global con auto-dismiss
// Lee del store de notificaciones y renderiza toasts flotantes.
// =============================================================================

"use client";

import { useEffect } from "react";
import { useNotificationsStore } from "@/store/notifications";

const TYPE_STYLE: Record<string, { bg: string; border: string; icon: string }> = {
  success:  { bg: "bg-green-50",  border: "border-green-300", icon: "text-green-600" },
  error:    { bg: "bg-red-50",    border: "border-red-300",   icon: "text-red-600"   },
  warning:  { bg: "bg-amber-50",  border: "border-amber-300", icon: "text-amber-600" },
  info:     { bg: "bg-blue-50",   border: "border-blue-300",  icon: "text-blue-600"  },
};

function ToastIcon({ type }: { type: string }) {
  const cls = `h-5 w-5 ${TYPE_STYLE[type]?.icon ?? "text-gray-600"}`;
  if (type === "success") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (type === "error") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  if (type === "warning") {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  }
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ToastCard({ id, type, title, message }: {
  id: string; type: string; title: string; message?: string;
}) {
  const removeToast = useNotificationsStore((s) => s.removeToast);
  const style = TYPE_STYLE[type] ?? TYPE_STYLE.info;

  // Auto-dismiss en 5 segundos
  useEffect(() => {
    const timer = setTimeout(() => removeToast(id), 5_000);
    return () => clearTimeout(timer);
  }, [id, removeToast]);

  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border ${style.bg} ${style.border} px-4 py-3 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200`}
      role="alert"
    >
      <ToastIcon type={type} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        {message && <p className="mt-0.5 text-xs text-gray-600">{message}</p>}
      </div>
      <button
        onClick={() => removeToast(id)}
        className="shrink-0 text-gray-400 hover:text-gray-600"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function GlobalToasts() {
  const toasts = useNotificationsStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-[9999] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} {...t} />
      ))}
    </div>
  );
}
