// Gestión de usuarios. Solo admin. Tabla con toggle activo, cambio de rol y creación.
"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { usersApi } from "@/lib/api";
import type { User, UserCreate } from "@/lib/types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";

export default function UsersPage() {
  const currentUser = useAuthStore((s) => s.user);

  const [users, setUsers]           = useState<User[]>([]);
  const [roles, setRoles]           = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving]         = useState(false);

  const [form, setForm] = useState<UserCreate>({
    email: "",
    password: "",
    full_name: "",
    role_id: "",
  });

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
      <div className="flex h-full flex-col">
        <PageHeader title="Usuarios" />
        <div className="flex flex-1 items-center justify-center text-gray-400">
          Acceso restringido a administradores
        </div>
      </div>
    );
  }

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
      setForm({ email: "", password: "", full_name: "", role_id: roles[0]?.id ?? "" });
    } catch {
      alert("Error al crear usuario");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Usuarios"
        description={`${users.length} usuarios en el sistema`}
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            + Nuevo usuario
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {loading && <LoadingSpinner />}

        {!loading && error && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {!loading && !error && users.length === 0 && (
          <EmptyState title="Sin usuarios" description="Crea el primer usuario del sistema." />
        )}

        {!loading && !error && users.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-4 py-3 font-semibold text-gray-600">Nombre</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Email</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Rol</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Estado</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Último acceso</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{user.full_name}</td>
                    <td className="px-4 py-3 text-gray-500">{user.email}</td>
                    <td className="px-4 py-3">
                      <select
                        value={roles.find((r) => r.name === user.role)?.id ?? ""}
                        onChange={(e) => handleRoleChange(user, e.target.value)}
                        className="rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold disabled:opacity-40 ${
                          user.is_active
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-red-100 text-red-600 hover:bg-red-200"
                        }`}
                      >
                        {user.is_active ? "Activo" : "Inactivo"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {user.last_login_at
                        ? new Date(user.last_login_at).toLocaleDateString("es-BO")
                        : "Nunca"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showCreate} title="Nuevo usuario" onClose={() => setShowCreate(false)}>
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nombre completo *</label>
            <input required value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email *</label>
            <input required type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Contraseña *</label>
            <input required type="password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Rol *</label>
            <select value={form.role_id}
              onChange={(e) => setForm({ ...form, role_id: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowCreate(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Creando…" : "Crear usuario"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
