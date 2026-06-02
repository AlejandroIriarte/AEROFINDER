// =============================================================================
// AEROFINDER — Super Admin / Gestión de administradores
// Lista admins, toggle activo/inactivo, crear nuevo admin.
// =============================================================================

"use client";

import { useCallback, useEffect, useState } from "react";
import { RoleGuard } from "@/components/ui/RoleGuard";
import { superadminApi } from "@/lib/api";
import api from "@/lib/api";
import type { User } from "@/lib/types";

function RelativeTime({ iso }: { iso: string }) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(mins / 60);
  if (mins < 1)  return <span>ahora</span>;
  if (mins < 60) return <span>hace {mins} min</span>;
  if (hrs < 24)  return <span>hace {hrs} h</span>;
  return <span>hace {Math.floor(hrs / 24)} d</span>;
}

// ── Formulario crear admin ────────────────────────────────────────────────────

interface CreateAdminFormProps {
  onCreated: () => void;
  onCancel:  () => void;
}

function CreateAdminForm({ onCreated, onCancel }: CreateAdminFormProps) {
  const [form,    setForm]    = useState({ email: "", full_name: "", password: "", phone: "" });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // Obtener el role_id de admin
      const rolesRes = await api.get<{ id: string; name: string }[]>("/users/roles");
      const adminRole = rolesRes.data.find((r) => r.name === "admin");
      if (!adminRole) throw new Error("Rol admin no encontrado");

      await api.post("/users/", {
        email:     form.email,
        full_name: form.full_name,
        password:  form.password,
        phone:     form.phone || undefined,
        role_id:   adminRole.id,
      });
      onCreated();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Error al crear administrador");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-4"
    >
      <h3 className="text-sm font-semibold text-blue-800">Nuevo administrador</h3>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Nombre completo *</label>
          <input
            required
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Ej. Ana Pérez López"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Email *</label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="admin@organización.com"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Contraseña *</label>
          <input
            required
            type="password"
            minLength={8}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Mínimo 8 caracteres"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Teléfono</label>
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="+591 7xxxxxxx"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? "Creando…" : "Crear administrador"}
        </button>
      </div>
    </form>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function AdminsPage() {
  const [admins,    setAdmins]    = useState<User[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(false);
  const [toggling,  setToggling]  = useState<string | null>(null);
  const [showForm,  setShowForm]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await superadminApi.listAdmins();
      setAdmins(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (id: string, newActive: boolean) => {
    setToggling(id);
    try {
      await api.patch(`/users/${id}`, { is_active: newActive });
      setAdmins((prev) => prev.map((a) => a.id === id ? { ...a, is_active: newActive } : a));
    } catch {
      // silencioso
    } finally {
      setToggling(null);
    }
  };

  const activeCount   = admins.filter((a) => a.is_active).length;
  const inactiveCount = admins.length - activeCount;

  return (
    <RoleGuard allowedRoles={["super_admin"]}>
      <div className="p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Gestión de admins</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {activeCount} activo(s) · {inactiveCount} inactivo(s)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {loading ? "Cargando…" : "Actualizar"}
            </button>
            <button
              onClick={() => setShowForm((v) => !v)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              {showForm ? "Cancelar" : "+ Nuevo admin"}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Error al cargar administradores.
          </div>
        )}

        {/* Formulario crear */}
        {showForm && (
          <CreateAdminForm
            onCreated={() => { setShowForm(false); load(); }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* Tabla */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {admins.length === 0 && !loading ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Sin administradores registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-2.5 text-left font-semibold">Nombre</th>
                    <th className="px-4 py-2.5 text-left font-semibold hidden sm:table-cell">Email</th>
                    <th className="px-4 py-2.5 text-left font-semibold hidden md:table-cell">Último acceso</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Estado</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {admins.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                            a.is_active ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-400"
                          }`}>
                            {a.full_name.charAt(0).toUpperCase()}
                          </div>
                          <span className={`font-semibold ${a.is_active ? "text-gray-900" : "text-gray-400"}`}>
                            {a.full_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{a.email}</td>
                      <td className="px-4 py-3 text-gray-400 hidden md:table-cell">
                        {a.last_login_at ? <RelativeTime iso={a.last_login_at} /> : "nunca"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                          a.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}>
                          {a.is_active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          disabled={toggling === a.id}
                          onClick={() => handleToggle(a.id, !a.is_active)}
                          className={`rounded border px-2.5 py-1 text-[10px] font-medium transition-colors disabled:opacity-40 ${
                            a.is_active
                              ? "border-red-200 text-red-600 hover:bg-red-50"
                              : "border-green-200 text-green-700 hover:bg-green-50"
                          }`}
                        >
                          {toggling === a.id
                            ? "…"
                            : a.is_active ? "Desactivar" : "Reactivar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </RoleGuard>
  );
}
