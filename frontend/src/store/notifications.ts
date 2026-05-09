// =============================================================================
// AEROFINDER Frontend — Store de notificaciones en tiempo real (Zustand)
// Gestiona alertas WS globales, conteo de no-leídas y cola de toasts.
// =============================================================================

"use client";

import { create } from "zustand";

export interface NotificationItem {
  id: string;
  type: "alert" | "detection" | "mission_update";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  severity: "info" | "warning" | "critical";
  // Datos originales del WS para navegación
  missionId?: string;
  detectionId?: string;
}

export interface ToastItem {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
}

interface NotificationsState {
  items: NotificationItem[];
  toasts: ToastItem[];
  unreadCount: number;

  // Acciones
  addNotification: (item: Omit<NotificationItem, "id" | "read">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  addToast: (toast: Omit<ToastItem, "id">) => void;
  removeToast: (id: string) => void;
}

let _toastCounter = 0;
let _notifCounter = 0;

export const useNotificationsStore = create<NotificationsState>((set) => ({
  items: [],
  toasts: [],
  unreadCount: 0,

  addNotification: (item) => {
    const id = `notif-${++_notifCounter}-${Date.now()}`;
    set((s) => {
      const newItem: NotificationItem = { ...item, id, read: false };
      const items = [newItem, ...s.items].slice(0, 50); // máximo 50
      return { items, unreadCount: s.unreadCount + 1 };
    });
  },

  markAsRead: (id) => {
    set((s) => {
      const items = s.items.map((i) =>
        i.id === id && !i.read ? { ...i, read: true } : i
      );
      const unreadCount = items.filter((i) => !i.read).length;
      return { items, unreadCount };
    });
  },

  markAllAsRead: () => {
    set((s) => ({
      items: s.items.map((i) => ({ ...i, read: true })),
      unreadCount: 0,
    }));
  },

  clearAll: () => {
    set({ items: [], unreadCount: 0 });
  },

  addToast: (toast) => {
    const id = `toast-${++_toastCounter}-${Date.now()}`;
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id }].slice(-5), // máximo 5 visibles
    }));
  },

  removeToast: (id) => {
    set((s) => ({
      toasts: s.toasts.filter((t) => t.id !== id),
    }));
  },
}));
