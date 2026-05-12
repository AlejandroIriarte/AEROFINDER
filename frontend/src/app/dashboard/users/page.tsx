// Gestión de usuarios. Solo admin.
// Tabla con teléfono, toggle activo, cambio de rol, edición de nombre/teléfono y desactivación.
"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { usersApi } from "@/lib/api";
import type { User, UserCreate, UserUpdate } from "@/lib/types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/dashboard/PageHeader";

// ── Íconos inline ─────────────────────────────────────────────────────────────

function IconPencil() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function IconBan() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10"/>
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
    </svg>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function UsersPage() {
  const currentUser = useAuthStore((s) => s.user);

  const [users, setUsers]           = useState<User[]>([]);
  const [roles, setRoles]           = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Modal crear
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [form, setForm] = useState<UserCreate>({
    email: "", password: "", full_name: "", phone: "", role_id: "",
  });

  // Modal editar
  const [editTarget, setEditTarget]   = useState<User | null>(null);
  const [editForm, setEditForm]       = useState<Pick<UserUpdate, "full_name" | "phone">>({ full_name: "", phone: "" });
  const [editSaving, setEditSaving]   = useState(false);

  // Desactivar
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const isAdmin = currentUser?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([usersApi.list(), usersApi.listRoles()])
      .then(([u, r]) => {
        setUsers(u);
        setRoles(r);
        if (r.length > 0) setForm((f) => ({ ...f, role_id: r[0].id }));
      })
      .catch(() => setError("Error al cargar usuarios"))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="p-5">
        <PageHeader title="Usuarios" />
        <p className="text-[12px] text-slate-400">Acceso restringido a administradores</p>
      </div>
    );
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleToggleActive(user: User) {
    try {
      const updated = await usersApi.update(user.id, { is_active: !user.is_active });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
    } catch {
      alert("Error al actualizar usuario");
    }
  }

  async function handleRoleChange(user: User, role_id: string) {
    try {
      const updated = await usersApi.update(user.id, { role_id });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
    } catch {
      alert("Error al cambiar rol");
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.password || !form.full_name || !form.role_id) return;
    setSaving(true);
    try {
      const created = await usersApi.create(form);
      setUsers((prev) => [...prev, created]);
      setShowCreate(false);
      setForm({ email: "", password: "", full_name: "", phone: "", role_id: roles[0]?.id ?? "" });
    } catch {
      alert("Error al crear usuario");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(user: User) {
    setEditTarget(user);
    setEditForm({ full_name: user.full_name, phone: user.phone ?? "" });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditSaving(true);
    try {
      const updated = await usersApi.update(editTarget.id, {
        full_name: editForm.full_name,
        phone: editForm.phone || undefined,
      });
      setUsers((prev) => prev.map((u) => (u.id === editTarget.id ? updated : u)));
      setEditTarget(null);
    } catch {
      alert("Error al guardar cambios");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeactivate(user: User) {
    if (!confirm(`¿Desactivar a ${user.full_name}? El usuario no podrá iniciar sesión.`)) return;
    setDeactivating(user.id);
    try {
      await usersApi.deactivate(user.id);
      // Soft-delete: marcamos inactivo localmente en vez de quitar de la lista
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_active: false } : u)));
    } catch {
      alert("Error al desactivar usuario");
    } finally {
      setDeactivating(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-5">
      <PageHeader
        title="Usuarios"
        subtitle={`${users.length} usuarios en el sistema`}
      >
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 stroke-white fill-none" strokeWidth={2.5}>
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Nuevo usuario
        </button>
      </PageHeader>

      {loading && <LoadingSpinner />}

      {!loading && error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && users.length === 0 && (
        <EmptyState title="Sin usuarios" description="Crea el primer usuario del sistema." />
      )}

      {!loading && !error && users.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-[12px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Nombre</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Email</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Teléfono</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Rol</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Estado</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Último acceso</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{user.full_name}</td>
                  <td className="px-4 py-3 text-slate-500">{user.email}</td>
                  <td className="px-4 py-3 text-slate-400">{user.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={roles.find((r) => r.name === user.role)?.id ?? ""}
                      onChange={(e) => handleRoleChange(user, e.target.value)}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40"
                      disabled={user.id === currentUser?.id}
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActive(user)}
                      disabled={user.id === currentUser?.id}
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold disabled:opacity-40 transition-colors ${
                        user.is_active
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-red-100 text-red-600 hover:bg-red-200"
                      }`}
                    >
                      {user.is_active ? "Activo" : "Inactivo"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {user.last_login_at
                      ? new Date(user.last_login_at).toLocaleDateString("es-BO")
                      : "Nunca"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {/* Editar nombre/teléfono */}
                      <button
                        onClick={() => openEdit(user)}
                        title="Editar nombre y teléfono"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-colors"
                      >
                        <IconPencil />
                      </button>
                      {/* Desactivar */}
                      {user.id !== currentUser?.id && user.is_active && (
                        <button
                          onClick={() => handleDeactivate(user)}
                          disabled={deactivating === user.id}
                          title="Desactivar usuario"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                        >
                          <IconBan />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal: Crear usuario ────────────────────────────────────────────── */}
      <Modal open={showCreate} title="Nuevo usuario" onClose={() => setShowCreate(false)}>
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nombre completo *</label>
            <input required value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email *</label>
            <input required type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Teléfono</label>
            <input type="tel" value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+591 7xxxxxxx"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Contraseña *</label>
            <input required type="password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Rol *</label>
            <select value={form.role_id}
              onChange={(e) => setForm({ ...form, role_id: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowCreate(false)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Creando…" : "Crear usuario"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Editar nombre y teléfono ────────────────────────────────── */}
      <Modal
        open={editTarget !== null}
        title={`Editar — ${editTarget?.full_name ?? ""}`}
        onClose={() => setEditTarget(null)}
      >
        <form onSubmit={handleEdit} className="space-y-3">
          <p className="text-[11px] text-slate-400">
            Los cambios quedan registrados en el log de auditoría del sistema.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nombre completo *</label>
            <input required value={editForm.full_name}
              onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Teléfono</label>
            <input type="tel" value={editForm.phone ?? ""}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              placeholder="+591 7xxxxxxx"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditTarget(null)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={editSaving}
              className="rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {editSaving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
