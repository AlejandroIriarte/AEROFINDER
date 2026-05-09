// =============================================================================
// AEROFINDER Frontend — Badge de estado del stream HLS
// EN VIVO (verde), BUFFERING (amarillo), OFFLINE (rojo)
// =============================================================================

"use client";

export type StreamState = "loading" | "playing" | "buffering" | "error" | "offline";

interface StreamStatusProps {
  state: StreamState;
}

const CONFIG: Record<StreamState, { label: string; dot: string; badge: string }> = {
  loading:   { label: "CONECTANDO",  dot: "bg-amber-400 animate-pulse", badge: "bg-amber-900/60 text-amber-300" },
  playing:   { label: "EN VIVO",     dot: "bg-green-400 animate-pulse", badge: "bg-green-900/60 text-green-300" },
  buffering: { label: "BUFFERING",   dot: "bg-yellow-400 animate-pulse", badge: "bg-yellow-900/60 text-yellow-300" },
  error:     { label: "ERROR",       dot: "bg-red-400",                 badge: "bg-red-900/60 text-red-300" },
  offline:   { label: "OFFLINE",     dot: "bg-red-500",                 badge: "bg-gray-800/80 text-gray-400" },
};

export function StreamStatus({ state }: StreamStatusProps) {
  const { label, dot, badge } = CONFIG[state];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-bold tracking-wider ${badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
