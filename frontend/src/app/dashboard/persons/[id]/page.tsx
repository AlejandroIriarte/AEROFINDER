// =============================================================================
// AEROFINDER — Detalle de persona desaparecida (adaptado por rol)
//
// admin/buscador : info completa + fotos + detecciones GPS + misiones vinculadas
// ayudante       : info + fotos (aprobar/rechazar) + detecciones sin GPS
// familiar       : su propio caso + subir fotos + estado prominente
// =============================================================================

"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { personsApi, photosApi, detectionsApi, missionsApi } from "@/lib/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type {
  MissingPerson,
  PhotoResponse,
  Detection,
  Mission,
  RoleName,
  PhotoFaceAngle,
} from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-BO", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtConf(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

const FACE_ANGLE_LABEL: Record<PhotoFaceAngle, string> = {
  frontal:       "Frontal",
  profile:       "Perfil",
  three_quarter: "3/4",
  unknown:       "Sin especificar",
};

const PERSON_STATUS_LABEL: Record<string, string> = {
  pending_review:  "En revisión",
  active:          "Búsqueda activa",
  found_alive:     "Encontrado vivo",
  found_deceased:  "Encontrado fallecido",
  false_report:    "Falsa alarma",
  archived:        "Archivado",
};

// ── Sección de información básica ─────────────────────────────────────────────

function InfoSection({ person }: { person: MissingPerson }) {
  const rows: [string, string][] = [
    ["Fecha desaparición", fmt(person.disappeared_at)],
    ["Última vez visto", fmt(person.last_seen_at)],
    ["Edad al desaparecer", person.age_at_disappearance ? `${person.age_at_disappearance} años` : "—"],
    ["Género", person.gender ?? "—"],
    ["Última ubicación", person.last_known_location ?? "—"],
    ["Descripción física", person.physical_description ?? "—"],
    ["Reportado por", person.reporter_name ?? "—"],
    ["Contacto", person.reporter_contact ?? "—"],
    ["Registrado", fmt(person.created_at)],
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Datos del caso
      </h2>
      <dl className="space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col sm:flex-row sm:gap-4 text-sm">
            <dt className="font-medium text-gray-400 sm:w-40 sm:shrink-0 sm:text-gray-500 text-xs sm:text-sm">{label}</dt>
            <dd className="text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ── Sección de fotos ──────────────────────────────────────────────────────────

interface PhotosSectionProps {
  personId: string;
  photos:   PhotoResponse[];
  role:     RoleName;
  onPhotoUpdated: () => void;
}

function PhotosSection({ personId, photos, role, onPhotoUpdated }: PhotosSectionProps) {
  const [uploading, setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedAngle, setSelectedAngle] = useState<PhotoFaceAngle>("frontal");

  const canUpload  = role === "familiar" || role === "admin" || role === "buscador";
  const canApprove = role === "admin" || role === "ayudante";

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    try {
      // Paso 1: solicitar URL firmada
      const { upload_url, photo_id } = await photosApi.requestUploadUrl(personId, selectedAngle);

      // Paso 2: subir directo a MinIO
      const res = await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!res.ok) throw new Error("Error al subir la imagen");

      // Paso 3: confirmar en el backend
      await photosApi.confirm(personId, photo_id);
      onPhotoUpdated();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleToggleActive(photo: PhotoResponse) {
    try {
      await photosApi.patch(personId, photo.id, !photo.is_active);
      onPhotoUpdated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cambiar estado de foto";
      setUploadError(msg);
    }
  }

  const activePhotos   = photos.filter((p) => p.is_active);
  const pendingPhotos  = photos.filter((p) => !p.is_active);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Fotos de referencia
        </h2>
        {canUpload && (
          <div className="flex items-center gap-2">
            <select
              value={selectedAngle}
              onChange={(e) => setSelectedAngle(e.target.value as PhotoFaceAngle)}
              className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700"
            >
              {(Object.keys(FACE_ANGLE_LABEL) as PhotoFaceAngle[]).map((angle) => (
                <option key={angle} value={angle}>{FACE_ANGLE_LABEL[angle]}</option>
              ))}
            </select>
            <label className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition ${uploading ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}>
              {uploading ? "Subiendo…" : "+ Subir foto"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploading}
                onChange={handleFileChange}
              />
            </label>
          </div>
        )}
      </div>

      {uploadError && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{uploadError}</p>
      )}

      {role === "familiar" && (
        <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
          Las fotos son revisadas por el equipo antes de ser usadas en la búsqueda con IA.
        </p>
      )}

      {photos.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          {canUpload ? "Aún no hay fotos — subí una para activar la búsqueda con IA." : "Sin fotos de referencia."}
        </p>
      ) : (
        <div className="space-y-4">
          {activePhotos.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-green-700">Activas ({activePhotos.length})</p>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {activePhotos.map((photo) => (
                  <PhotoTile
                    key={photo.id}
                    photo={photo}
                    canApprove={canApprove}
                    onToggle={() => handleToggleActive(photo)}
                  />
                ))}
              </div>
            </div>
          )}

          {pendingPhotos.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-amber-700">
                Pendientes de aprobación ({pendingPhotos.length})
              </p>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {pendingPhotos.map((photo) => (
                  <PhotoTile
                    key={photo.id}
                    photo={photo}
                    canApprove={canApprove}
                    pending
                    onToggle={() => handleToggleActive(photo)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PhotoTile({
  photo, canApprove, pending, onToggle,
}: {
  photo: PhotoResponse;
  canApprove: boolean;
  pending?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`relative overflow-hidden rounded-lg border ${pending ? "border-amber-300" : "border-gray-200"} bg-gray-50`}>
      {photo.view_url ? (
        <img src={photo.view_url} alt="Foto" className="aspect-square w-full object-cover" />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-gray-100 text-gray-400 text-xs">
          Sin vista previa
        </div>
      )}
      <div className="p-1.5">
        <p className="truncate text-[10px] text-gray-500">{FACE_ANGLE_LABEL[photo.face_angle]}</p>
        {canApprove && pending && (
          <button
            onClick={onToggle}
            className="mt-1 w-full rounded bg-green-600 py-0.5 text-[10px] font-semibold text-white hover:bg-green-700"
          >
            Aprobar
          </button>
        )}
        {photo.has_embedding && (
          <span className="mt-0.5 block text-center text-[9px] font-medium text-blue-600">IA activa</span>
        )}
      </div>
    </div>
  );
}

// ── Sección de detecciones (admin/buscador/ayudante) ──────────────────────────

function DetectionsSection({
  detections, role,
}: {
  detections: Detection[];
  role: RoleName;
}) {
  const showGps = role === "admin" || role === "buscador";

  if (detections.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Detecciones IA
        </h2>
        <p className="py-4 text-center text-sm text-gray-400">
          Sin detecciones registradas aún.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Detecciones IA ({detections.length})
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500">
              <th className="pb-2 pr-4">Fecha</th>
              <th className="pb-2 pr-4">Confianza YOLO</th>
              <th className="pb-2 pr-4">Similitud facial</th>
              {showGps && <th className="pb-2 pr-4">GPS</th>}
              <th className="pb-2">Revisado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {detections.slice(0, 20).map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="py-2 pr-4 text-gray-600">
                  {new Date(d.frame_timestamp).toLocaleString("es-BO", {
                    dateStyle: "short", timeStyle: "short",
                  })}
                </td>
                <td className="py-2 pr-4">
                  <span className={`font-semibold ${d.yolo_confidence > 0.7 ? "text-green-700" : "text-amber-700"}`}>
                    {fmtConf(d.yolo_confidence)}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  <span className={`font-semibold ${d.facenet_similarity > 0.75 ? "text-green-700" : "text-amber-700"}`}>
                    {fmtConf(d.facenet_similarity)}
                  </span>
                </td>
                {showGps && (
                  <td className="py-2 pr-4 font-mono text-xs text-gray-500">
                    {d.gps_latitude != null
                      ? `${d.gps_latitude.toFixed(5)}, ${d.gps_longitude!.toFixed(5)}`
                      : "—"}
                  </td>
                )}
                <td className="py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${d.is_reviewed ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {d.is_reviewed ? "Revisado" : "Pendiente"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {detections.length > 20 && (
          <p className="mt-2 text-right text-xs text-gray-400">
            Mostrando 20 de {detections.length}.{" "}
            <Link href="/dashboard/detections" className="text-blue-600 hover:underline">
              Ver todas las detecciones
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

// ── Sección de misiones vinculadas (admin/buscador) ───────────────────────────

function MissionsSection({ missions }: { missions: Mission[] }) {
  if (missions.length === 0) return null;

  const STATUS_COLOR: Record<string, string> = {
    planned:     "bg-yellow-100 text-yellow-700",
    active:      "bg-green-100  text-green-700",
    paused:      "bg-orange-100 text-orange-700",
    completed:   "bg-blue-100   text-blue-700",
    interrupted: "bg-red-100    text-red-700",
    cancelled:   "bg-gray-100   text-gray-500",
  };

  const STATUS_LABEL: Record<string, string> = {
    planned: "Planificada", active: "Activa", paused: "Pausada",
    completed: "Completada", interrupted: "Interrumpida", cancelled: "Cancelada",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Misiones de búsqueda ({missions.length})
      </h2>
      <ul className="divide-y divide-gray-100">
        {missions.map((m) => (
          <li key={m.id} className="flex items-center justify-between py-3">
            <div>
              <Link
                href={`/dashboard/missions/${m.id}`}
                className="text-sm font-medium text-blue-700 hover:underline"
              >
                {m.name}
              </Link>
              <p className="text-xs text-gray-400">
                Inicio: {fmt(m.started_at)} — Fin: {fmt(m.completed_at)}
              </p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[m.status]}`}>
              {STATUS_LABEL[m.status]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function PersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const user    = useAuthStore((s) => s.user);

  const [person,     setPerson]     = useState<MissingPerson | null>(null);
  const [photos,     setPhotos]     = useState<PhotoResponse[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [missions,   setMissions]   = useState<Mission[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  const role = user?.role as RoleName | undefined;
  const showDetections = role === "admin" || role === "buscador" || role === "ayudante";
  const showMissions   = role === "admin" || role === "buscador";

  const loadPhotos = useCallback(async () => {
    try {
      const data = await photosApi.list(id);
      setPhotos(data);
    } catch {
      // silencioso: fotos son complementarias
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;

    async function load() {
      try {
        // Carga persona y fotos siempre
        const [personData] = await Promise.all([
          personsApi.get(id),
          loadPhotos(),
        ]);
        setPerson(personData);

        // Detecciones y misiones solo para roles que las necesitan
        if (showDetections) {
          detectionsApi
            .list({ missing_person_id: id, limit: 50 })
            .then(setDetections)
            .catch(() => {});
        }
        if (showMissions) {
          missionsApi
            .list()
            .then((all) => setMissions(all.filter((m) => m.missing_person_id === id)))
            .catch(() => {});
        }
      } catch (err) {
        setError("No se pudo cargar el caso. Verificá que tenés acceso.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, showDetections, showMissions, loadPhotos]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-sm text-red-600">{error ?? "Caso no encontrado."}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 text-sm text-blue-600 hover:underline"
        >
          Volver
        </button>
      </div>
    );
  }

  // ── Banner de estado para familiar ──────────────────────────────────────────
  const statusBannerColor: Record<string, string> = {
    pending_review: "bg-yellow-50 border-yellow-200 text-yellow-800",
    active:         "bg-blue-50   border-blue-200   text-blue-800",
    found_alive:    "bg-green-50  border-green-200  text-green-800",
    found_deceased: "bg-gray-50   border-gray-200   text-gray-700",
    false_report:   "bg-red-50    border-red-200    text-red-700",
    archived:       "bg-slate-50  border-slate-200  text-slate-600",
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">

      {/* ── Cabecera ── */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => router.back()}
            className="mb-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
          >
            ← Volver
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{person.full_name}</h1>
          <div className="mt-2 flex items-center gap-3">
            <StatusBadge value={person.status} domain="person" />
            {person.age_at_disappearance && (
              <span className="text-sm text-gray-500">{person.age_at_disappearance} años</span>
            )}
          </div>
        </div>

        {/* Acciones de cambio de estado (admin/ayudante) */}
        {(role === "admin" || role === "ayudante") && person.status === "pending_review" && (
          <button
            onClick={async () => {
              await personsApi.approve(person.id);
              setPerson((p) => p ? { ...p, status: "active" } : p);
            }}
            className="shrink-0 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Aprobar caso
          </button>
        )}
      </div>

      {/* Banner de estado prominente para familiar */}
      {role === "familiar" && (
        <div className={`mb-6 rounded-xl border px-5 py-4 ${statusBannerColor[person.status] ?? statusBannerColor.pending_review}`}>
          <p className="text-sm font-semibold">
            Estado actual: {PERSON_STATUS_LABEL[person.status] ?? person.status}
          </p>
          {person.status === "pending_review" && (
            <p className="mt-1 text-xs opacity-80">
              Tu reporte está siendo revisado. Te notificaremos cuando se active la búsqueda.
            </p>
          )}
          {person.status === "active" && (
            <p className="mt-1 text-xs opacity-80">
              La búsqueda está activa. Recibirás notificaciones si se detecta una coincidencia.
            </p>
          )}
          {(person.status === "found_alive" || person.status === "found_deceased") && (
            <p className="mt-1 text-xs opacity-80">
              Caso cerrado. Contactá al equipo si necesitás más información.
            </p>
          )}
        </div>
      )}

      {/* ── Contenido principal ── */}
      <div className="space-y-6">

        {/* Info básica: todos los roles */}
        <InfoSection person={person} />

        {/* Fotos: todos los roles (diferente capacidad de acción) */}
        <PhotosSection
          personId={person.id}
          photos={photos}
          role={role ?? "familiar"}
          onPhotoUpdated={loadPhotos}
        />

        {/* Misiones: admin/buscador */}
        {showMissions && <MissionsSection missions={missions} />}

        {/* Detecciones: admin/buscador/ayudante */}
        {showDetections && (
          <DetectionsSection detections={detections} role={role!} />
        )}
      </div>
    </div>
  );
}
