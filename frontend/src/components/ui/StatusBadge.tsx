// Badge de estado con colores por dominio (misión, dron, persona, alerta)

interface StatusBadgeProps {
  value: string;
  domain: "mission" | "drone" | "person" | "alert";
  pulse?: boolean; // punto verde pulsante para estados activos
}

const COLORS: Record<string, Record<string, string>> = {
  mission: {
    planned:     "bg-gray-100 text-gray-600",
    active:      "bg-green-100 text-green-700",
    paused:      "bg-amber-100 text-amber-700",
    completed:   "bg-blue-100 text-blue-700",
    interrupted: "bg-orange-100 text-orange-700",
    cancelled:   "bg-red-100 text-red-600",
  },
  drone: {
    available:      "bg-green-100 text-green-700",
    in_mission:     "bg-blue-100 text-blue-700",
    maintenance:    "bg-amber-100 text-amber-700",
    out_of_service: "bg-red-100 text-red-600",
  },
  person: {
    pending_review:   "bg-amber-100 text-amber-700",
    active:           "bg-blue-100 text-blue-700",
    found_alive:      "bg-green-100 text-green-700",
    found_deceased:   "bg-gray-200 text-gray-600",
    false_report:     "bg-red-100 text-red-600",
    archived:         "bg-gray-100 text-gray-500",
  },
  alert: {
    full:              "bg-red-100 text-red-700",
    partial:           "bg-orange-100 text-orange-700",
    confirmation_only: "bg-amber-100 text-amber-700",
  },
};

const LABELS: Record<string, Record<string, string>> = {
  mission: {
    planned:     "Planificada",
    active:      "Activa",
    paused:      "Pausada",
    completed:   "Completada",
    interrupted: "Interrumpida",
    cancelled:   "Cancelada",
  },
  drone: {
    available:      "Disponible",
    in_mission:     "En misión",
    maintenance:    "Mantenimiento",
    out_of_service: "Fuera de servicio",
  },
  person: {
    pending_review:   "Pendiente revisión",
    active:           "Activa",
    found_alive:      "Encontrada viva",
    found_deceased:   "Encontrada fallecida",
    false_report:     "Reporte falso",
    archived:         "Archivada",
  },
  alert: {
    full:              "Coincidencia confirmada",
    partial:           "Coincidencia probable",
    confirmation_only: "Posible coincidencia",
  },
};

export function StatusBadge({ value, domain, pulse = false }: StatusBadgeProps) {
  const colorClass = COLORS[domain]?.[value] ?? "bg-gray-100 text-gray-600";
  const label = LABELS[domain]?.[value] ?? value.replace(/_/g, " ");
  const isActive = value === "active";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}>
      {pulse && isActive && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
      )}
      {label}
    </span>
  );
}
