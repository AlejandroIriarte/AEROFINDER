// =============================================================================
// AEROFINDER — Super Admin / Usuarios
// Gestión completa de usuarios del sistema.
// Admin puede cambiar roles, pero debe confirmar su contraseña antes.
// Super admin cambia roles sin confirmación.
// =============================================================================

"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { usersApi, authApi } from "@/lib/api";
import type { User, UserCreate, UserUpdate } from "@/lib/types";
import { RoleGuard } from "@/components/ui/RoleGuard";
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

// ── Modal: confirmar contraseña para cambio de rol ────────────────────────────

interface ConfirmRoleChangeProps {
  targetUser: User;
  newRoleId:  string;
  newRoleName: string;
  onConfirmed: () => void;
  onCancel:    () => void;
}

function ConfirmRoleChangeModal({
  targetUser,
  newRoleName,
  onConfirmed,
  onCancel,
}: ConfirmRoleChangeProps) {
  const [password,  setPassword]  = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setError(null);
    try {
      await authApi.verifyPassword(password);
      onConfirmed();
    } catch {
      setError("Contraseña incorrecta. Inténtalo de nuevo.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-amber-200 bg-white shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Confirmar cambio de rol</h3>
            <p className="text-xs text-amber-600 font-medium">Se requiere tu contraseña</p>
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-xs text-gray-700">
          Cambiando rol de <span className="font-semibold">{targetUser.full_name}</span> a{" "}
          <span className="font-semibold text-blue-700">{newRoleName}</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">Tu contraseña actual</label>
            <input
              required
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="Ingresa tu contraseña"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-100 px-3 py-2 text-xs text-red-700">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={verifying}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={verifying || !password}
              className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
            >
              {verifying ? "Verificando…" : "Confirmar cambio"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function UsersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const isSuperAdmin = currentUser?.role === "super_admin";

  const [users,  setUsers]  = useState<User[]>([]);
  const [roles,  setRoles]  = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Modal crear
  const [showCreate, setShowCreate] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [form, setForm] = useState<UserCreate>({
    email: "", password: "", full_name: "", phone: "", role_id: "",
  });

  // Modal editar nombre/teléfono
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editForm,   setEditForm]   = useState<Pick<UserUpdate, "full_name" | "phone">>({ full_name: "", phone: "" });
  const [editSaving, setEditSaving] = useState(false);

  // Confirmación de contraseña para cambio de rol (solo admin)
  const [roleChangeTarget, setRoleChangeTarget] = useState<{
    user: User;
    newRoleId: string;
    newRoleName: string;
  } | null>(null);

  // Desactivar
  const [deactivating, setDeactivating] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([usersApi.list(), usersApi.listRoles()])
      .then(([u, r]) => {
        setUsers(u);
        setRoles(r);
        if (r.length > 0) setForm((f) => ({ ...f, role_id: r[0].id }));
      })
      .catch(() => setError("Error al cargar usuarios"))
      .finally(() => setLoading(false));
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function applyRoleChange(userId: string, roleId: string) {
    try {
      const updated = await usersApi.update(userId, { role_id: roleId });
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    } catch {
      alert("Error al cambiar rol");
    }
  }

  function handleRoleChange(user: User, newRoleId: string) {
    const newRole = roles.find((r) => r.id === newRoleId);
    if (!newRole) return;

    if (isSuperAdmin) {
      // Super admin: cambio directo, sin confirmación
      applyRoleChange(user.id, newRoleId);
    } else {
      // Admin: requiere confirmar contraseña
      setRoleChangeTarget({ user, newRoleId, newRoleName: newRole.name });
    }
  }

  async function handleToggleActive(user: User) {
    try {
      const updated = await usersApi.update(user.id, { is_active: !user.is_active });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
    } catch {
      alert("Error al actualizar usuario");
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
        phone:     editForm.phone || undefined,
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
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_active: false } : u)));
    } catch {
      alert("Error al desactivar usuario");
    } finally {
      setDeactivating(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <RoleGuard allowedRoles={["super_admin", "admin"]}>
      {/* Modal confirmación de contraseña para cambio de rol */}
      {roleChangeTarget && (
        <ConfirmRoleChangeModal
          targetUser={roleChangeTarget.user}
          newRoleId={roleChangeTarget.newRoleId}
          newRoleName={roleChangeTarget.newRoleName}
          onConfirmed={() => {
            applyRoleChange(roleChangeTarget.user.id, roleChangeTarget.newRoleId);
            setRoleChangeTarget(null);
          }}
          onCancel={() => setRoleChangeTarget(null)}
        />
      )}

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

        {!isSuperAdmin && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-center gap-2 text-xs text-amber-700">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Los cambios de rol requieren confirmar tu contraseña.
          </div>
        )}

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
                  <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    Rol {!isSuperAdmin && <span className="text-amber-500">🔒</span>}
                  </th>
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
                        <button
                          onClick={() => openEdit(user)}
                          title="Editar nombre y teléfono"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-colors"
                        >
                          <IconPencil />
                        </button>
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

        {/* ── Modal: Crear usuario ─────────────────────────────────────────── */}
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

        {/* ── Modal: Editar nombre y teléfono ─────────────────────────────── */}
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
    </RoleGuard>
  );
}
