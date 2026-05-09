// =============================================================================
// AEROFINDER Frontend — Componente Toast para notificaciones
// Sistema de notificaciones (success, error, warning, info)
// =============================================================================

import React, { useEffect } from "react";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastProps {
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  onClose?: () => void;
}

const TOAST_CONFIG = {
  success: {
    bg: "bg-green-50",
    border: "border-green-200",
    icon: (
      <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
    titleColor: "text-green-900",
    messageColor: "text-green-800",
  },
  error: {
    bg: "bg-red-50",
    border: "border-red-200",
    icon: (
      <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    titleColor: "text-red-900",
    messageColor: "text-red-800",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: (
      <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4v2m0-12a9 9 0 110 18 9 9 0 010-18z" />
      </svg>
    ),
    titleColor: "text-amber-900",
    messageColor: "text-amber-800",
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: (
      <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    titleColor: "text-blue-900",
    messageColor: "text-blue-800",
  },
};

export function Toast({
  type,
  title,
  message,
  duration = 5000,
  onClose,
}: ToastProps) {
  const config = TOAST_CONFIG[type];

  useEffect(() => {
    if (duration > 0 && onClose) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  return (
    <div
      className={`rounded-lg border ${config.bg} ${config.border} p-4 shadow-lg animate-in fade-in slide-in-from-top-5 duration-200`}
      role="alert"
    >
      <div className="flex gap-3">
        <div className="flex-shrink-0">{config.icon}</div>
        <div className="flex-1">
          <h3 className={`text-sm font-medium ${config.titleColor}`}>{title}</h3>
          {message && <p className={`text-sm ${config.messageColor} mt-0.5`}>{message}</p>}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close notification"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Contenedor de toasts (típicamente colocado en el layout raíz) ────────────

interface ToastContainerProps {
  toasts: ToastProps[];
  onRemove: (index: number) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-3 max-w-md">
      {toasts.map((toast, index) => (
        <Toast key={index} {...toast} onClose={() => onRemove(index)} />
      ))}
    </div>
  );
}
